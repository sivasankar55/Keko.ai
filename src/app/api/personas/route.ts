import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { dbToPersona } from '@/lib/personas';

const createSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8).default('✨'),
  tagline: z.string().max(120).optional().default(''),
  systemPrompt: z.string().min(10).max(4000),
});

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ personas: (data ?? []).map(dbToPersona) });
}

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('personas')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      emoji: parsed.data.emoji,
      tagline: parsed.data.tagline,
      system_prompt: parsed.data.systemPrompt,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ persona: dbToPersona(data) });
}
