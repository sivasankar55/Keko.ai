-- =========================================================
-- keko.ai - Search overhaul
-- Adds Postgres full-text search indexes plus a SECURITY INVOKER RPC
-- that returns ranked results with snippets and highlights.
-- =========================================================

-- FTS indexes on the columns we search. We use english config — good enough
-- for stemming "writing" -> "write", and tolerant of mixed casing.
create index if not exists conversations_title_fts_idx
  on public.conversations using gin (to_tsvector('english', coalesce(title, '')));

create index if not exists messages_content_fts_idx
  on public.messages using gin (to_tsvector('english', coalesce(content, '')));

-- The search RPC. Honours RLS by being SECURITY INVOKER.
-- Returns: conversation row + best matching message snippet (already
-- HTML-escaped and wrapped with <mark> tags by ts_headline) + rank.
--
-- Filters:
--   p_query           : the user's search query (required, plainto_tsquery'd)
--   p_persona_id      : optional persona/custom-persona id filter
--   p_date_from       : optional inclusive lower bound on conversations.updated_at
--   p_date_to         : optional inclusive upper bound on conversations.updated_at
--   p_has_attachments : when true, only conversations whose messages have attachments
--   p_branched_only   : when true, only conversations forked from another
--   p_limit           : default 20
create or replace function public.search_conversations(
  p_query           text,
  p_persona_id      text default null,
  p_date_from       timestamptz default null,
  p_date_to         timestamptz default null,
  p_has_attachments boolean default false,
  p_branched_only   boolean default false,
  p_limit           int default 20
)
returns table (
  id uuid,
  title text,
  persona_id text,
  updated_at timestamptz,
  branched_from_conversation_id uuid,
  snippet text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tsq tsquery;
begin
  if p_query is null or length(trim(p_query)) = 0 then
    return;
  end if;

  -- websearch_to_tsquery handles quoted phrases and OR/-operators naturally.
  v_tsq := websearch_to_tsquery('english', p_query);

  return query
  with msg_matches as (
    select
      m.conversation_id,
      ts_rank(to_tsvector('english', coalesce(m.content, '')), v_tsq) as msg_rank,
      ts_headline(
        'english',
        m.content,
        v_tsq,
        'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MaxWords=24, MinWords=10, ShortWord=2'
      ) as snippet,
      row_number() over (
        partition by m.conversation_id
        order by ts_rank(to_tsvector('english', coalesce(m.content, '')), v_tsq) desc
      ) as rn
    from public.messages m
    where to_tsvector('english', coalesce(m.content, '')) @@ v_tsq
  ),
  conv_title as (
    select
      c.id,
      ts_rank(to_tsvector('english', coalesce(c.title, '')), v_tsq) as title_rank
    from public.conversations c
    where to_tsvector('english', coalesce(c.title, '')) @@ v_tsq
  ),
  combined as (
    select
      c.id,
      c.title,
      c.persona_id,
      c.updated_at,
      c.branched_from_conversation_id,
      coalesce(mm.snippet, '') as snippet,
      coalesce(ct.title_rank, 0) * 1.5 + coalesce(mm.msg_rank, 0) as rank
    from public.conversations c
    left join msg_matches mm on mm.conversation_id = c.id and mm.rn = 1
    left join conv_title ct on ct.id = c.id
    where (mm.conversation_id is not null or ct.id is not null)
      and (p_persona_id is null or c.persona_id = p_persona_id)
      and (p_date_from is null or c.updated_at >= p_date_from)
      and (p_date_to is null or c.updated_at <= p_date_to)
      and (not p_branched_only or c.branched_from_conversation_id is not null)
      and (
        not p_has_attachments
        or exists (
          select 1 from public.messages m2
          where m2.conversation_id = c.id
            and m2.attachments is not null
            and jsonb_array_length(m2.attachments) > 0
        )
      )
  )
  select
    combined.id,
    combined.title,
    combined.persona_id,
    combined.updated_at,
    combined.branched_from_conversation_id,
    combined.snippet,
    combined.rank
  from combined
  order by combined.rank desc, combined.updated_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function public.search_conversations(text, text, timestamptz, timestamptz, boolean, boolean, int) to authenticated;
