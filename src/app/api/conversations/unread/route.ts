import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/unread
 * Returns unread + mention counts per conversation for the caller.
 * Drives sidebar badges. Cheap: a single RPC call.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('conversation_unread_summary');
  if (error) {
    // Older databases without the migration — fail soft, no badges.
    return NextResponse.json({ summary: [] });
  }

  return NextResponse.json({ summary: data ?? [] });
}
