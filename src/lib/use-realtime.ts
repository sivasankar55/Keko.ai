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
 * - Postgres INSERTs on messages → fetch full row from API + call onIncomingMessage
 * - Presence → list of currently-active members
 *
 * We re-fetch via the messages API rather than trusting the realtime payload
 * because Realtime delivers based on the subscription's RLS context, but our
 * member RLS uses a SECURITY DEFINER helper — the API path evaluates RLS
 * correctly with the authenticated session.
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

  // Track which message IDs we've already delivered to avoid double inserts.
  const seenIds = useRef<Set<string>>(new Set());

  // Polling fallback for cases where realtime CDC drops events.
  useEffect(() => {
    seenIds.current = new Set();
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { presence: { key: selfUserId } },
    });

    async function refreshAndDispatch() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { messages } = await res.json();
        for (const m of messages as Message[]) {
          if (!seenIds.current.has(m.id)) {
            seenIds.current.add(m.id);
            handlerRef.current(m);
          }
        }
      } catch {
        // ignore
      }
    }

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      () => {
        // Realtime payload may be missing/filtered by RLS depending on
        // subscriber's session. Re-fetch via API to get authoritative state.
        refreshAndDispatch();
      },
    );

    // Broadcast channel: peers can ping us when they send a message,
    // as a fallback path that doesn't rely on Postgres CDC.
    channel.on('broadcast', { event: 'message_sent' }, () => {
      refreshAndDispatch();
    });

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

    // Polling fallback every 8s — catches anything realtime missed.
    const pollHandle = setInterval(refreshAndDispatch, 8000);

    return () => {
      clearInterval(pollHandle);
      supabase.removeChannel(channel);
    };
  }, [conversationId, selfUserId, selfDisplayName, selfAvatarUrl]);

  // Helper exposed to callers: notify peers that we just sent a message,
  // so they can refresh their state immediately.
  function notifyPeers() {
    const supabase = createClient();
    const channel = supabase.channel(`conv:${conversationId}`);
    channel.send({ type: 'broadcast', event: 'message_sent', payload: {} });
  }

  return { presence, notifyPeers };
}
