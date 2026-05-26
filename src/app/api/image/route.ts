import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { imageGenSchema } from '@/lib/validation';
import { limitImageGen } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Free image generation via Pollinations.ai (no API key required).
 * The prompt is sent as a URL path; we fetch the image and re-host it
 * in our private Supabase Storage bucket so it's owned, signed, and
 * subject to RLS (no leaking of user prompts via public URLs).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limit = await limitImageGen(user.id);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Image generation limit reached. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = imageGenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const { prompt, conversationId } = parsed.data;

  // Verify ownership
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Persist user prompt
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: `🎨 Generate image: ${prompt}`,
  });

  let buffer: Buffer | null = null;
  let mime = 'image/jpeg';

  // 1. Try Pollinations.ai (no key)
  try {
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const arr = new Uint8Array(await res.arrayBuffer());
      if (arr.byteLength > 1024) {
        buffer = Buffer.from(arr);
        mime = res.headers.get('content-type') ?? 'image/jpeg';
      }
    }
  } catch {
    // fall through
  }

  // 2. Fallback: HuggingFace if token configured
  if (!buffer && process.env.HUGGINGFACE_API_TOKEN) {
    try {
      const res = await fetch(
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ inputs: prompt }),
        },
      );
      if (res.ok) {
        buffer = Buffer.from(await res.arrayBuffer());
        mime = res.headers.get('content-type') ?? 'image/png';
      }
    } catch {
      // fall through
    }
  }

  if (!buffer) {
    const errContent = '⚠️ Could not generate the image right now. Please try again in a moment.';
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'assistant',
      content: errContent,
    });
    return NextResponse.json({ error: 'generation_failed', message: errContent }, { status: 502 });
  }

  // Store in Supabase Storage under user's path
  const id = crypto.randomUUID();
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `${user.id}/${conversationId}/gen-${id}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('attachments')
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from('attachments')
    .createSignedUrl(path, 3600);

  const attachment = {
    id,
    name: `generated-${id.slice(0, 8)}.${ext}`,
    type: mime,
    size: buffer.byteLength,
    path,
    url: signed?.signedUrl,
    kind: 'generated-image' as const,
  };

  const content = `Here's what I imagined for "${prompt}".`;
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'assistant',
    content,
    attachments: [attachment],
  });

  return NextResponse.json({ attachment, content });
}
