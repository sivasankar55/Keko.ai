import { genAI } from './ai';

// Google retired text-embedding-004 on the v1beta endpoint. gemini-embedding-001
// is the current model; it defaults to 3072 dims but supports reducing the
// output to 768 to match our existing vector(768) column.
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;

/**
 * Generate a 768-dim embedding for a piece of text via Gemini.
 * Used for both indexing chunks and embedding query text at retrieval time.
 */
export async function embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT') {
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const res = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: taskType as any,
    outputDimensionality: EMBED_DIMS,
  } as any);
  return res.embedding.values;
}

/**
 * Embed multiple texts in parallel batches. Gemini's free tier allows
 * a reasonable number of concurrent requests; running in waves of 5
 * gives a big speedup over the previous fully-sequential loop without
 * tripping rate limits.
 */
export async function embedBatch(texts: string[]) {
  const out: number[][] = new Array(texts.length);
  const concurrency = 5;
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const vectors = await Promise.all(
      slice.map((t) => embed(t, 'RETRIEVAL_DOCUMENT')),
    );
    for (let j = 0; j < vectors.length; j++) {
      out[i + j] = vectors[j];
    }
  }
  return out;
}

/**
 * Split a long text into ~chunkSize-character chunks with overlap. Tries to
 * break on paragraph or sentence boundaries when possible. The overlap is
 * generous (~250 chars) so a sentence split across boundaries is still
 * findable on either side.
 */
export function chunkText(
  text: string,
  chunkSize = 1000,
  overlap = 250,
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
