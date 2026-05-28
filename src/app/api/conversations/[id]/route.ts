import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const idSchema = z.string().uuid();

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  modelId: z.string().min(1).max(64).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.pinned !== undefined) {
    update.pinned_at = parsed.data.pinned ? new Date().toISOString() : null;
  }
  if (parsed.data.modelId !== undefined) update.model_id = parsed.data.modelId;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('conversations')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // Look up the conversation to determine the caller's role.
  // RLS on `conversations` allows SELECT for owner OR member.
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isOwner = conv.user_id === user.id;

  if (isOwner) {
    // Owner: hard-delete attachments + conversation row.
    // Messages and member rows cascade away via FK.
    const prefix = `${user.id}/${params.id}/`;
    const { data: files } = await supabase.storage
      .from('attachments')
      .list(prefix, { limit: 100 });
    if (files && files.length > 0) {
      await supabase.storage
        .from('attachments')
        .remove(files.map((f) => `${prefix}${f.name}`));
    }

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'deleted' });
  }

  // Member: leave the conversation by removing their membership row.
  // The "members can leave" RLS policy permits this for non-owner roles.
  const { error: leaveErr } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', params.id)
    .eq('user_id', user.id);

  if (leaveErr) return NextResponse.json({ error: leaveErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: 'left' });
}
