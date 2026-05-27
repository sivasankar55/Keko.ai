import { GoogleGenerativeAI, type Part } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey && process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line no-console
  console.warn('[ai] GOOGLE_GENERATIVE_AI_API_KEY is not set. Chat will fail.');
}

export const genAI = new GoogleGenerativeAI(apiKey ?? 'missing-key');

export const CHAT_MODEL = 'gemini-flash-latest';
// Tried in order if the primary fails (overload, quota, etc).
// Lite variants tend to have the most lenient free-tier quotas.
export const FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
];

export interface HistoryItem {
  role: 'user' | 'model';
   parts: Part[];
}
