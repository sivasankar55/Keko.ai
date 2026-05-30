import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/**
 * GET /api/conversations/[id]/members
 * Returns every human in this conversation (owner + member rows joined to
 * profiles). Drives the @-autocomplete in the composer.
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

  // Verify visibility — RLS on conversations enforces it.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Owner is implicit; member rows are explicit.
  const ownerIdsRes = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', conv.user_id)
    .maybeSingle();

  const memberIdsRes = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', params.id);

  const memberIds = (memberIdsRes.data ?? []).map((r) => r.user_id);
  const memberProfilesRes = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', memberIds)
    : { data: [] as Array<{ id: string; display_name: string | null; avatar_url: string | null }> };

  const members: Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    role: 'owner' | 'member';
  }> = [];

  if (ownerIdsRes.data) {
    members.push({
      id: ownerIdsRes.data.id,
      display_name: ownerIdsRes.data.display_name ?? 'Owner',
      avatar_url: ownerIdsRes.data.avatar_url ?? null,
      role: 'owner',
    });
  }
  for (const p of memberProfilesRes.data ?? []) {
    if (p.id === conv.user_id) continue;
    members.push({
      id: p.id,
      display_name: p.display_name ?? 'Member',
      avatar_url: p.avatar_url ?? null,
      role: 'member',
    });
  }

  return NextResponse.json({ members });
}
