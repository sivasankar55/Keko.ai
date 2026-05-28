-- =========================================================
-- keko.ai - Silent messages
-- A "silent" message is one a user sends to other humans in a
-- shared conversation without invoking the AI. Stored as a flag
-- on the message row so peers can render a marker for it.
-- =========================================================

alter table public.messages
  add column if not exists silent boolean not null default false;

create index if not exists messages_conv_silent_idx
  on public.messages(conversation_id, silent)
  where silent = true;

-- Sender attribution: when we render a shared conversation, we want
-- to know which member sent each message (without joining auth.users).
-- A view that joins messages -> profiles for display purposes.
create or replace view public.messages_with_author
with (security_invoker = true)
as
  select
    m.*,
    p.display_name as author_display_name,
    p.avatar_url as author_avatar_url
  from public.messages m
  left join public.profiles p on p.id = m.user_id;

grant select on public.messages_with_author to authenticated;
