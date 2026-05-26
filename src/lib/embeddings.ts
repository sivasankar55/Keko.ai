import { genAI } from './ai';

const EMBED_MODEL = 'text-embedding-004';

/**
 * Generate a 768-dim embedding for a piece of text via Gemini.
 * Used for both indexing chunks and embedding query text at retrieval time.
 */
export async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT') {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const res = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: taskType as any,
  });
  return res.embedding.values;
}

/**
 * Embed multiple texts. Done sequentially to stay under the free-tier
 * RPM limit; for hundreds of chunks this is still fast enough.
 */
export async function embedBatch(texts: string[]) {
  const out: number[][] = [];
  for (const t of texts) {
    const v = await embed(t, 'RETRIEVAL_DOCUMENT');
    out.push(v);
  }
  return out;
}

/**
 * Split a long text into ~chunkSize-character chunks with overlap.
 * Tries to break on paragraph or sentence boundaries when possible.
 */
export function chunkText(
  text: string,
  chunkSize = 1200,
  overlap = 200,
): string[] {
  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= chunkSize) return cleaned.length > 0 ? [cleaned] : [];

  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    let end = Math.min(i + chunkSize, cleaned.length);
    if (end < cleaned.length) {
      // Try to break at the last paragraph/sentence boundary in this window.
      const window = cleaned.slice(i, end);
      const lastBreak = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
      );
      if (lastBreak > chunkSize * 0.5) {
        end = i + lastBreak + 1;
      }
    }
    const piece = cleaned.slice(i, end).trim();
    if (piece) chunks.push(piece);
    i = end - overlap;
    if (i <= 0 || i >= cleaned.length) break;
  }
  return chunks;
}
