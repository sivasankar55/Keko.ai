'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'error';
interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: Variant;
}

let id = 0;
const listeners: Array<(t: Toast) => void> = [];
export function toast(t: { title: string; description?: string; variant?: Variant }) {
  const full: Toast = { id: ++id, variant: 'default', ...t };
  listeners.forEach((l) => l(full));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((t: Toast) => {
    setItems((s) => [...s, t]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4000);
  }, []);

  if (!listeners.includes(push)) listeners.push(push);

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = t.variant === 'success' ? Check : t.variant === 'error' ? AlertCircle : null;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto surface rounded-xl px-3.5 py-2.5 min-w-[260px] max-w-sm flex items-start gap-3 shadow-sm"
            >
              {Icon && (
                <Icon
                  className={cn('h-4 w-4 shrink-0 mt-0.5', {
                    'text-emerald-500': t.variant === 'success',
                    'text-danger': t.variant === 'error',
                  })}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fg leading-tight">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-subtle mt-1 leading-snug">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
                className="text-faint hover:text-fg transition shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
