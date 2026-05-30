-- =========================================================
-- keko.ai - Message reactions
-- A small, append-only table: one row per (message, user, emoji).
-- Toggling is "delete if exists, otherwise insert".
-- =========================================================

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions(message_id, created_at);

alter table public.message_reactions enable row level security;

-- Read: anyone who can SELECT the underlying message can SELECT its reactions.
-- We piggyback on the messages RLS via an EXISTS check rather than duplicating
-- ownership/membership logic.
drop policy if exists "reactions select if message visible" on public.message_reactions;
create policy "reactions select if message visible"
  on public.message_reactions for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
    )
  );

-- Insert: a user can react on their own behalf to any message they can read.
drop policy if exists "reactions insert own if message visible" on public.message_reactions;
create policy "reactions insert own if message visible"
  on public.message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
    )
  );

-- Delete: a user can only remove their own reactions.
drop policy if exists "reactions delete own" on public.message_reactions;
create policy "reactions delete own"
  on public.message_reactions for delete
  using (user_id = auth.uid());

-- Aggregate view: per (message_id, emoji) totals + which users reacted.
-- Useful for the bubble's reaction strip without N round-trips.
create or replace view public.message_reaction_counts
with (security_invoker = true)
as
  select
    r.message_id,
    r.emoji,
    count(*)::int as count,
    array_agg(r.user_id) as user_ids,
    array_agg(p.display_name order by r.created_at) as display_names
  from public.message_reactions r
  left join public.profiles p on p.id = r.user_id
  group by r.message_id, r.emoji;

grant select on public.message_reaction_counts to authenticated;

-- Add to realtime publication so peers see reactions live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end $$;
