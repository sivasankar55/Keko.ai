'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import { Composer } from './composer';
import { getPersona } from '@/lib/personas';
import { toast } from '@/components/ui/toaster';
import type { Conversation, Message, Attachment, Persona } from '@/lib/types';

interface Props {
  conversation: Conversation;
  initialMessages: Message[];
  user: { id: string; displayName: string; avatarUrl: string | null };
  customPersonas: Persona[];
}

export function ChatPane({ conversation, initialMessages, user, customPersonas }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const persona = getPersona(conversation.persona_id, customPersonas);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, conversation.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streaming]);

  function stopGeneration() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  // Pull authoritative messages from the server so client IDs/timestamps match the DB.
  // Critical for delete/regenerate/edit — they reference real DB rows.
  async function refreshMessages() {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const { messages: real } = await res.json();
      setMessages(real);
    } catch {
      // ignore
    }
  }

  async function streamChat(content: string, attachments: Attachment[]) {
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: content,
          attachments: attachments.map((a) => ({
            path: a.path,
            name: a.name,
            type: a.type,
            size: a.size,
          })),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { ...next[next.length - 1], content: acc };
          return next;
        });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // Mark as stopped, don't append error text
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last && !last.content) {
            next[next.length - 1] = { ...last, content: '_(stopped)_' };
          }
          return next;
        });
        return;
      }
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: 'Something went wrong. ' + (e.message ?? ''),
        };
        return next;
      });
      toast({ title: 'Message failed', description: e.message, variant: 'error' });
    } finally {
      // Sync local state with the database — replaces optimistic `temp-*` IDs
      // with real ones so subsequent delete/regenerate/edit work after a refresh.
      await refreshMessages();
    }
  }

  async function sendMessage(content: string, attachments: Attachment[]) {
    const userMsg: Message = {
      id: `temp-u-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'user',
      content,
      attachments: attachments.length ? attachments : null,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      id: `temp-a-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStreaming(true);
    await streamChat(content, attachments);
    setStreaming(false);
  }

  // Build the truncate request body — prefer messageId for real DB rows.
  function truncateBody(msg: Message) {
    if (msg.id && !msg.id.startsWith('temp-')) {
      return {
        conversationId: conversation.id,
        messageId: msg.id,
      };
    }
    return {
      conversationId: conversation.id,
      fromCreatedAt: msg.created_at,
    };
  }

  async function regenerateAt(index: number) {
    if (streaming) return;
    const userIdx = index - 1;
    const userMsg = messages[userIdx];
    if (!userMsg || userMsg.role !== 'user') {
      toast({ title: "Can't regenerate", description: 'No previous user message.', variant: 'error' });
      return;
    }
    const assistantMsg = messages[index];
    if (!assistantMsg) return;

    await fetch('/api/messages/truncate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(truncateBody(assistantMsg)),
    });

    const placeholder: Message = {
      id: `temp-a-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m.slice(0, index), placeholder]);
    setStreaming(true);
    const attachments = (userMsg.attachments ?? []) as Attachment[];
    await streamChat(userMsg.content, attachments);
    setStreaming(false);
  }

  async function editUserMessage(index: number, newContent: string) {
    if (streaming) return;
    const target = messages[index];
    if (!target || target.role !== 'user') return;

    await fetch('/api/messages/truncate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(truncateBody(target)),
    });

    const userMsg: Message = {
      id: `temp-u-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'user',
      content: newContent,
      attachments: target.attachments ?? null,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      id: `temp-a-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m.slice(0, index), userMsg, assistantMsg]);
    setStreaming(true);
    const attachments = (target.attachments ?? []) as Attachment[];
    await streamChat(newContent, attachments);
    setStreaming(false);
  }

  async function deleteFrom(index: number) {
    if (streaming) return;
    const target = messages[index];
    if (!target) return;
    const res = await fetch('/api/messages/truncate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(truncateBody(target)),
    });
    if (!res.ok) {
      toast({ title: 'Delete failed', variant: 'error' });
      return;
    }
    setMessages((m) => m.slice(0, index));
    // Re-sync to make sure the server actually deleted what we expected.
    await refreshMessages();
  }

  async function generateImage(prompt: string) {
    const placeholder: Message = {
      id: `temp-u-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'user',
      content: `Generate image: ${prompt}`,
      created_at: new Date().toISOString(),
    };
    const result: Message = {
      id: `temp-a-${Date.now()}`,
      conversation_id: conversation.id,
      role: 'assistant',
      content: 'Imagining…',
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, placeholder, result]);
    setStreaming(true);

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, conversationId: conversation.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { attachment, content } = await res.json();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content,
          attachments: [attachment],
        };
        return next;
      });
    } catch (e: any) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...next[next.length - 1],
          content: 'Image generation failed. ' + (e.message ?? ''),
        };
        return next;
      });
      toast({ title: 'Image failed', description: e.message, variant: 'error' });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 lg:px-8 py-4 border-b border-hairline">
        <div className="max-w-3xl mx-auto flex items-baseline gap-3">
          <span className="text-[14px] opacity-60">{persona.emoji}</span>
          <p className="text-[14px] text-fg truncate">{conversation.title}</p>
          <p className="text-[12px] text-faint truncate ml-auto">
            {persona.name}{persona.custom ? ' · custom' : ''}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 lg:px-8 py-10">
        <div className="max-w-3xl mx-auto space-y-7">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="py-12"
            >
              <p className="font-display text-[40px] leading-[1.05] tracking-tight">
                {greet(persona.name)}.
              </p>
              <p className="text-subtle mt-3 text-[15px] max-w-md">{persona.tagline}</p>
            </motion.div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const isAssistant = m.role === 'assistant';
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  user={user}
                  personaEmoji={persona.emoji}
                  personaName={persona.name}
                  isStreaming={streaming && isLast && isAssistant && !m.content}
                  onRegenerate={
                    isAssistant && !streaming && !m.id.startsWith('temp-')
                      ? () => regenerateAt(i)
                      : isAssistant && !streaming
                      ? () => regenerateAt(i)
                      : undefined
                  }
                  onEdit={
                    m.role === 'user' && !streaming
                      ? (newContent) => editUserMessage(i, newContent)
                      : undefined
                  }
                  onDelete={
                    !streaming && messages.length > 1
                      ? () => deleteFrom(i)
                      : undefined
                  }
                />
              );
            })}
          </AnimatePresence>

          {streaming && (
            <div className="flex justify-center pb-2">
              <button
                onClick={stopGeneration}
                className="surface rounded-full px-3.5 py-1.5 text-[12px] flex items-center gap-1.5 hover:border-fg/40 transition"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                Stop generating
              </button>
            </div>
          )}
        </div>
      </div>

      <Composer
        conversationId={conversation.id}
        onSend={sendMessage}
        onGenerateImage={generateImage}
        disabled={streaming}
      />
    </div>
  );
}

function greet(name: string) {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${time}. I'm ${name}`;
}
