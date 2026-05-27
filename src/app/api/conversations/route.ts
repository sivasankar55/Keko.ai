import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createConversationSchema } from '@/lib/validation';
import { getPersona } from '@/lib/personas';

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
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  // Resolve persona — built-in by id, otherwise check custom personas table.
  const builtIn = getPersona(parsed.data.personaId);
  let personaName = builtIn.name;
  let personaIdToStore: string = builtIn.id;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    parsed.data.personaId,
  );
  if (isUuid) {
    const { data: custom } = await supabase
      .from('personas')
      .select('id, name')
      .eq('id', parsed.data.personaId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (custom) {
      personaName = custom.name;
      personaIdToStore = custom.id;
    } else {
      return NextResponse.json({ error: 'persona not found' }, { status: 404 });
    }
  }

  const title = parsed.data.title?.trim() || `New chat with ${personaName}`;
  const modelId = parsed.data.modelId ?? null;

  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, title, persona_id: personaIdToStore, model_id: modelId })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}
