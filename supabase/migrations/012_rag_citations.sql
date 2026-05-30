-- =========================================================
-- keko.ai - RAG citations
-- Track which document chunks an assistant message actually used.
-- Lets the bubble render [1], [2]… footnote chips that the user
-- can click to inspect the source passage.
-- =========================================================

alter table public.messages
  add column if not exists cited_chunks jsonb;

-- Helper RPC: fetch the chunk content + document name for a list of chunk
-- IDs. The bubble's citation popover calls this on demand.
create or replace function public.get_rag_chunks(p_chunk_ids uuid[])
returns table (
  id uuid,
  document_id uuid,
  document_name text,
  chunk_index integer,
  content text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    d.name as document_name,
    c.chunk_index,
    c.content
  from public.rag_chunks c
  join public.rag_documents d on d.id = c.document_id
  where c.id = any(p_chunk_ids);
$$;

grant execute on function public.get_rag_chunks(uuid[]) to authenticated;
