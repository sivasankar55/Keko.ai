-- =========================================================
-- keko.ai - Mentions and read receipts
--
-- Two small tables that sit beside messages:
--   message_mentions  — append-only record of who was @'d in each message
--   conversation_reads — per-(user, conversation) cursor for unread counts
--
-- Both are visibility-gated through the existing messages/conversations RLS
-- via EXISTS checks, so we don't duplicate ownership logic.
-- =========================================================

-- ---------- mentions ----------
create table if not exists public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

create index if not exists message_mentions_user_idx
  on public.message_mentions(mentioned_user_id, created_at desc);

alter table public.message_mentions enable row level security;

drop policy if exists "mentions select if message visible" on public.message_mentions;
create policy "mentions select if message visible"
  on public.message_mentions for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_mentions.message_id
    )
  );

-- Inserts come from the chat API (server uses the user's session, so this
-- policy is the gate for that path). The author of the message can write
-- mentions for it.
drop policy if exists "mentions insert by message author" on public.message_mentions;
create policy "mentions insert by message author"
  on public.message_mentions for insert
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_mentions.message_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "mentions delete by message author" on public.message_mentions;
create policy "mentions delete by message author"
  on public.message_mentions for delete
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_mentions.message_id
        and m.user_id = auth.uid()
    )
  );

-- ---------- reads ----------
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_reads_user_idx
  on public.conversation_reads(user_id, last_read_at desc);

alter table public.conversation_reads enable row level security;

drop policy if exists "reads select own" on public.conversation_reads;
create policy "reads select own"
  on public.conversation_reads for select
  using (user_id = auth.uid());

drop policy if exists "reads upsert own if member" on public.conversation_reads;
create policy "reads upsert own if member"
  on public.conversation_reads for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      conversation_id in (select id from public.conversations where user_id = auth.uid())
      or public.is_conversation_member(conversation_id, auth.uid())
    )
  );

-- Convenience RPC: mark a conversation read up to "now" for the caller.
-- Saves a HTTP roundtrip vs. an upsert from the client.
create or replace function public.mark_conversation_read(p_conv uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
    values (p_conv, auth.uid(), now())
    on conflict (conversation_id, user_id)
    do update set last_read_at = excluded.last_read_at;
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Aggregate RPC: how many unread messages (and mentions) per conversation?
-- Used to paint sidebar badges without N round-trips.
create or replace function public.conversation_unread_summary()
returns table (
  conversation_id uuid,
  unread_count int,
  mention_count int,
  last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  -- We compute "unread" as messages strictly after last_read_at, excluding the
  -- caller's own messages. Mentions are messages in that set where the caller
  -- has a row in message_mentions.
  with my_convs as (
    select c.id
      from public.conversations c
      where c.user_id = auth.uid()
         or public.is_conversation_member(c.id, auth.uid())
  ),
  cursors as (
    select c.id as conversation_id,
           coalesce(r.last_read_at, 'epoch'::timestamptz) as last_read_at
      from my_convs c
      left join public.conversation_reads r
        on r.conversation_id = c.id
       and r.user_id = auth.uid()
  )
  select
    cur.conversation_id,
    count(m.id) filter (where m.user_id <> auth.uid())::int as unread_count,
    count(m.id) filter (
      where m.user_id <> auth.uid()
        and exists (
          select 1 from public.message_mentions mm
          where mm.message_id = m.id
            and mm.mentioned_user_id = auth.uid()
        )
    )::int as mention_count,
    max(m.created_at) as last_message_at
  from cursors cur
  left join public.messages m
    on m.conversation_id = cur.conversation_id
   and m.created_at > cur.last_read_at
  group by cur.conversation_id;
$$;

grant execute on function public.conversation_unread_summary() to authenticated;

-- Add to realtime publication so peers see mention rows live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_mentions'
  ) then
    execute 'alter publication supabase_realtime add table public.message_mentions';
  end if;
end $$;
