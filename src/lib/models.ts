export type Provider = 'gemini' | 'groq';

export interface ModelDef {
  id: string;          // stable id stored in DB
  provider: Provider;  // routing
  remoteModel: string; // upstream model name
  name: string;        // pretty label
  tagline: string;     // short description
  vision: boolean;     // supports image attachments
  free: boolean;       // available to user (free tier)
}

export const MODELS: ModelDef[] = [
  // Gemini
  {
    id: 'gemini-flash-latest',
    provider: 'gemini',
    remoteModel: 'gemini-flash-latest',
    name: 'Gemini Flash',
    tagline: 'Google\u2019s balanced model. Vision + text.',
    vision: true,
    free: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    remoteModel: 'gemini-2.5-flash-lite',
    name: 'Gemini Flash Lite',
    tagline: 'Lightest, most lenient quota. Fast.',
    vision: true,
    free: true,
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'gemini',
    remoteModel: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    tagline: 'Solid all-rounder. Vision capable.',
    vision: true,
    free: true,
  },

  // Groq (text only — Groq doesn\u2019t serve image-input models on free tier)
  {
    id: 'groq-llama-3.3-70b',
    provider: 'groq',
    remoteModel: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    tagline: 'Meta\u2019s flagship via Groq. Lightning-fast.',
    vision: false,
    free: true,
  },
  {
    id: 'groq-llama-3.1-8b',
    provider: 'groq',
    remoteModel: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    tagline: 'Tiny, instant. For quick exchanges.',
    vision: false,
    free: true,
  },
  {
    id: 'groq-gpt-oss-120b',
    provider: 'groq',
    remoteModel: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    tagline: 'OpenAI\u2019s open-weight, served fast.',
    vision: false,
    free: true,
  },
];

export const DEFAULT_MODEL_ID = 'gemini-flash-latest';

export function getModel(id: string | null | undefined): ModelDef {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function modelsByProvider(): Record<Provider, ModelDef[]> {
  return {
    gemini: MODELS.filter((m) => m.provider === 'gemini'),
    groq: MODELS.filter((m) => m.provider === 'groq'),
  };
}
