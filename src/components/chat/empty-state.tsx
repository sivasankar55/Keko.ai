'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { PERSONAS } from '@/lib/personas';
import type { Persona } from '@/lib/types';

interface Props {
  onStart: (personaId: string) => void;
  customPersonas: Persona[];
  onCreatePersona: () => void;
}

export function EmptyState({ onStart, customPersonas, onCreatePersona }: Props) {
  const all = [...PERSONAS, ...customPersonas];

  return (
    <div className="h-full grid place-items-center px-6">
      <div className="max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-display text-[56px] leading-[1.02] tracking-tight">
            Begin a <span className="italic text-subtle">quiet</span> conversation.
          </p>
          <p className="text-subtle mt-4 text-[15px] max-w-md">
            Choose a voice. Switch any time. Your conversations stay private.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04, delayChildren: 0.15 } },
          }}
          className="mt-12 grid gap-px"
        >
          {all.map((p) => (
            <motion.button
              key={p.id}
              variants={{
                hidden: { opacity: 0, y: 4 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onStart(p.id)}
              className="group flex items-baseline gap-4 py-3.5 border-t border-hairline last:border-b text-left transition hover:pl-2"
            >
              <span className="text-[18px] w-6 shrink-0">{p.emoji}</span>
              <p className="font-display text-[20px] leading-none w-32 shrink-0 group-hover:text-accent transition">
                {p.name}
              </p>
              <p className="text-[13px] text-subtle leading-relaxed flex-1">
                {p.tagline}
              </p>
              {p.custom && (
                <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
                  Custom
                </span>
              )}
              <span className="text-faint text-[12px] opacity-0 group-hover:opacity-100 transition shrink-0">
                Begin →
              </span>
            </motion.button>
          ))}

          <motion.button
            variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={onCreatePersona}
            className="group flex items-center gap-4 py-3.5 text-left transition hover:pl-2 text-faint hover:text-fg"
          >
            <span className="w-6 shrink-0">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[14px]">Create your own persona</span>
          </motion.button>
        </motion.div>

        <p className="text-[11px] text-faint mt-12">
          Press <span className="kbd">⌘K</span> any time to search or jump.
        </p>
      </div>
    </div>
  );
}
