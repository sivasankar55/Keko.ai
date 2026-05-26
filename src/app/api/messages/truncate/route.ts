import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z
  .object({
    conversationId: z.string().uuid(),
    // Either messageId (preferred) or fromCreatedAt (fallback)
    messageId: z.string().uuid().optional(),
    fromCreatedAt: z.string().datetime().optional(),
  })
  .refine((v) => v.messageId || v.fromCreatedAt, {
    message: 'Provide messageId or fromCreatedAt',
  });

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Resolve a real created_at from messageId if provided.
  let fromCreatedAt = parsed.data.fromCreatedAt;
  if (parsed.data.messageId) {
    const { data: msg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('id', parsed.data.messageId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!msg) {
      // Already gone (or temp-only) — nothing to delete server-side.
      return NextResponse.json({ ok: true, deleted: 0 });
    }
    fromCreatedAt = msg.created_at;
  }

  if (!fromCreatedAt) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const { error, count } = await supabase
    .from('messages')
    .delete({ count: 'exact' })
    .eq('conversation_id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .gte('created_at', fromCreatedAt);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
