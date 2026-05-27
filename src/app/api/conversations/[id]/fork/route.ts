import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  // Fork all messages up to and including this one.
  messageId: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
});

const idSchema = z.string().uuid();

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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  // Load the source conversation (verifies ownership via RLS).
  const { data: source } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Find the target message, verify it belongs to the user + this conversation.
  const { data: targetMsg } = await supabase
    .from('messages')
    .select('id, created_at')
    .eq('id', parsed.data.messageId)
    .eq('conversation_id', source.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!targetMsg) return NextResponse.json({ error: 'message not found' }, { status: 404 });

  // Pull all messages up to and including the target.
  const { data: priorMessages, error: msgErr } = await supabase
    .from('messages')
    .select('role, content, attachments, created_at')
    .eq('conversation_id', source.id)
    .lte('created_at', targetMsg.created_at)
    .order('created_at', { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Create the new conversation. Inherit persona + model.
  const newTitle =
    parsed.data.title?.trim() || `${source.title} (branch)`.slice(0, 120);

  const { data: forked, error: forkErr } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title: newTitle,
      persona_id: source.persona_id,
      model_id: source.model_id,
      branched_from_conversation_id: source.id,
      branched_from_message_id: targetMsg.id,
    })
    .select('*')
    .single();
  if (forkErr) return NextResponse.json({ error: forkErr.message }, { status: 500 });

  // Copy the prior messages into the new conversation.
  if (priorMessages && priorMessages.length > 0) {
    // Stagger created_at slightly so order is stable, while keeping all "before now".
    const baseTime = Date.now();
    const rows = priorMessages.map((m, i) => ({
      conversation_id: forked.id,
      user_id: user.id,
      role: m.role,
      content: m.content,
      attachments: m.attachments,
      // Preserve relative order; place all in the past relative to now.
      created_at: new Date(baseTime - (priorMessages.length - i) * 1000).toISOString(),
    }));
    const { error: insErr } = await supabase.from('messages').insert(rows);
    if (insErr) {
      // Try to clean up the orphaned conversation.
      await supabase.from('conversations').delete().eq('id', forked.id);
      return NextResponse.json({ error: 'message copy failed: ' + insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ conversation: forked });
}
