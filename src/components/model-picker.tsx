'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { MODELS, getModel, type ModelDef } from '@/lib/models';
import { cn } from '@/lib/utils';

interface Props {
  currentModelId: string | null;
  onChange: (id: string) => void;
}

export function ModelPicker({ currentModelId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getModel(currentModelId);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const groups: { label: string; items: ModelDef[] }[] = [
    { label: 'Google · Gemini', items: MODELS.filter((m) => m.provider === 'gemini') },
    { label: 'Groq · Llama / GPT-OSS', items: MODELS.filter((m) => m.provider === 'groq') },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="text-[11.5px] text-faint hover:text-fg transition flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted"
        title="Switch model"
      >
        <span className="hidden sm:inline">{current.name}</span>
        <span className="sm:hidden">Model</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-9 z-30 surface rounded-lg p-1.5 shadow-lg w-[280px]"
          >
            {groups.map((g) => (
              <div key={g.label} className="mb-1.5 last:mb-0">
                <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-faint font-medium">
                  {g.label}
                </p>
                {g.items.map((m) => {
                  const active = m.id === current.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-2 rounded-md transition flex items-start gap-2.5',
                        active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="w-3.5 mt-0.5 shrink-0">
                        {active && <Check className="h-3.5 w-3.5 text-accent" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium leading-tight">{m.name}</p>
                        <p className="text-[10.5px] text-subtle mt-0.5 leading-snug">
                          {m.tagline}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="text-[10px] text-faint px-2.5 pt-2 border-t border-hairline mt-1">
              Switching applies to new replies in this chat.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
