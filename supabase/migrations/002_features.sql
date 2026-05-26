-- =========================================================
-- Luxe AI Chat - Feature additions
-- Run this AFTER schema.sql in the Supabase SQL editor.
-- Safe to re-run.
-- =========================================================

-- Pin conversations
alter table public.conversations
  add column if not exists pinned_at timestamptz;

create index if not exists conversations_pinned_idx
  on public.conversations(user_id, pinned_at desc nulls last, updated_at desc);

-- Custom personas
create table if not exists public.personas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '✨',
  tagline text not null default '',
  system_prompt text not null,
  created_at timestamptz not null default now()
);

create index if not exists personas_user_idx
  on public.personas(user_id, created_at desc);

alter table public.personas enable row level security;

drop policy if exists "personas select own" on public.personas;
create policy "personas select own"
  on public.personas for select
  using (auth.uid() = user_id);

drop policy if exists "personas insert own" on public.personas;
create policy "personas insert own"
  on public.personas for insert
  with check (auth.uid() = user_id);

drop policy if exists "personas update own" on public.personas;
create policy "personas update own"
  on public.personas for update
  using (auth.uid() = user_id);

drop policy if exists "personas delete own" on public.personas;
create policy "personas delete own"
  on public.personas for delete
  using (auth.uid() = user_id);

-- Search performance: trigram indexes for ILIKE queries
create extension if not exists pg_trgm;

create index if not exists messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);

create index if not exists conversations_title_trgm_idx
  on public.conversations using gin (title gin_trgm_ops);
