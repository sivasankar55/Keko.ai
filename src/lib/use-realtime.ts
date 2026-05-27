'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

export interface PresenceUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Opts {
  conversationId: string;
  selfUserId: string;
  selfDisplayName: string;
  selfAvatarUrl: string | null;
  onIncomingMessage: (msg: Message) => void;
}

/**
 * Subscribe to a conversation's realtime channel:
 * - Postgres INSERTs on messages → call onIncomingMessage
 * - Presence → list of currently-active members
 */
export function useRealtimeChannel({
  conversationId,
  selfUserId,
  selfDisplayName,
  selfAvatarUrl,
  onIncomingMessage,
}: Opts) {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const handlerRef = useRef(onIncomingMessage);
  handlerRef.current = onIncomingMessage;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { presence: { key: selfUserId } },
    });

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const m = payload.new as Message;
        handlerRef.current(m);
      },
    );

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, PresenceUser[]>;
      const users: PresenceUser[] = [];
      for (const arr of Object.values(state)) {
        if (arr && arr[0]) users.push(arr[0]);
      }
      setPresence(users);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: selfUserId,
          display_name: selfDisplayName,
          avatar_url: selfAvatarUrl,
        } as PresenceUser);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, selfUserId, selfDisplayName, selfAvatarUrl]);

  return { presence };
}
