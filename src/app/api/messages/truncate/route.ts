import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  conversationId: z.string().uuid(),
  // Delete all messages with created_at >= this timestamp.
  // Used for regenerate (truncate from assistant message inclusive)
  // and edit (truncate from edited user message inclusive, then resend).
  fromCreatedAt: z.string().datetime(),
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

  // Verify ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', parsed.data.conversationId)
    .eq('user_id', user.id)
    .gte('created_at', parsed.data.fromCreatedAt);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
