import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const filterSchema = z.object({
  q: z.string().min(2).max(120),
  personaId: z.string().min(1).max(64).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  hasAttachments: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  branchedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = filterSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ results: [] });
  }
  const f = parsed.data;

  // Try the FTS RPC first. Falls back to the legacy ILIKE path if the RPC
  // hasn't been migrated yet (older databases).
  const { data, error } = await supabase.rpc('search_conversations', {
    p_query: f.q,
    p_persona_id: f.personaId ?? null,
    p_date_from: f.dateFrom ?? null,
    p_date_to: f.dateTo ?? null,
    p_has_attachments: f.hasAttachments ?? false,
    p_branched_only: f.branchedOnly ?? false,
    p_limit: f.limit ?? 20,
  });

  if (!error) {
    return NextResponse.json({
      results: (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        persona_id: r.persona_id,
        snippet: r.snippet,
        updated_at: r.updated_at,
        branched_from_conversation_id: r.branched_from_conversation_id,
        rank: r.rank,
      })),
    });
  }

  // ---------- Legacy fallback (ILIKE) ----------
  // Keeps the palette working if the migration hasn't been applied.
  // eslint-disable-next-line no-console
  console.warn('[search] FTS RPC failed, falling back to ILIKE:', error.message);

  const pattern = `%${f.q.replace(/[%_]/g, (m) => '\\' + m)}%`;
  const [byTitle, byMessage] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, title, persona_id, updated_at, branched_from_conversation_id')
      .ilike('title', pattern)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .ilike('content', pattern)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const results = new Map<string, any>();
  for (const c of byTitle.data ?? []) {
    results.set(c.id, { ...c, snippet: '' });
  }
  const seen = new Set<string>();
  for (const m of byMessage.data ?? []) {
    if (seen.has(m.conversation_id)) continue;
    seen.add(m.conversation_id);
    const snippet = makeSnippet(m.content, f.q);
    const existing = results.get(m.conversation_id);
    if (existing) existing.snippet = snippet;
    else results.set(m.conversation_id, { id: m.conversation_id, snippet });
  }
  const missing = Array.from(results.values()).filter((r) => !r.title);
  if (missing.length) {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, title, persona_id, updated_at, branched_from_conversation_id')
      .in('id', missing.map((r) => r.id));
    for (const c of convs ?? []) {
      const r = results.get(c.id);
      if (r) Object.assign(r, c);
    }
  }
  return NextResponse.json({
    results: Array.from(results.values()).filter((r) => r.title).slice(0, 20),
  });
}

function makeSnippet(content: string, q: string) {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return content.slice(0, 100);
  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + q.length + 60);
  let s = content.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = '…' + s;
  if (end < content.length) s = s + '…';
  // Crude highlight for fallback path so the UI's <mark> rendering still works.
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return s.replace(re, '<mark>$1</mark>');
}
