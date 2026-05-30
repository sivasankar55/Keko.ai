import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const reqSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(20),
});

/**
 * POST /api/rag/chunks
 * Body: { ids: uuid[] }
 * Returns the chunk content + document name for each id the caller can read.
 * Used by the citation popover in the message bubble.
 */
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
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('get_rag_chunks', {
    p_chunk_ids: parsed.data.ids,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ chunks: data ?? [] });
}
