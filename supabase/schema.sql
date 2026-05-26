-- =========================================================
-- Luxe AI Chat - Supabase schema
-- Paste this entire file into the Supabase SQL editor
-- (Project -> SQL -> New query) and run.
-- =========================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- =========================================================
-- Tables
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  preferred_theme text default 'obsidian',
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  persona_id text not null default 'keko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_idx
  on public.conversations(user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_idx
  on public.messages(conversation_id, created_at asc);

-- =========================================================
-- Triggers: keep conversations.updated_at fresh, auto profile
-- =========================================================

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Profiles: a user can read & update only their own profile.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  using (auth.uid() = id);

-- Conversations: full ownership.
drop policy if exists "conversations select own" on public.conversations;
create policy "conversations select own"
  on public.conversations for select
  using (auth.uid() = user_id);

drop policy if exists "conversations insert own" on public.conversations;
create policy "conversations insert own"
  on public.conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "conversations update own" on public.conversations;
create policy "conversations update own"
  on public.conversations for update
  using (auth.uid() = user_id);

drop policy if exists "conversations delete own" on public.conversations;
create policy "conversations delete own"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- Messages: full ownership.
drop policy if exists "messages select own" on public.messages;
create policy "messages select own"
  on public.messages for select
  using (auth.uid() = user_id);

drop policy if exists "messages insert own" on public.messages;
create policy "messages insert own"
  on public.messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own"
  on public.messages for delete
  using (auth.uid() = user_id);

-- =========================================================
-- Storage bucket: 'attachments' (private)
-- Run after creating the bucket in Supabase Dashboard
-- (Storage -> New bucket -> name: attachments, public: OFF)
-- =========================================================

-- The path convention is: <user_id>/<conversation_id>/<filename>
-- This lets us enforce ownership purely from the path.

drop policy if exists "attachments owner read" on storage.objects;
create policy "attachments owner read"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "attachments owner insert" on storage.objects;
create policy "attachments owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "attachments owner delete" on storage.objects;
create policy "attachments owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
