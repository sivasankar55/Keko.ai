import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();
const toggleSchema = z.object({
  emoji: z.string().min(1).max(16),
});

/**
 * GET /api/messages/[id]/reactions
 * Returns aggregated counts per emoji for this message, plus the caller's
 * own reactions so the UI can highlight their chips.
 */
export async function GET(
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

  const { data, error } = await supabase
    .from('message_reaction_counts')
    .select('emoji, count, user_ids, display_names')
    .eq('message_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reactions = (data ?? []).map((r: any) => ({
    emoji: r.emoji,
    count: r.count,
    mine: Array.isArray(r.user_ids) ? r.user_ids.includes(user.id) : false,
    display_names: r.display_names ?? [],
  }));

  return NextResponse.json({ reactions });
}

/**
 * POST /api/messages/[id]/reactions
 * Body: { emoji }
 * Toggles the caller's reaction with the given emoji on this message.
 * Returns { added: boolean }.
 */
export async function POST(
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
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  // Confirm the message is visible to the caller before mutating — RLS would
  // refuse insert anyway, but failing fast gives a cleaner error to the UI.
  const { data: visible } = await supabase
    .from('messages')
    .select('id, conversation_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!visible) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', params.id)
    .eq('user_id', user.id)
    .eq('emoji', parsed.data.emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', params.id)
      .eq('user_id', user.id)
      .eq('emoji', parsed.data.emoji);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ added: false, conversation_id: visible.conversation_id });
  }

  const { error } = await supabase
    .from('message_reactions')
    .insert({
      message_id: params.id,
      user_id: user.id,
      emoji: parsed.data.emoji,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ added: true, conversation_id: visible.conversation_id });
}
