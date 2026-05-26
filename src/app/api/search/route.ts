import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (q.length > 100) return NextResponse.json({ error: 'query too long' }, { status: 400 });

  // Find conversations whose title matches OR which contain a matching message.
  const pattern = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`;

  const [byTitle, byMessage] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, title, persona_id, updated_at')
      .eq('user_id', user.id)
      .ilike('title', pattern)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('messages')
      .select('conversation_id, content, created_at, role')
      .eq('user_id', user.id)
      .ilike('content', pattern)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const results = new Map<
    string,
    { id: string; title?: string; persona_id?: string; snippet?: string; updated_at?: string }
  >();

  for (const c of byTitle.data ?? []) {
    results.set(c.id, {
      id: c.id,
      title: c.title,
      persona_id: c.persona_id,
      updated_at: c.updated_at,
    });
  }

  // Add snippet from matching message content
  const seen = new Set<string>();
  for (const m of byMessage.data ?? []) {
    if (seen.has(m.conversation_id)) continue;
    seen.add(m.conversation_id);
    const snippet = makeSnippet(m.content, q);
    const existing = results.get(m.conversation_id);
    if (existing) {
      existing.snippet = snippet;
    } else {
      results.set(m.conversation_id, { id: m.conversation_id, snippet });
    }
  }

  // Backfill missing titles for message-only matches
  const missing = Array.from(results.values()).filter((r) => !r.title);
  if (missing.length) {
    const { data } = await supabase
      .from('conversations')
      .select('id, title, persona_id, updated_at')
      .in(
        'id',
        missing.map((r) => r.id),
      );
    for (const c of data ?? []) {
      const r = results.get(c.id);
      if (r) {
        r.title = c.title;
        r.persona_id = c.persona_id;
        r.updated_at = c.updated_at;
      }
    }
  }

  return NextResponse.json({
    results: Array.from(results.values())
      .filter((r) => r.title)
      .slice(0, 20),
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
  return s;
}
