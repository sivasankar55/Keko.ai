'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import { ChatPane } from './chat-pane';
import { EmptyState } from './empty-state';
import { CommandPalette } from '@/components/command-palette';
import { PersonaModal } from '@/components/persona-modal';
import { ShareModal } from '@/components/share-modal';
import type { Conversation, Message, Persona } from '@/lib/types';
import { PERSONAS } from '@/lib/personas';
import { downloadConversationAsMarkdown } from '@/lib/export';
import { toast } from '@/components/ui/toaster';

interface Props {
  user: { id: string; email: string; displayName: string; avatarUrl: string | null };
  conversations: Conversation[];
  customPersonas: Persona[];
  activeConversationId: string | null;
  initialMessages: Message[];
}

export function ChatShell({
  user,
  conversations: initialConvs,
  customPersonas: initialCustom,
  activeConversationId,
  initialMessages,
}: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConvs);
  const [customPersonas, setCustomPersonas] = useState(initialCustom);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [shareConvId, setShareConvId] = useState<string | null>(null);

  useEffect(() => {
    setConversations(initialConvs);
  }, [initialConvs]);

  // Note: we intentionally do NOT sync customPersonas from initialCustom on
  // re-renders. The page is `force-dynamic` and any router.refresh() ships a
  // fresh server payload — but if a freshly-created persona hasn't yet hit the
  // server roundtrip, syncing here would clobber the optimistic update and
  // make the new persona "disappear" from the sidebar dropdown until the user
  // selects it elsewhere. The PersonaModal refreshes itself on open, so the
  // canonical list is always recoverable.

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((s) => !s);
      } else if (meta && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        // Avoid hijacking Ctrl+N in browsers when focused in input — only if not in editable
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        handleNewConversation('keko');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  const handleNewConversation = useCallback(
    async (personaId: string, opts?: { initialPrompt?: string }) => {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaId }),
      });
      if (!res.ok) {
        toast({ title: 'Could not start conversation', variant: 'error' });
        return;
      }
      const { conversation } = await res.json();
      setConversations((c) => [conversation, ...c]);
      // If we have an initial prompt, attach it to URL via hash so chat-pane can pick it up.
      const url = opts?.initialPrompt
        ? `/?c=${conversation.id}#prompt=${encodeURIComponent(opts.initialPrompt)}`
        : `/?c=${conversation.id}`;
      router.push(url);
      router.refresh();
      setSidebarOpen(false);
    },
    [router],
  );

  async function handleDelete(id: string) {
    const conv = conversations.find((c) => c.id === id);
    const isOwner = conv ? conv.user_id === user.id : true;
    const verb = isOwner ? 'Delete' : 'Leave';
    const past = isOwner ? 'Deleted' : 'Left conversation';

    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: `${verb} failed`, variant: 'error' });
      return;
    }
    setConversations((c) => c.filter((x) => x.id !== id));
    if (activeConversationId === id) router.push('/');
    router.refresh();
    toast({ title: past, variant: 'success' });
  }

  async function handleRename(id: string, title: string) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast({ title: 'Rename failed', variant: 'error' });
      return;
    }
    setConversations((c) => c.map((x) => (x.id === id ? { ...x, title } : x)));
  }

  async function handlePinToggle(id: string, pinned: boolean) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    if (!res.ok) {
      toast({ title: 'Pin failed', variant: 'error' });
      return;
    }
    setConversations((c) =>
      c
        .map((x) =>
          x.id === id ? { ...x, pinned_at: pinned ? new Date().toISOString() : null } : x,
        )
        .sort((a, b) => {
          const aP = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
          const bP = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
          if (aP !== bP) return bP - aP;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }),
    );
  }

  async function handleExport(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    try {
      const res = await fetch(`/api/conversations/${id}/messages`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      downloadConversationAsMarkdown(conv, j.messages ?? [], customPersonas);
      toast({ title: 'Downloaded', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'error' });
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-bg">
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 surface rounded-md p-2"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden lg:block w-[260px] shrink-0 h-full">
        <Sidebar
          user={user}
          selfUserId={user.id}
          conversations={conversations}
          customPersonas={customPersonas}
          activeId={activeConversationId}
          onNew={handleNewConversation}
          onDelete={handleDelete}
          onRename={handleRename}
          onPinToggle={handlePinToggle}
          onShare={(id) => setShareConvId(id)}
          onExport={handleExport}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenPersonaModal={() => setPersonaModalOpen(true)}
        />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-fg/30 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-[280px] z-50"
            >
              <Sidebar
                user={user}
                selfUserId={user.id}
                conversations={conversations}
                customPersonas={customPersonas}
                activeId={activeConversationId}
                onNew={handleNewConversation}
                onDelete={handleDelete}
                onRename={handleRename}
                onPinToggle={handlePinToggle}
                onShare={(id) => setShareConvId(id)}
                onExport={handleExport}
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenPersonaModal={() => setPersonaModalOpen(true)}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 h-full overflow-hidden">
        {active ? (
          <ChatPane
            key={active.id}
            conversation={active}
            initialMessages={initialMessages}
            user={user}
            customPersonas={customPersonas}
          />
        ) : (
          <EmptyState
            onStart={handleNewConversation}
            onStartWithPrompt={(personaId, prompt) =>
              handleNewConversation(personaId, { initialPrompt: prompt })
            }
            customPersonas={customPersonas}
            onCreatePersona={() => setPersonaModalOpen(true)}
          />
        )}
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        personas={[...PERSONAS, ...customPersonas]}
        onNew={handleNewConversation}
        onCreatePersona={() => setPersonaModalOpen(true)}
      />

      <PersonaModal
        open={personaModalOpen}
        onClose={() => setPersonaModalOpen(false)}
        customPersonas={customPersonas}
        onCreated={(p) => {
          setCustomPersonas((s) => [p, ...s]);
        }}
        onDeleted={(id) => {
          setCustomPersonas((s) => s.filter((p) => p.id !== id));
        }}
      />

      <ShareModal
        open={shareConvId !== null}
        onClose={() => setShareConvId(null)}
        conversationId={shareConvId}
        conversationTitle={conversations.find((c) => c.id === shareConvId)?.title}
      />
    </div>
  );
}
