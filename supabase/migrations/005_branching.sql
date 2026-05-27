-- =========================================================
-- keko.ai - Branching conversations
-- Lets a user fork a conversation from any point.
-- The new conversation references the parent and the message
-- it was branched from.
-- =========================================================

alter table public.conversations
  add column if not exists branched_from_conversation_id uuid
    references public.conversations(id) on delete set null;

alter table public.conversations
  add column if not exists branched_from_message_id uuid
    references public.messages(id) on delete set null;

create index if not exists conversations_branched_from_idx
  on public.conversations(branched_from_conversation_id);
