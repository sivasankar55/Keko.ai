import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkText, embedBatch } from '@/lib/embeddings';
import { genAI, CHAT_MODEL } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const ALLOWED = ['application/pdf', 'text/plain', 'text/markdown'];
const MAX_BYTES = 8 * 1024 * 1024;

// List the user's RAG documents (optionally for a conversation).
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  let q = supabase
    .from('rag_documents')
    .select('id, name, mime, size_bytes, status, error, created_at, conversation_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (conversationId) q = q.eq('conversation_id', conversationId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

// Upload a new document, extract text, chunk, embed, and store.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid form' }, { status: 400 });

  const file = form.get('file');
  const conversationId = form.get('conversationId')?.toString() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  const mime = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 8MB)' }, { status: 400 });
  }

  // If a conversationId is provided, verify it belongs to this user.
  if (conversationId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }

  // Save raw file in storage under user's path.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const fileId = crypto.randomUUID();
  const storagePath = `${user.id}/${conversationId ?? '_library'}/rag-${fileId}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from('attachments')
    .upload(storagePath, buf, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: 'storage upload failed: ' + upErr.message }, { status: 500 });
  }

  // Insert the document row in 'processing' state.
  const { data: doc, error: docErr } = await supabase
    .from('rag_documents')
    .insert({
      user_id: user.id,
      conversation_id: conversationId,
      name: file.name,
      mime,
      size_bytes: file.size,
      storage_path: storagePath,
      status: 'processing',
    })
    .select('*')
    .single();
  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  // Extract text → chunk → embed → insert. Done synchronously so the
  // client gets the final 'ready' state in the response. Free-tier
  // friendly because the request lasts a few seconds for typical files.
  try {
    let raw = '';
    if (mime === 'application/pdf') {
      const model = genAI.getGenerativeModel({
        model: CHAT_MODEL,
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
        },
      });
      const result = await model.generateContent([
        {
          inlineData: {
            data: buf.toString('base64'),
            mimeType: mime,
          },
        },
        {
          text:
            'Transcribe the entire content of this PDF as plain text. ' +
            'Preserve paragraph breaks. Keep table contents readable. ' +
            'Do not summarize, do not add commentary, just the text.',
        },
      ]);
      raw = result.response.text() ?? '';
    } else {
      raw = buf.toString('utf-8');
    }

    const chunks = chunkText(raw);
    if (chunks.length === 0) {
      throw new Error('No readable text extracted from the file.');
    }

    const vectors = await embedBatch(chunks);

    const rows = chunks.map((content, idx) => ({
      document_id: doc.id,
      user_id: user.id,
      conversation_id: conversationId,
      chunk_index: idx,
      content,
      embedding: vectors[idx] as any,
    }));

    // Insert in batches of 50 to stay well under any payload limits.
    for (let i = 0; i < rows.length; i += 50) {
      const slice = rows.slice(i, i + 50);
      const { error: insErr } = await supabase.from('rag_chunks').insert(slice);
      if (insErr) throw new Error('chunk insert failed: ' + insErr.message);
    }

    await supabase
      .from('rag_documents')
      .update({ status: 'ready' })
      .eq('id', doc.id);

    return NextResponse.json({
      document: { ...doc, status: 'ready' },
      chunks: chunks.length,
    });
  } catch (e: any) {
    await supabase
      .from('rag_documents')
      .update({ status: 'failed', error: String(e.message ?? e).slice(0, 500) })
      .eq('id', doc.id);
    return NextResponse.json(
      { error: 'processing failed: ' + (e.message ?? 'unknown error') },
      { status: 500 },
    );
  }
}
