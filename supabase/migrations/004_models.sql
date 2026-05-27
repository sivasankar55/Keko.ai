-- =========================================================
-- keko.ai - Multi-model support
-- Adds a per-conversation model selection.
-- =========================================================

alter table public.conversations
  add column if not exists model_id text;
