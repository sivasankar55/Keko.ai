import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const idSchema = z.string().uuid();

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

  // Verify the user can access this conversation (owner OR member; RLS handles it).
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}
