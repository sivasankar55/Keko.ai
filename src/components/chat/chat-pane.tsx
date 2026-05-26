'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, Upload, ChevronDown, BookOpen } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import { Composer } from './composer';
import { DocumentsModal } from '@/components/documents-modal';
import { getPersona } from '@/lib/personas';
import { toast } from '@/components/ui/toaster';
import { useFileUpload } from '@/lib/use-file-upload';
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
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<Attachment[] | undefined>(undefined);
  const [autoScroll, setAutoScroll] = useState(true);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const { upload } = useFileUpload(conversation.id);

  const persona = getPersona(conversation.persona_id, customPersonas);

  // Fetch doc count for this conversation
  useEffect(() => {
    fetch(`/api/rag/documents?conversationId=${conversation.id}`)
      .then((r) => r.json())
      .then((j) => setDocCount((j.documents ?? []).filter((d: any) => d.status === 'ready').length))
      .catch(() => {});
  }, [conversation.id, docsOpen]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, conversation.id]);

  useEffect(() => {
    if (!autoScroll) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streaming, autoScroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 80);
  }

  function jumpToLatest() {
    setAutoScroll(true);
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }

  // Drag-and-drop handlers
  function onDragEnter(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const uploaded = await upload(files, 0);
    if (uploaded.length > 0) {
      setPendingDrop(uploaded);
      toast({
        title: `${uploaded.length} attachment${uploaded.length > 1 ? 's' : ''} ready`,
        variant: 'success',
      });
    }
  }

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
        // Stopped by user; if nothing streamed, mark as stopped, otherwise keep partial.
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last && !last.content) {
            next[next.length - 1] = { ...last, content: '_(stopped)_' };
          }
          return next;
        });
        // Don't return — let finally run so DB partial is synced.
      } else {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: 'Something went wrong. ' + (e.message ?? ''),
          };
          return next;
        });
        toast({ title: 'Message failed', description: e.message, variant: 'error' });
      }
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
    <div
      className="flex flex-col h-full relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="drop-overlay"
          >
            <div className="text-center">
              <Upload className="h-10 w-10 mx-auto text-accent mb-3" />
              <p className="font-display text-[28px] tracking-tight">Drop to attach</p>
              <p className="text-subtle text-[13px] mt-1">
                Up to 4 files. Images, PDFs, and text up to 8MB each.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="px-6 lg:px-8 py-4 border-b border-hairline">
        <div className="max-w-3xl mx-auto flex items-baseline gap-3">
          <span className="text-[14px] opacity-60">{persona.emoji}</span>
          <p className="text-[14px] text-fg truncate">{conversation.title}</p>
          <button
            onClick={() => setDocsOpen(true)}
            className="ml-auto text-[11.5px] text-faint hover:text-fg transition flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted"
            title="Documents"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {docCount > 0 ? (
              <span>{docCount} doc{docCount === 1 ? '' : 's'}</span>
            ) : (
              <span className="hidden sm:inline">Docs</span>
            )}
          </button>
          <p className="text-[12px] text-faint truncate">
            {persona.name}{persona.custom ? ' · custom' : ''}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-6 lg:px-8 py-10"
      >
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

      <div className="relative">
        <AnimatePresence>
          {!autoScroll && (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              onClick={jumpToLatest}
              className="absolute -top-12 left-1/2 -translate-x-1/2 surface rounded-full px-3.5 py-1.5 text-[12px] flex items-center gap-1.5 hover:border-fg/40 transition shadow-sm"
            >
              <ChevronDown className="h-3 w-3" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <Composer
        conversationId={conversation.id}
        onSend={sendMessage}
        onGenerateImage={generateImage}
        disabled={streaming}
        externalAttachments={pendingDrop}
        onConsumeExternal={() => setPendingDrop(undefined)}
      />

      <DocumentsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        conversationId={conversation.id}
      />
    </div>
  );
}

function greet(name: string) {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${time}. I'm ${name}`;
}
