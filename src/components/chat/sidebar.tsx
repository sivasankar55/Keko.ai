'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  LogOut,
  Sun,
  Moon,
  X,
  Search,
  Pin,
  PinOff,
  Sparkles,
  Share2,
  Download,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn, truncate } from '@/lib/utils';
import { PERSONAS, getPersona } from '@/lib/personas';
import { isSoundEnabled, setSoundEnabled } from '@/lib/audio';
import type { Conversation, Persona } from '@/lib/types';

interface Props {
  user: { displayName: string; email: string; avatarUrl: string | null };
  selfUserId: string;
  conversations: Conversation[];
  customPersonas: Persona[];
  activeId: string | null;
  onNew: (personaId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPinToggle: (id: string, pinned: boolean) => void;
  onShare: (id: string) => void;
  onExport: (id: string) => void;
  onOpenPalette: () => void;
  onOpenPersonaModal: () => void;
  onClose?: () => void;
  /** Called whenever the user navigates to a conversation from the list.
   *  In the mobile drawer this triggers a close so the chat appears. */
  onSelectConversation?: () => void;
}

export function Sidebar({
  user,
  selfUserId,
  conversations,
  customPersonas,
  activeId,
  onNew,
  onDelete,
  onRename,
  onPinToggle,
  onShare,
  onExport,
  onOpenPalette,
  onOpenPersonaModal,
  onClose,
  onSelectConversation,
}: Props) {
  const { theme, toggle } = useTheme();
  const [showPersonas, setShowPersonas] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const personasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  useEffect(() => {
    if (!showPersonas) return;
    const onClick = (e: MouseEvent) => {
      if (personasRef.current && !personasRef.current.contains(e.target as Node)) {
        setShowPersonas(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showPersonas]);

  const allPersonas = [...PERSONAS, ...customPersonas];
  const groups = groupConversations(conversations, customPersonas);

  return (
    <aside className="h-full bg-surface border-r border-hairline flex flex-col">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <Link href="/" className="font-display text-[22px] tracking-tight leading-none">
          keko.ai
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-faint hover:text-fg transition" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-3 space-y-1.5 relative" ref={personasRef}>
        <button
          onClick={() => setShowPersonas((s) => !s)}
          className="w-full h-9 rounded-md border border-border hover:border-fg/40 transition flex items-center gap-2 px-3 text-[13px] text-fg"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New conversation</span>
          <span className="ml-auto kbd">N</span>
        </button>

        <button
          onClick={onOpenPalette}
          className="w-full h-9 rounded-md text-faint hover:text-fg hover:bg-muted transition flex items-center gap-2 px-3 text-[13px]"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <span className="ml-auto kbd">⌘K</span>
        </button>

        <AnimatePresence>
          {showPersonas && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-3 right-3 top-10 z-20 surface rounded-lg p-1 shadow-lg max-h-[60vh] overflow-y-auto"
            >
              {allPersonas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onNew(p.id);
                    setShowPersonas(false);
                  }}
                  className="w-full text-left rounded-md hover:bg-muted transition px-2.5 py-2 flex items-center gap-2.5"
                >
                  <span className="text-[15px] w-5 text-center">{p.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight flex items-center gap-1.5">
                      {p.name}
                      {p.custom && <span className="text-[9px] uppercase tracking-wider text-faint">Custom</span>}
                    </p>
                    <p className="text-[11px] text-subtle mt-0.5 truncate">{p.tagline}</p>
                  </div>
                </button>
              ))}
              <div className="border-t border-hairline mt-1 pt-1">
                <button
                  onClick={() => {
                    setShowPersonas(false);
                    onOpenPersonaModal();
                  }}
                  className="w-full text-left rounded-md hover:bg-muted transition px-2.5 py-2 flex items-center gap-2.5 text-faint"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-[12.5px]">Create persona</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto px-2 mt-4 pb-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-subtle">No conversations yet.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-faint font-medium">
                {g.label}
              </p>
              {g.items.map((c) => {
                const persona = getPersona(c.persona_id, customPersonas);
                const isActive = c.id === activeId;
                const isEditing = editingId === c.id;
                const isPinned = !!c.pinned_at;
                const isOwner = c.user_id === selfUserId;
                return (
                  <div key={c.id} className="relative group">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editVal.trim()) onRename(c.id, editVal.trim());
                          setEditingId(null);
                        }}
                        className="px-1"
                      >
                        <input
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onBlur={() => setEditingId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full bg-muted border border-fg/40 rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none"
                        />
                      </form>
                    ) : (
                      <Link
                        href={`/?c=${c.id}`}
                        onClick={() => onSelectConversation?.()}
                        className={cn(
                          'block rounded-md px-3 py-1.5 transition relative',
                          isActive
                            ? 'bg-muted text-fg'
                            : 'text-subtle hover:bg-muted/60 hover:text-fg',
                        )}
                      >
                        <p className="text-[13px] truncate leading-snug flex items-center gap-1.5">
                          <span className="opacity-70">{persona.emoji}</span>
                          <span className="truncate">{truncate(c.title, 26)}</span>
                          {isPinned && (
                            <Pin className="h-2.5 w-2.5 text-faint shrink-0 ml-auto" />
                          )}
                        </p>
                      </Link>
                    )}

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenu(openMenu === c.id ? null : c.id);
                      }}
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2 transition p-1 rounded',
                        'opacity-0 group-hover:opacity-100',
                        openMenu === c.id && 'opacity-100',
                        'hover:bg-bg',
                      )}
                      aria-label="Options"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-subtle" />
                    </button>

                    <AnimatePresence>
                      {openMenu === c.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.14 }}
                          className="absolute right-2 top-9 z-30 surface rounded-md p-1 shadow-lg min-w-[150px]"
                        >
                          <button
                            onClick={() => {
                              onPinToggle(c.id, !isPinned);
                              setOpenMenu(null);
                            }}
                            className="w-full text-left text-[13px] px-2.5 py-1.5 rounded hover:bg-muted transition flex items-center gap-2"
                          >
                            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                            {isPinned ? 'Unpin' : 'Pin'}
                          </button>
                          {isOwner && (
                            <>
                              <button
                                onClick={() => {
                                  onShare(c.id);
                                  setOpenMenu(null);
                                }}
                                className="w-full text-left text-[13px] px-2.5 py-1.5 rounded hover:bg-muted transition flex items-center gap-2"
                              >
                                <Share2 className="h-3 w-3" /> Share
                              </button>
                              <button
                                onClick={() => {
                                  onExport(c.id);
                                  setOpenMenu(null);
                                }}
                                className="w-full text-left text-[13px] px-2.5 py-1.5 rounded hover:bg-muted transition flex items-center gap-2"
                              >
                                <Download className="h-3 w-3" /> Export
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditVal(c.title);
                                  setOpenMenu(null);
                                }}
                                className="w-full text-left text-[13px] px-2.5 py-1.5 rounded hover:bg-muted transition flex items-center gap-2"
                              >
                                <Pencil className="h-3 w-3" /> Rename
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              onDelete(c.id);
                              setOpenMenu(null);
                            }}
                            className="w-full text-left text-[13px] px-2.5 py-1.5 rounded hover:bg-danger/10 text-danger transition flex items-center gap-2"
                          >
                            {isOwner ? (
                              <>
                                <Trash2 className="h-3 w-3" /> Delete
                              </>
                            ) : (
                              <>
                                <LogOut className="h-3 w-3" /> Leave
                              </>
                            )}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-hairline px-3 py-3 pb-safe flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-muted grid place-items-center text-[11px] font-medium text-fg shrink-0 overflow-hidden">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-7 w-7 object-cover" />
          ) : (
            user.displayName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] truncate leading-tight">{user.displayName}</p>
          <p className="text-[10.5px] text-faint truncate leading-tight mt-0.5">{user.email}</p>
        </div>
        <button
          onClick={onOpenPersonaModal}
          className="text-faint hover:text-fg transition p-1.5 rounded hover:bg-muted"
          aria-label="Personas"
          title="Personas"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            const v = !soundOn;
            setSoundOn(v);
            setSoundEnabled(v);
          }}
          className="text-faint hover:text-fg transition p-1.5 rounded hover:bg-muted"
          aria-label="Toggle sound"
          title={soundOn ? 'Sound on' : 'Sound off'}
        >
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={toggle}
          className="text-faint hover:text-fg transition p-1.5 rounded hover:bg-muted"
          aria-label="Toggle theme"
          title={theme === 'bone' ? 'Dark' : 'Light'}
        >
          {theme === 'bone' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-faint hover:text-danger transition p-1.5 rounded hover:bg-muted"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}

function groupConversations(convs: Conversation[], _custom: Persona[]) {
  const now = Date.now();
  const day = 86400000;
  const pinned: Conversation[] = [];
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const week: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const c of convs) {
    if (c.pinned_at) {
      pinned.push(c);
      continue;
    }
    const age = now - new Date(c.updated_at).getTime();
    if (age < day) today.push(c);
    else if (age < day * 2) yesterday.push(c);
    else if (age < day * 7) week.push(c);
    else earlier.push(c);
  }

  return [
    { label: 'Pinned', items: pinned },
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Previous 7 days', items: week },
    { label: 'Earlier', items: earlier },
  ].filter((g) => g.items.length > 0);
}
