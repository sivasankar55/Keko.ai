import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ChatShell } from '@/components/chat/chat-shell';
import { dbToPersona } from '@/lib/personas';
import type { Conversation, Persona } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [convsRes, personasRes, profileRes] = await Promise.all([
    // RLS handles ownership (owner OR member); we don't need .eq('user_id', user.id) here.
    supabase
      .from('conversations')
      .select('*')
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('personas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  const conversations: Conversation[] = convsRes.data ?? [];
  const customPersonas: Persona[] = (personasRes.data ?? []).map(dbToPersona);
  const profile = profileRes.data;
  const activeId = searchParams.c ?? conversations[0]?.id ?? null;

  let messages: any[] = [];
  if (activeId) {
    // Try author-joined view first (gives display_name + avatar for shared chats).
    let res = await supabase
      .from('messages_with_author')
      .select('*')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true });
    if (res.error) {
      // View not yet migrated — fall back to plain messages table.
      res = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true });
    }
    messages = res.data ?? [];
  }

  return (
    <ChatShell
      user={{
        id: user.id,
        email: user.email ?? '',
        displayName: profile?.display_name ?? user.email?.split('@')[0] ?? 'You',
        avatarUrl: profile?.avatar_url ?? null,
      }}
      conversations={conversations}
      customPersonas={customPersonas}
      activeConversationId={activeId}
      initialMessages={messages}
    />
  );
}
