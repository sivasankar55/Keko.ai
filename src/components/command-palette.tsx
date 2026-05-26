'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, MessageSquare, Sun, Moon, Sparkles, X, Loader2 } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Conversation, Persona } from '@/lib/types';
import { getPersona } from '@/lib/personas';

interface SearchResult {
  id: string;
  title?: string;
  persona_id?: string;
  snippet?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  personas: Persona[];
  onNew: (personaId: string) => void;
  onCreatePersona: () => void;
}

export function CommandPalette({
  open,
  onClose,
  conversations,
  personas,
  onNew,
  onCreatePersona,
}: Props) {
  const router = useRouter();
  const { toggle } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced server search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        if (res.ok) {
          const j = await res.json();
          setResults(j.results ?? []);
        }
      } catch {
        // ignore aborts
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [query]);

  // Build the list of items
  const items = buildItems({
    query,
    results,
    conversations,
    personas,
    onNew,
    onCreatePersona,
    onClose,
    router,
    toggle,
  });

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        items[active]?.action();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  useEffect(() => {
    setActive(0);
  }, [query, results.length]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-fg/30 backdrop-blur-sm z-[80]"
          />
          <div className="fixed inset-x-0 top-[14vh] z-[90] flex justify-center pointer-events-none px-4">
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-[min(92vw,560px)] surface rounded-xl shadow-2xl overflow-hidden"
            >
            <div className="flex items-center gap-2 px-4 h-12 border-b border-hairline">
              <Search className="h-4 w-4 text-faint shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or jump to…"
                className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-faint"
              />
              {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />}
              <button
                onClick={onClose}
                className="text-faint hover:text-fg transition shrink-0"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1.5">
              {items.length === 0 ? (
                <p className="text-center text-[13px] text-faint py-8">No matches.</p>
              ) : (
                items.map((it, i) => (
                  <Item
                    key={it.key}
                    item={it}
                    active={i === active}
                    onMouseEnter={() => setActive(i)}
                  />
                ))
              )}
            </div>

            <div className="border-t border-hairline px-3 py-2 flex items-center gap-3 text-[10.5px] text-faint">
              <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
              <span><span className="kbd">↵</span> select</span>
              <span><span className="kbd">Esc</span> close</span>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

interface CmdItem {
  key: string;
  group?: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  action: () => void;
}

function buildItems(args: {
  query: string;
  results: SearchResult[];
  conversations: Conversation[];
  personas: Persona[];
  onNew: (personaId: string) => void;
  onCreatePersona: () => void;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  toggle: () => void;
}): CmdItem[] {
  const { query, results, conversations, personas, onNew, onCreatePersona, onClose, router, toggle } = args;
  const items: CmdItem[] = [];
  const q = query.trim().toLowerCase();
  const hasQ = q.length >= 2;

  // 1. Search results take priority when querying
  if (hasQ && results.length > 0) {
    for (const r of results) {
      const persona = getPersona(r.persona_id, personas);
      items.push({
        key: `search:${r.id}`,
        group: 'Conversations',
        icon: <MessageSquare className="h-3.5 w-3.5 text-faint" />,
        label: r.title ?? '(untitled)',
        hint: r.snippet,
        action: () => {
          router.push(`/?c=${r.id}`);
          onClose();
        },
      });
      void persona;
    }
  }

  // 2. New conversation actions
  if (!hasQ || 'new conversation'.includes(q) || 'new chat'.includes(q)) {
    items.push({
      key: 'cmd:new',
      group: 'Actions',
      icon: <Plus className="h-3.5 w-3.5 text-faint" />,
      label: 'New conversation',
      hint: 'with Keko',
      action: () => {
        onNew('keko');
        onClose();
      },
    });
  }

  // 3. Personas (each opens a new chat with that persona)
  for (const p of personas) {
    if (hasQ && !p.name.toLowerCase().includes(q) && !p.tagline.toLowerCase().includes(q)) continue;
    items.push({
      key: `persona:${p.id}`,
      group: 'New conversation',
      icon: <span className="text-[13px]">{p.emoji}</span>,
      label: `New chat with ${p.name}`,
      hint: p.tagline,
      action: () => {
        onNew(p.id);
        onClose();
      },
    });
  }

  if (!hasQ || 'create persona'.includes(q)) {
    items.push({
      key: 'cmd:create-persona',
      group: 'Actions',
      icon: <Sparkles className="h-3.5 w-3.5 text-faint" />,
      label: 'Create custom persona',
      action: () => {
        onCreatePersona();
        onClose();
      },
    });
  }

  // 4. Recent conversations when not searching
  if (!hasQ) {
    for (const c of conversations.slice(0, 8)) {
      const persona = getPersona(c.persona_id, personas);
      items.push({
        key: `recent:${c.id}`,
        group: 'Recent',
        icon: <span className="text-[13px]">{persona.emoji}</span>,
        label: c.title,
        hint: persona.name,
        action: () => {
          router.push(`/?c=${c.id}`);
          onClose();
        },
      });
    }
  }

  // 5. Theme toggle
  if (!hasQ || 'theme'.includes(q) || 'dark'.includes(q) || 'light'.includes(q)) {
    items.push({
      key: 'cmd:theme',
      group: 'Settings',
      icon: <Sun className="h-3.5 w-3.5 text-faint" />,
      label: 'Toggle theme',
      action: () => {
        toggle();
        onClose();
      },
    });
  }

  return items;
}

function Item({
  item,
  active,
  onMouseEnter,
}: {
  item: CmdItem;
  active: boolean;
  onMouseEnter: () => void;
}) {
  return (
    <button
      onClick={item.action}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full text-left px-3.5 py-2 flex items-center gap-3 transition',
        active ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <span className="w-5 grid place-items-center shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] truncate">{item.label}</p>
        {item.hint && <p className="text-[11.5px] text-subtle truncate mt-0.5">{item.hint}</p>}
      </div>
      {item.group && (
        <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
          {item.group}
        </span>
      )}
    </button>
  );
}

// Suppress unused warning for icon import we're keeping in the toolbox
void Moon;
