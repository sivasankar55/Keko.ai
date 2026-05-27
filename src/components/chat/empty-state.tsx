'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { PERSONAS } from '@/lib/personas';
import { PROMPTS, CATEGORIES } from '@/lib/prompts';
import type { Persona } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  onStart: (personaId: string) => void;
  onStartWithPrompt?: (personaId: string, prompt: string) => void;
  customPersonas: Persona[];
  onCreatePersona: () => void;
}

export function EmptyState({ onStart, onStartWithPrompt, customPersonas, onCreatePersona }: Props) {
  const all = [...PERSONAS, ...customPersonas];
  const [tab, setTab] = useState<'voices' | 'prompts'>('voices');
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const filtered = PROMPTS.filter((p) => p.category === activeCategory);

  return (
    <div className="h-full grid place-items-center px-6 py-10 overflow-y-auto">
      <div className="max-w-2xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-display text-[clamp(40px,7vw,64px)] leading-[1.02] tracking-tight">
            Begin a <span className="italic text-subtle">quiet</span> conversation.
          </p>
          <p className="text-subtle mt-4 text-[15px] max-w-md">
            Choose a voice or pick a starter. Switch any time. Your conversations stay private.
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mt-10 flex items-center gap-1 p-1 bg-muted rounded-lg w-fit relative"
        >
          {(['voices', 'prompts'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative h-8 px-4 text-[12.5px] font-medium rounded-md transition z-10',
                tab === t ? 'text-fg' : 'text-subtle hover:text-fg',
              )}
            >
              {t === 'voices' ? 'Voices' : 'Starters'}
              {tab === t && (
                <motion.span
                  layoutId="empty-tab"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 -z-10 bg-surface border border-hairline rounded-md shadow-sm"
                />
              )}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {tab === 'voices' ? (
            <motion.div
              key="voices"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="mt-6 grid gap-px"
            >
              {all.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onStart(p.id)}
                  className="group flex items-baseline gap-4 py-3.5 border-t border-hairline last:border-b text-left transition hover:pl-2"
                >
                  <span className="text-[18px] w-6 shrink-0">{p.emoji}</span>
                  <p className="font-display text-[20px] leading-none w-32 shrink-0 group-hover:text-accent transition">
                    {p.name}
                  </p>
                  <p className="text-[13px] text-subtle leading-relaxed flex-1">{p.tagline}</p>
                  {p.custom && (
                    <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
                      Custom
                    </span>
                  )}
                  <span className="text-faint text-[12px] opacity-0 group-hover:opacity-100 transition shrink-0">
                    Begin →
                  </span>
                </button>
              ))}

              <button
                onClick={onCreatePersona}
                className="group flex items-center gap-4 py-3.5 text-left transition hover:pl-2 text-faint hover:text-fg"
              >
                <span className="w-6 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-[14px]">Create your own persona</span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="prompts"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="mt-6"
            >
              <div className="flex flex-wrap gap-1.5 mb-4">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={cn(
                      'h-7 px-3 text-[11.5px] rounded-full transition',
                      activeCategory === c
                        ? 'bg-fg text-bg'
                        : 'text-subtle hover:text-fg hover:bg-muted',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const personaId = p.personaId ?? 'keko';
                      if (onStartWithPrompt) {
                        onStartWithPrompt(personaId, p.body);
                      } else {
                        onStart(personaId);
                      }
                    }}
                    className="group surface rounded-lg p-3.5 text-left hover:border-fg/30 transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-[13px] font-medium leading-tight">{p.title}</p>
                      <ArrowRight className="h-3 w-3 text-faint mt-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-[11.5px] text-subtle leading-relaxed line-clamp-2">
                      {p.body.split('\n')[0]}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[11px] text-faint mt-12">
          Press <span className="kbd">⌘K</span> any time to search or jump.
        </p>
      </div>
    </div>
  );
}
