'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
 * - Postgres INSERTs on messages → fetch full row from API + dispatch
 * - Broadcast pings from peers → fetch and dispatch immediately
 * - Periodic polling as a safety net (3s)
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

  // Hold a ref to the live channel so notifyPeers() can broadcast on the
  // already-subscribed connection (Supabase requires .subscribe() before .send()).
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  // Reset the seen-set whenever we switch conversations.
  useEffect(() => {
    seenIds.current = new Set();
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { presence: { key: selfUserId } },
    });
    channelRef.current = channel;
    subscribedRef.current = false;

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
    // as a fast path that doesn't rely on Postgres CDC.
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
        subscribedRef.current = true;
        await channel.track({
          user_id: selfUserId,
          display_name: selfDisplayName,
          avatar_url: selfAvatarUrl,
        } as PresenceUser);
        // Catch up on anything that happened before this client subscribed
        // (own messages, peer messages sent while we were loading, etc.).
        refreshAndDispatch();
      } else {
        // Channel disconnected, errored, or hasn't connected yet — fall back
        // to polling until it recovers.
        subscribedRef.current = false;
      }
    });

    // Polling safety net — only ticks while the channel is NOT subscribed.
    // When realtime is healthy this is a no-op; when it isn't, we still
    // converge on the truth every 5s. Keeps idle tabs cheap.
    const pollHandle = setInterval(() => {
      if (subscribedRef.current) return;
      refreshAndDispatch();
    }, 5000);

    // Also refresh when the tab regains focus, so a returning user catches up
    // without waiting for the next poll tick.
    const onFocus = () => refreshAndDispatch();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(pollHandle);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, selfUserId, selfDisplayName, selfAvatarUrl]);

  // Notify peers that we just sent a message so they refresh immediately.
  // Uses the live, already-subscribed channel — Supabase requires that for
  // broadcast .send() to actually emit anything.
  function notifyPeers() {
    const ch = channelRef.current;
    if (!ch || !subscribedRef.current) return;
    ch.send({ type: 'broadcast', event: 'message_sent', payload: {} });
  }

  return { presence, notifyPeers };
}
