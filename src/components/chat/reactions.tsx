'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReactionAggregate {
  emoji: string;
  count: number;
  /** True when the current user is part of this reaction. */
  mine: boolean;
  /** Display names of users who reacted, in the order they reacted. */
  display_names: string[];
}

interface Props {
  messageId: string;
  reactions: ReactionAggregate[];
  /** Called after a successful toggle so the host can refresh / broadcast. */
  onChanged?: () => void;
  /** Hide the "+ add reaction" button — useful for messages still streaming. */
  disabled?: boolean;
}

const QUICK_PICKS = ['👍', '❤️', '😂', '🎉', '🤔', '👀', '🙏', '🔥', '✨', '😮'];

export function MessageReactions({ messageId, reactions, onChanged, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  async function toggle(emoji: string) {
    if (pending) return;
    setPending(emoji);
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) onChanged?.();
    } finally {
      setPending(null);
      setPickerOpen(false);
    }
  }

  if (reactions.length === 0 && disabled) return null;

  return (
    <div className="mt-1.5 flex items-center flex-wrap gap-1.5 relative">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          title={r.display_names.join(', ')}
          onClick={() => toggle(r.emoji)}
          disabled={!!pending}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] transition border',
            r.mine
              ? 'bg-accent/10 border-accent/40 text-fg'
              : 'bg-muted/60 border-hairline text-subtle hover:border-fg/30',
            pending === r.emoji && 'opacity-50',
          )}
        >
          <span className="text-[13px] leading-none">{r.emoji}</span>
          <span className="tabular-nums leading-none">{r.count}</span>
        </button>
      ))}

      {!disabled && (
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((s) => !s)}
            className={cn(
              'h-6 w-6 grid place-items-center rounded-full border border-hairline text-faint hover:text-fg hover:border-fg/30 transition opacity-0 group-hover:opacity-100',
              pickerOpen && 'opacity-100',
            )}
            aria-label="Add reaction"
            title="Add reaction"
          >
            <SmilePlus className="h-3 w-3" />
          </button>

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 4 }}
                transition={{ duration: 0.14 }}
                className="absolute left-0 bottom-full mb-1.5 surface rounded-lg shadow-lg p-1 flex items-center gap-0.5 z-30"
              >
                {QUICK_PICKS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggle(e)}
                    disabled={!!pending}
                    className="h-7 w-7 grid place-items-center rounded hover:bg-muted text-[15px] transition"
                  >
                    {e}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
