import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkText, embedBatch } from '@/lib/embeddings';
import { genAI } from '@/lib/ai';

/**
 * Lazily import pdf-parse so its module-init side effects (it tries to
 * open a test PDF on first load) only run when we actually need it.
 */
async function extractPdfText(buf: Buffer): Promise<string> {
  const mod: any = await import('pdf-parse');
  const pdfParse = (mod.default ?? mod) as (
    data: Buffer,
  ) => Promise<{ text: string; numpages: number }>;
  const parsed = await pdfParse(buf);
  return parsed.text ?? '';
}

export const runtime = 'nodejs';
// Vercel Hobby caps function execution at 60s. Anything past that is a
// platform-level kill and arrives at the client as a 504 + HTML page.
// We size internal work to fit comfortably below this ceiling.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ALLOWED = ['application/pdf', 'text/plain', 'text/markdown'];
const MAX_BYTES = 8 * 1024 * 1024;
// Hard cap on chunks per document. Beyond this we'd risk the 60s timeout
// during embedding even with parallel batches; better to fail fast with
// a useful message.
const MAX_CHUNKS = 200;

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
      // Fast path: extract text locally with pdf-parse. Most PDFs are
      // text-based and this finishes in well under a second.
      try {
        const text = await extractPdfText(buf);
        if (text && text.trim().length > 100) {
          raw = text;
        }
      } catch {
        // Bad PDF or password-protected — fall through to OCR via Gemini.
      }

      // Slow fallback: ask Gemini to transcribe scanned/image-only PDFs.
      // Only triggered when pdf-parse couldn't find readable text.
      if (!raw) {
        const transcribeChain = [
          'gemini-2.5-flash-lite',
          'gemini-2.0-flash-lite',
          'gemini-flash-latest',
          'gemini-2.0-flash',
        ];
        let lastTranscribeErr: any = null;
        for (const modelName of transcribeChain) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: { temperature: 0, maxOutputTokens: 8192 },
            });
            const result = await model.generateContent([
              { inlineData: { data: buf.toString('base64'), mimeType: mime } },
              {
                text:
                  'Transcribe the entire content of this PDF as plain text. ' +
                  'Preserve paragraph breaks. Keep table contents readable. ' +
                  'Do not summarize or add commentary, just the text.',
              },
            ]);
            raw = result.response.text() ?? '';
            if (raw.trim().length > 0) break;
          } catch (e: any) {
            lastTranscribeErr = e;
          }
        }
        if (!raw.trim()) {
          throw new Error(
            lastTranscribeErr?.message
              ? `PDF transcription failed. Last error: ${lastTranscribeErr.message}`
              : 'No text extracted from PDF.',
          );
        }
      }
    } else {
      raw = buf.toString('utf-8');
    }

    const chunks = chunkText(raw);
    if (chunks.length === 0) {
      throw new Error('No readable text extracted from the file.');
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(
        `Document too large to index in one shot (${chunks.length} chunks). ` +
          'Please split it into parts of roughly 50 pages or fewer.',
      );
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
