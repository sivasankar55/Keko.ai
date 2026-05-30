'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Citation {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
}

interface Props {
  citations: Citation[];
}

interface ChunkPayload {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
}

/**
 * Footnote-style citation chips below an assistant message. Click a chip to
 * peek at the underlying document chunk in a popover. We fetch chunk bodies
 * lazily — citations come down with the message, but the actual passage text
 * is loaded only when someone wants to inspect it.
 */
export function Citations({ citations }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Record<string, ChunkPayload>>({});
  const [loading, setLoading] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (openIndex === null) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openIndex]);

  async function ensureChunksLoaded() {
    const missing = citations.filter((c) => !chunks[c.id]).map((c) => c.id);
    if (missing.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/rag/chunks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: missing }),
      });
      if (!res.ok) return;
      const j = await res.json();
      setChunks((prev) => {
        const next = { ...prev };
        for (const c of (j.chunks ?? []) as ChunkPayload[]) next[c.id] = c;
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  if (citations.length === 0) return null;

  const open = openIndex !== null ? citations[openIndex] : null;
  const openChunk = open ? chunks[open.id] : null;

  return (
    <div className="mt-2 relative" ref={popRef}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] uppercase tracking-wider text-faint mr-1">
          Sources
        </span>
        {citations.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setOpenIndex((cur) => (cur === i ? null : i));
              ensureChunksLoaded();
            }}
            className={cn(
              'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10.5px] tabular-nums border transition',
              openIndex === i
                ? 'bg-accent/15 border-accent/40 text-fg'
                : 'border-hairline text-subtle hover:text-fg hover:border-fg/30',
            )}
            title={`${c.document_name} · section ${c.chunk_index + 1}`}
          >
            <span>{i + 1}</span>
            <span className="text-faint truncate max-w-[140px]">
              {c.document_name}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 z-30 surface rounded-lg shadow-lg p-3 w-[min(92vw,460px)]"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-hairline mb-2">
              <FileText className="h-3.5 w-3.5 text-faint shrink-0" />
              <p className="text-[12px] font-medium truncate">{open.document_name}</p>
              <span className="ml-auto text-[10.5px] text-faint shrink-0">
                Section {open.chunk_index + 1}
              </span>
            </div>
            {loading && !openChunk ? (
              <div className="grid place-items-center py-4">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />
              </div>
            ) : openChunk ? (
              <p className="text-[12.5px] leading-relaxed text-subtle whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                {openChunk.content}
              </p>
            ) : (
              <p className="text-[12px] text-faint italic">
                Could not load this passage. The document may have been removed.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
