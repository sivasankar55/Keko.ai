import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { genAI, CHAT_MODEL, FALLBACK_MODELS, type HistoryItem } from '@/lib/ai';
import { chatRequestSchema } from '@/lib/validation';
import { limitChat } from '@/lib/rate-limit';
import { getPersona } from '@/lib/personas';
import { embed } from '@/lib/embeddings';
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

  // Persist the user message (use a placeholder if message is empty so DB is happy and UI renders)
  const persistedContent = message.trim().length > 0 ? message : '(attachment)';
  const { error: insertErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: persistedContent,
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

  function buildChat(modelName: string) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: persona.systemPrompt,
      safetySettings: [],
      generationConfig: {
        temperature: 0.85,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });
    return model.startChat({ history });
  }

  // If user sent only attachments (no text), give Gemini a default prompt so it does something useful.
  const promptText =
    message.trim().length > 0
      ? message
      : 'Describe and analyze the attached file(s) in detail.';

  // RAG: retrieve top-k chunks scoped to this conversation if any documents exist.
  let ragContext = '';
  let ragSources: { document_name: string; chunk_index: number }[] = [];
  try {
    const { count } = await supabase
      .from('rag_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .eq('status', 'ready');

    if ((count ?? 0) > 0 && message.trim().length >= 4) {
      const queryEmbedding = await embed(message, 'RETRIEVAL_QUERY');
      const { data: matches } = await supabase.rpc('match_rag_chunks', {
        p_user_id: user.id,
        p_query_embedding: queryEmbedding as any,
        p_match_count: 6,
        p_conversation_id: conversationId,
      });
      if (matches && matches.length > 0) {
        const blocks = matches
          .filter((m: any) => m.similarity > 0.55)
          .map(
            (m: any, i: number) =>
              `[${i + 1}] (${m.document_name}, section ${m.chunk_index + 1})\n${m.content}`,
          );
        if (blocks.length > 0) {
          ragContext =
            '\n\n--- DOCUMENT CONTEXT ---\n' +
            'Use the following excerpts from the user\'s uploaded documents to answer their question. ' +
            'Cite passages by their bracket number when relevant. If the documents don\'t answer the question, say so plainly.\n\n' +
            blocks.join('\n\n---\n\n') +
            '\n--- END OF DOCUMENT CONTEXT ---\n\n';
          ragSources = matches.map((m: any) => ({
            document_name: m.document_name,
            chunk_index: m.chunk_index,
          }));
        }
      }
    }
  } catch (e) {
    // RAG failure shouldn't break chat — just log and continue.
    // eslint-disable-next-line no-console
    console.warn('[rag] retrieval failed:', e);
  }

  const finalPromptText = ragContext + promptText;
  const userParts: Part[] = [{ text: finalPromptText }, ...attachmentParts];
  void ragSources;

  // Stream the response, with fallback models if the primary is overloaded
  const encoder = new TextEncoder();
  let fullText = '';
  const modelChain = [CHAT_MODEL, ...FALLBACK_MODELS];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastError: any = null;
      let succeeded = false;

      for (const modelName of modelChain) {
        try {
          const chat = buildChat(modelName);
          const result = await chat.sendMessageStream(userParts);
          for await (const chunk of result.stream) {
            const piece = chunk.text();
            if (piece) {
              fullText += piece;
              controller.enqueue(encoder.encode(piece));
            }
          }
          succeeded = true;
          break;
        } catch (e: any) {
          lastError = e;
          const msg = String(e?.message ?? '');
          // Retry on transient errors (503/500) and on quota exhaustion (429),
          // since each model has its own quota bucket on the free tier.
          const isTransient =
            msg.includes('503') ||
            msg.toLowerCase().includes('overloaded') ||
            msg.toLowerCase().includes('unavailable') ||
            msg.includes('500') ||
            msg.includes('429') ||
            msg.toLowerCase().includes('quota') ||
            msg.toLowerCase().includes('rate limit');
          if (!isTransient) break;
          // If we already streamed partial output, don't retry — the user sees garbled output.
          if (fullText.length > 0) break;
          // eslint-disable-next-line no-console
          console.warn(`[chat] ${modelName} transient error, falling back...`, msg);
        }
      }

      if (!succeeded && lastError) {
        const lastMsg = String(lastError.message ?? '');
        const isQuota =
          lastMsg.includes('429') ||
          lastMsg.toLowerCase().includes('quota') ||
          lastMsg.toLowerCase().includes('rate limit');
        const isOverload =
          lastMsg.includes('503') || lastMsg.toLowerCase().includes('overloaded');
        const friendly = isQuota
          ? "I've hit Gemini's free daily limit on every model I tried. It resets in 24 hours, or you can grab a fresh API key in AI Studio (free, takes a minute) and paste it as GOOGLE_GENERATIVE_AI_API_KEY in your environment."
          : isOverload
            ? "Gemini is overloaded right now. I tried backup models but couldn't reach them either. Please try again in a minute."
            : `Generation failed. ${lastError.message ?? ''}`;
        fullText += (fullText ? '\n\n' : '') + '⚠️ ' + friendly;
        controller.enqueue(encoder.encode('⚠️ ' + friendly));
      }

      // Persist assistant message + auto-title
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
