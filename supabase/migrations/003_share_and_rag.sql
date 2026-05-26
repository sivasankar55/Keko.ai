-- =========================================================
-- keko.ai - Share links + RAG (document chat)
-- Run AFTER 002_features.sql in the Supabase SQL editor.
-- Safe to re-run.
-- =========================================================

-- ---------------------------------------------------------
-- Share links: a shareable read-only token per conversation.
-- ---------------------------------------------------------

create table if not exists public.share_links (
  token text primary key,                 -- random URL-safe id
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists share_links_conv_idx
  on public.share_links(conversation_id);

create unique index if not exists share_links_one_active_per_conv
  on public.share_links(conversation_id) where revoked_at is null;

alter table public.share_links enable row level security;

drop policy if exists "share_links select own" on public.share_links;
create policy "share_links select own"
  on public.share_links for select
  using (auth.uid() = user_id);

drop policy if exists "share_links insert own" on public.share_links;
create policy "share_links insert own"
  on public.share_links for insert
  with check (auth.uid() = user_id);

drop policy if exists "share_links update own" on public.share_links;
create policy "share_links update own"
  on public.share_links for update
  using (auth.uid() = user_id);

drop policy if exists "share_links delete own" on public.share_links;
create policy "share_links delete own"
  on public.share_links for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- Public read function for shared conversations.
-- Bypasses RLS via SECURITY DEFINER. Only returns rows for
-- conversations with an active (non-revoked) share link.
-- ---------------------------------------------------------

create or replace function public.get_shared_conversation(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv record;
  v_messages json;
begin
  select c.id, c.title, c.persona_id, c.created_at, c.updated_at
    into v_conv
    from public.share_links sl
    join public.conversations c on c.id = sl.conversation_id
    where sl.token = p_token
      and sl.revoked_at is null
    limit 1;

  if v_conv.id is null then
    return null;
  end if;

  select coalesce(json_agg(row_to_json(m) order by m.created_at), '[]'::json)
    into v_messages
    from (
      select id, role, content, created_at, attachments
        from public.messages
        where conversation_id = v_conv.id
        order by created_at asc
    ) m;

  return json_build_object(
    'conversation', row_to_json(v_conv),
    'messages', v_messages
  );
end;
$$;

grant execute on function public.get_shared_conversation(text) to anon, authenticated;

-- ---------------------------------------------------------
-- RAG: documents + chunks with embeddings
-- ---------------------------------------------------------

create extension if not exists vector;

-- A "document" is a user-uploaded source (e.g., a PDF).
create table if not exists public.rag_documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  name text not null,
  mime text not null,
  size_bytes integer not null default 0,
  storage_path text not null,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists rag_documents_user_idx
  on public.rag_documents(user_id, created_at desc);

create index if not exists rag_documents_conv_idx
  on public.rag_documents(conversation_id);

alter table public.rag_documents enable row level security;

drop policy if exists "rag_documents select own" on public.rag_documents;
create policy "rag_documents select own"
  on public.rag_documents for select
  using (auth.uid() = user_id);

drop policy if exists "rag_documents insert own" on public.rag_documents;
create policy "rag_documents insert own"
  on public.rag_documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "rag_documents update own" on public.rag_documents;
create policy "rag_documents update own"
  on public.rag_documents for update
  using (auth.uid() = user_id);

drop policy if exists "rag_documents delete own" on public.rag_documents;
create policy "rag_documents delete own"
  on public.rag_documents for delete
  using (auth.uid() = user_id);

-- Chunks of each document, with embeddings.
-- Gemini text-embedding-004 produces 768-dimensional vectors.
create table if not exists public.rag_chunks (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists rag_chunks_user_idx
  on public.rag_chunks(user_id);

create index if not exists rag_chunks_doc_idx
  on public.rag_chunks(document_id);

create index if not exists rag_chunks_conv_idx
  on public.rag_chunks(conversation_id);

-- IVFFLAT index for fast cosine similarity search.
-- (Re-create after substantial inserts to rebalance lists.)
create index if not exists rag_chunks_embedding_idx
  on public.rag_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.rag_chunks enable row level security;

drop policy if exists "rag_chunks select own" on public.rag_chunks;
create policy "rag_chunks select own"
  on public.rag_chunks for select
  using (auth.uid() = user_id);

drop policy if exists "rag_chunks insert own" on public.rag_chunks;
create policy "rag_chunks insert own"
  on public.rag_chunks for insert
  with check (auth.uid() = user_id);

drop policy if exists "rag_chunks delete own" on public.rag_chunks;
create policy "rag_chunks delete own"
  on public.rag_chunks for delete
  using (auth.uid() = user_id);

-- Search function: returns the top-k most similar chunks for a user
-- (optionally narrowed to a conversation), with cosine similarity score.
create or replace function public.match_rag_chunks(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count integer default 6,
  p_conversation_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  chunk_index integer,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    d.name as document_name,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.rag_chunks c
  join public.rag_documents d on d.id = c.document_id
  where c.user_id = p_user_id
    and (p_conversation_id is null or c.conversation_id = p_conversation_id)
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit greatest(1, p_match_count);
$$;
