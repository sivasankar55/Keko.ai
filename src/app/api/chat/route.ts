import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { genAI, CHAT_MODEL, type HistoryItem } from '@/lib/ai';
import { chatRequestSchema } from '@/lib/validation';
import { limitChat } from '@/lib/rate-limit';
import { getPersona } from '@/lib/personas';
import type { Part } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Rate limit per user
  const limit = await limitChat(user.id);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many messages. Please slow down.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  const { conversationId, message, attachments } = parsed.data;

  // Verify conversation ownership (RLS also enforces, but we want a clear early return)
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, persona_id, title, user_id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();
  if (convErr || !conv) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Load history (skip the freshly inserted user message; we'll insert it now)
  const { data: prior } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40);

  // Load custom persona if persona_id is a UUID; otherwise fall back to built-in.
  let persona = getPersona(conv.persona_id);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    conv.persona_id,
  );
  if (isUuid) {
    const { data: custom } = await supabase
      .from('personas')
      .select('*')
      .eq('id', conv.persona_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (custom) {
      persona = {
        id: custom.id,
        name: custom.name,
        emoji: custom.emoji,
        tagline: custom.tagline,
        systemPrompt: custom.system_prompt,
        custom: true,
      };
    }
  }

  // Build attachment parts (inline for images, signed URL note for documents)
  const attachmentParts: Part[] = [];
  const storedAttachments: any[] = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (!att.path.startsWith(`${user.id}/${conversationId}/`)) {
        // Reject paths that don't belong to this user/conversation
        return NextResponse.json({ error: 'invalid attachment path' }, { status: 400 });
      }
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(att.path, 3600);
      storedAttachments.push({
        id: att.path.split('/').pop()?.split('.')[0] ?? crypto.randomUUID(),
        name: att.name,
        type: att.type,
        size: att.size,
        path: att.path,
        url: signed?.signedUrl,
        kind: att.type.startsWith('image') ? 'image' : 'document',
      });
      if (att.type.startsWith('image')) {
        const { data: blob } = await supabase.storage.from('attachments').download(att.path);
        if (blob) {
          const buf = Buffer.from(await blob.arrayBuffer());
          attachmentParts.push({
            inlineData: { data: buf.toString('base64'), mimeType: att.type },
          });
        }
      } else if (att.type === 'application/pdf' || att.type.startsWith('text/')) {
        const { data: blob } = await supabase.storage.from('attachments').download(att.path);
        if (blob) {
          const buf = Buffer.from(await blob.arrayBuffer());
          attachmentParts.push({
            inlineData: { data: buf.toString('base64'), mimeType: att.type },
          });
        }
      }
    }
  }

  // Persist the user message
  const { error: insertErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: message,
    attachments: storedAttachments.length ? storedAttachments : null,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Build history for the model
  const history: HistoryItem[] = (prior ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  const model = genAI.getGenerativeModel({
    model: CHAT_MODEL,
    systemInstruction: persona.systemPrompt,
    safetySettings: [],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  });

  const chat = model.startChat({ history });

  const userParts: Part[] = [{ text: message }, ...attachmentParts];

  // Stream the response
  const encoder = new TextEncoder();
  let fullText = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await chat.sendMessageStream(userParts);
        for await (const chunk of result.stream) {
          const piece = chunk.text();
          if (piece) {
            fullText += piece;
            controller.enqueue(encoder.encode(piece));
          }
        }
      } catch (e: any) {
        const errMsg = `\n\n⚠️ ${e?.message ?? 'Generation failed.'}`;
        fullText += errMsg;
        controller.enqueue(encoder.encode(errMsg));
      } finally {
        // Persist assistant message
        try {
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: 'assistant',
            content: fullText || '(no response)',
          });

          // Auto-title the first exchange
          if ((prior?.length ?? 0) === 0 && conv.title.startsWith('New chat')) {
            const newTitle = generateTitle(message);
            await supabase
              .from('conversations')
              .update({ title: newTitle })
              .eq('id', conversationId)
              .eq('user_id', user.id);
          }
        } catch {
          // already streamed; swallow
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function generateTitle(message: string) {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '...';
}
