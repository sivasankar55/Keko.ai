# keko.ai

A quieter way to think with AI. Multi-persona chat, image generation, voice input, file uploads, and conversation history. Built with **free tools**. Secured end-to-end with Supabase Auth + Row Level Security.

## Features

- 💬 Streaming chat with **Gemini 2.5 Flash** (free tier)
- 🎨 Image generation via **Pollinations.ai** (no key) with optional HuggingFace fallback
- 🎙️ Voice input via the browser's Web Speech API
- 📎 File uploads (images, PDFs, text) with vision/document understanding
- 🧑‍🎨 Six built-in personas + create your own
- 🗂️ Conversation history with pinning, rename, and search
- ⌘K command palette
- 🌗 Two themes: Bone (light) and Obsidian (dark) — auto-detect from system
- 🔐 Auth, RLS, rate limiting, security headers

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + CSS variables |
| Animation | Framer Motion |
| Auth + DB + Storage | Supabase (free tier) |
| AI chat | Google Gemini API (free) |
| Image gen | Pollinations.ai (free, no key) |
| Voice | Web Speech API (browser) |
| Rate limit | Upstash Redis (optional) → in-memory fallback |

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a free project at https://supabase.com
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor
3. Run [`supabase/migrations/002_features.sql`](./supabase/migrations/002_features.sql)
4. Create a Storage bucket called `attachments` (public: OFF)
5. In `Authentication → Sign In / Providers → Email`, toggle "Confirm email" off (or set up custom SMTP via Resend)

### 3. Gemini API key

Free at https://aistudio.google.com/apikey

### 4. Environment

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Security

- HTTP-only cookie sessions (`@supabase/ssr`)
- Row Level Security on every table
- Storage path-based ownership
- Server-side ownership checks on all API routes
- Zod validation on all inputs
- File type + size whitelist (8MB, images/PDFs/text only)
- Signed URLs (1h TTL) for attachments
- Rate limiting per user (40 chat/min, 8 image/min)
- Markdown sanitized via `rehype-sanitize`
- AI keys server-only
- Security headers (HSTS, X-Frame-Options, Permissions-Policy)

## License

MIT
