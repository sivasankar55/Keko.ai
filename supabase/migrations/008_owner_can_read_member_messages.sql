-- =========================================================
-- keko.ai - Fix: conversation owner can read member messages
--
-- The previous policy only allowed reads for the message's own
-- author or rows tied to a conversation_members entry. Owners
-- are implicit (conversations.user_id) and intentionally NOT
-- in conversation_members, so RLS was hiding member messages
-- from the owner. This restores symmetric visibility.
-- =========================================================

drop policy if exists "messages select if member" on public.messages;
create policy "messages select if member"
  on public.messages for select
  using (
    auth.uid() = user_id
    or public.is_conversation_member(conversation_id, auth.uid())
    or conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  );
