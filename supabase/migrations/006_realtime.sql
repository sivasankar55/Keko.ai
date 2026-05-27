-- =========================================================
-- keko.ai - Real-time collaboration
-- (Updated: uses a SECURITY DEFINER helper to avoid RLS
--  infinite recursion between conversations and members.)
-- =========================================================

-- Members of a conversation. Owner is implicit via conversations.user_id.
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members(user_id);

alter table public.conversation_members enable row level security;

-- Helper: is the given user a member of the given conversation?
-- SECURITY DEFINER so it can read members without invoking RLS recursively.
create or replace function public.is_conversation_member(p_conv uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = p_user
  );
$$;

grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

-- Member rows: a user sees their own member rows and member rows of conversations they own.
drop policy if exists "members select if member" on public.conversation_members;
create policy "members select if member"
  on public.conversation_members for select
  using (
    user_id = auth.uid()
    or conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  );

-- Only the owner can insert/update/delete arbitrary member rows.
drop policy if exists "members write if owner" on public.conversation_members;
create policy "members write if owner"
  on public.conversation_members for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_members.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_members.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Members can leave (delete their own row, except owner).
drop policy if exists "members can leave" on public.conversation_members;
create policy "members can leave"
  on public.conversation_members for delete
  using (user_id = auth.uid() and role <> 'owner');

-- Invite tokens
create table if not exists public.invite_links (
  token text primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists invite_links_conv_idx
  on public.invite_links(conversation_id);
create unique index if not exists invite_links_one_active_per_conv
  on public.invite_links(conversation_id) where revoked_at is null;

alter table public.invite_links enable row level security;

drop policy if exists "invite select own" on public.invite_links;
create policy "invite select own"
  on public.invite_links for select
  using (auth.uid() = user_id);

drop policy if exists "invite write own" on public.invite_links;
create policy "invite write own"
  on public.invite_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public RPC to redeem an invite token. Inserts the caller as a member.
create or replace function public.redeem_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_conv record;
begin
  if auth.uid() is null then
    return json_build_object('error', 'must be signed in');
  end if;

  select * into v_invite
    from public.invite_links
    where token = p_token and revoked_at is null
    limit 1;

  if v_invite.token is null then
    return json_build_object('error', 'invalid or revoked invite');
  end if;

  select id, user_id, title, persona_id, model_id
    into v_conv
    from public.conversations
    where id = v_invite.conversation_id;

  if v_conv.user_id = auth.uid() then
    return json_build_object('conversation_id', v_conv.id);
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conv.id, auth.uid(), 'member')
    on conflict do nothing;

  return json_build_object('conversation_id', v_conv.id);
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;

-- Conversation/message reads: owner OR member (via helper, no recursion).
drop policy if exists "conversations select if member" on public.conversations;
create policy "conversations select if member"
  on public.conversations for select
  using (
    auth.uid() = user_id
    or public.is_conversation_member(id, auth.uid())
  );

drop policy if exists "messages select if member" on public.messages;
create policy "messages select if member"
  on public.messages for select
  using (
    auth.uid() = user_id
    or public.is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "messages insert if member" on public.messages;
create policy "messages insert if member"
  on public.messages for insert
  with check (
    user_id = auth.uid()
    and (
      conversation_id in (select id from public.conversations where user_id = auth.uid())
      or public.is_conversation_member(conversation_id, auth.uid())
    )
  );

-- Enable realtime publication on messages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
