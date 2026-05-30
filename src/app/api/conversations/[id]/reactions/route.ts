import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/**
 * GET /api/conversations/[id]/reactions
 * Bulk-fetch every reaction aggregate for every visible message in this
 * conversation. Used to seed the message bubbles' reaction strips on load.
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

  // Pull every message id we can read in this conversation, then aggregate
  // their reactions. The view does the heavy lifting; RLS already filters.
  const { data: msgs, error: mErr } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', params.id);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  const messageIds = (msgs ?? []).map((m) => m.id);
  if (messageIds.length === 0) return NextResponse.json({ reactions: [] });

  const { data, error } = await supabase
    .from('message_reaction_counts')
    .select('message_id, emoji, count, user_ids, display_names')
    .in('message_id', messageIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reactions = (data ?? []).map((r: any) => ({
    message_id: r.message_id,
    emoji: r.emoji,
    count: r.count,
    mine: Array.isArray(r.user_ids) ? r.user_ids.includes(user.id) : false,
    display_names: r.display_names ?? [],
  }));

  return NextResponse.json({ reactions });
}
