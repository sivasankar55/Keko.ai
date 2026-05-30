# keko.ai

A quieter way to think with AI. Multi-persona chat with branching, real-time
collaboration, document chat, and conversation search — built on free tooling.
Secured end-to-end with Supabase Auth and Row Level Security.

## Features

### Conversation
- Streaming chat through **Google Gemini** with automatic fallback across
  multiple Gemini models when one is overloaded or rate-limited
- **Multiple providers** — pick a model per conversation. Gemini and Groq
  (Llama 3, Mixtral) are wired up; the picker lives in the chat header
- **Branching** — fork from any message to explore an alternative thread
  without losing the original
- Six built-in personas plus user-created custom personas
- Streaming UI with stop, regenerate, edit-and-resend, delete, copy,
  listen (TTS), and per-message reactions
- Image generation via Pollinations.ai (no key) with optional HuggingFace
  fallback
- Voice input via the browser's Web Speech API
- File uploads — images, PDFs, and text up to 8 MB each, vision-aware
- **RAG document chat** — upload a PDF or text, ask questions, get answers
  with `[1]` `[2]` footnote chips that pop the source passage on click
- **Slash commands** — type `/` in the composer for a quick menu of
  `/branch`, `/share`, `/silent`, `/persona <name>`, `/invite`, `/docs`,
  `/export`, `/clear`, `/help`

### Collaboration
- **Invite links** — share a one-click join URL so a teammate can join
  the conversation as a member
- **Live presence** — avatars in the header show who else is in the room
- **Realtime messages** — peer messages stream in via Supabase Realtime
  with a polling safety net when the channel is degraded
- **Typing indicators** — Slack-style "X is typing…" with bouncing dots
- **Silent mode** — in shared rooms, send a message that goes only to
  other humans without invoking the AI
- **@mentions** — autocomplete from conversation members; mentioned
  messages render highlighted chips for the named user
- **Read receipts** — sidebar badges show unread + mention counts per
  conversation, clearing on focus
- **Owner / member roles** — owners can rename/share/export/delete; members
  can leave and pin

### Search & navigation
- **Full-text conversation search** with `websearch_to_tsquery` — quoted
  phrases, OR, and `-not` operators all work
- **Filters** — narrow by persona, last 7/30/90 days, has-attachments,
  branched-only
- **Highlighted snippets** in result rows
- ⌘K command palette with recent conversations, persona launchers, and
  global search
- Sidebar with pin / rename / share / export / delete (owner) or leave
  (member)

### Polish
- Two themes — Bone (light) and Obsidian (dark), auto-detected from
  system, persisted to localStorage
- iOS-friendly layout — `100dvh` for full-screen, safe-area padding for
  notch + home indicator, hamburger that doesn't overlap the header
- Drag-and-drop file uploads in the chat area
- Conversation export to Markdown
- Public share links — read-only token URL anyone can open
- Sound effects (toggle from the sidebar) — send, receive, and silent

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + CSS variables |
| Animation | Framer Motion |
| Auth + DB + Storage + Realtime | Supabase (free tier) |
| AI chat | Google Gemini + Groq (free tiers) |
| Embeddings | Gemini `text-embedding-004` (768-dim) |
| Vector store | Supabase `pgvector` with IVFFLAT |
| Search | Postgres FTS + trigram |
| Image generation | Pollinations.ai (free, no key) |
| Voice input | Web Speech API (browser) |
| Voice output | Web Speech API SpeechSynthesis (browser) |
| Rate limit | Upstash Redis (optional) with in-memory fallback |

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a free project at https://supabase.com.
2. In `SQL Editor`, run the migrations **in order**:
   - `supabase/schema.sql`
   - `supabase/migrations/002_features.sql`
   - `supabase/migrations/003_share_and_rag.sql`
   - `supabase/migrations/004_models.sql`
   - `supabase/migrations/006_realtime.sql`
   - `supabase/migrations/007_silent_messages.sql`
   - `supabase/migrations/008_owner_can_read_member_messages.sql`
   - `supabase/migrations/009_reactions.sql`
   - `supabase/migrations/010_search.sql`
   - `supabase/migrations/011_mentions_and_reads.sql`
   - `supabase/migrations/012_rag_citations.sql`
3. In `Storage`, create a private bucket called `attachments` (public OFF).
4. In `Authentication → Sign In / Providers → Email`, toggle off "Confirm
   email" for local development, or wire up SMTP (Resend, etc.) for prod.

The migrations are idempotent — re-running is safe.

### 3. AI providers

- **Gemini** (required) — free at https://aistudio.google.com/apikey
- **Groq** (optional) — free at https://console.groq.com/keys. Without
  this key the model picker just hides Groq options.

### 4. Environment

Copy `.env.example` to `.env.local` and fill in the Supabase + Gemini
keys at minimum:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

Everything else is optional.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Architecture notes

- **Realtime** uses one Supabase channel per conversation. Messages flow
  via Postgres CDC plus a broadcast `message_sent` event for fast peer
  refresh; presence keeps the avatar list in sync; broadcasts also carry
  typing pulses and reaction-changed events. The hook polls the messages
  API every 5 seconds as a fallback whenever the channel is not
  `SUBSCRIBED`.
- **Owner vs member** — conversation owners are stored as
  `conversations.user_id`. Members live in `conversation_members`.
  An RLS helper (`is_conversation_member`, SECURITY DEFINER) avoids
  recursion between the two tables.
- **Mentions** are stored as `@[Display Name](user-uuid)` tokens in
  message content; the chat API parses them out and writes rows to
  `message_mentions` for unread/notification queries.
- **RAG** chunks documents to ~1000 chars with 250-char overlap, embeds
  via Gemini, retrieves the top 12 by cosine, then keyword-reranks down
  to the top 6 for the prompt. Citations the model uses (`[n]`) are
  persisted on the assistant message for the citation popover.
- **Search** is a `websearch_to_tsquery` RPC over GIN indexes on
  conversation titles and message bodies, with `ts_headline` for
  highlighted snippets.

## Security

- HTTP-only cookie sessions via `@supabase/ssr`
- Row Level Security on every table
- Storage path-based ownership (`<user_id>/<conversation_id>/...`)
- Server-side ownership checks on every API route
- Zod validation on all inputs
- File type + size whitelist (8 MB, images/PDFs/text only)
- Signed URLs (1h TTL) for attachments
- Rate limiting per user (40 chat/min, 8 image/min)
- Markdown sanitized via `rehype-sanitize`
- AI provider keys are server-only
- Security headers (HSTS, X-Frame-Options, Permissions-Policy)

## License

MIT
