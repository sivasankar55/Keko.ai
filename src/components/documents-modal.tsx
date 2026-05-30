'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Upload, FileText, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn, formatRelative } from '@/lib/utils';

interface RagDoc {
  id: string;
  name: string;
  mime: string;
  size_bytes: number;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  created_at: string;
  conversation_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  onChange?: () => void;
  /** Pre-fill the composer with a prompt when a doc is "ready". */
  onAskAbout?: (documentName: string) => void;
}

const ALLOWED = ['application/pdf', 'text/plain', 'text/markdown'];

export function DocumentsModal({ open, onClose, conversationId, onChange, onAskAbout }: Props) {
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
    setLoading(true);
    fetch(`/api/rag/documents?conversationId=${conversationId}`)
      .then((r) => r.json())
      .then((j) => setDocs(j.documents ?? []))
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  async function uploadFiles(files: File[]) {
    if (!conversationId) return;
    for (const file of files) {
      if (!ALLOWED.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
        toast({ title: 'Unsupported file', description: file.name, variant: 'error' });
        continue;
      }
      setUploading(true);
      const tempId = `temp-${crypto.randomUUID()}`;
      setDocs((d) => [
        {
          id: tempId,
          name: file.name,
          mime: file.type,
          size_bytes: file.size,
          status: 'processing',
          error: null,
          created_at: new Date().toISOString(),
          conversation_id: conversationId,
        },
        ...d,
      ]);

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('conversationId', conversationId);
        const res = await fetch('/api/rag/documents', { method: 'POST', body: fd });

        // Parse safely: a timeout/proxy error often returns HTML, which
        // would throw a confusing JSON SyntaxError if we just called .json().
        const errMessage = await readErrorOrJson(res);
        if (typeof errMessage === 'string') {
          throw new Error(errMessage);
        }
        const j = errMessage;
        setDocs((d) => [j.document, ...d.filter((x) => x.id !== tempId)]);
        toast({
          title: `Indexed: ${j.document.name}`,
          description: `${j.chunks} chunks ready for retrieval.`,
          variant: 'success',
        });
        onChange?.();
      } catch (e: any) {
        setDocs((d) =>
          d.map((x) =>
            x.id === tempId ? { ...x, status: 'failed', error: e.message } : x,
          ),
        );
        toast({ title: 'Indexing failed', description: e.message, variant: 'error' });
      } finally {
        setUploading(false);
      }
    }
  }

  async function deleteDoc(id: string) {
    const res = await fetch(`/api/rag/documents/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: 'Delete failed', variant: 'error' });
      return;
    }
    setDocs((d) => d.filter((x) => x.id !== id));
    onChange?.();
    toast({ title: 'Document removed', variant: 'success' });
  }

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
          <div className="fixed inset-0 z-[90] grid place-items-center pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-[min(92vw,560px)] max-h-[85vh] surface rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
                <div>
                  <p className="font-display text-[20px] tracking-tight leading-none">Documents</p>
                  <p className="text-[12px] text-subtle mt-1">
                    Upload PDFs or text. The AI uses them to answer in this conversation.
                  </p>
                </div>
                <button onClick={onClose} className="text-faint hover:text-fg transition" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 pt-4">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-11 rounded-md border border-dashed border-border hover:border-fg/40 transition flex items-center justify-center gap-2 text-[13px] text-subtle hover:text-fg disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Indexing…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Upload PDF or text (max 8MB)
                    </>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files;
                    const snap = f ? Array.from(f) : [];
                    e.target.value = '';
                    if (snap.length > 0) uploadFiles(snap);
                  }}
                />
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4">
                {loading ? (
                  <div className="py-8 grid place-items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-faint" />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-[12.5px] text-faint">
                      No documents yet. Upload a PDF or text file above.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/60 transition"
                      >
                        <FileText className="h-4 w-4 text-faint shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] truncate">{d.name}</p>
                          <p className="text-[11px] text-faint mt-0.5">
                            {formatBytes(d.size_bytes)} · {formatRelative(d.created_at)}
                            {d.status === 'failed' && d.error && (
                              <> · <span className="text-danger">{d.error}</span></>
                            )}
                          </p>
                        </div>
                        <StatusBadge status={d.status} />
                        {d.status === 'ready' && onAskAbout && (
                          <button
                            onClick={() => {
                              onAskAbout(d.name);
                              onClose();
                            }}
                            className="text-[11px] text-subtle hover:text-fg transition px-2 py-1 rounded hover:bg-bg"
                            title="Ask about this document"
                          >
                            Ask
                          </button>
                        )}
                        <button
                          onClick={() => deleteDoc(d.id)}
                          className="text-faint hover:text-danger opacity-0 group-hover:opacity-100 transition p-1.5 rounded hover:bg-bg"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatusBadge({ status }: { status: RagDoc['status'] }) {
  if (status === 'ready') {
    return (
      <span
        className={cn(
          'flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded',
          'text-emerald-600 bg-emerald-500/10',
        )}
      >
        <CheckCircle2 className="h-2.5 w-2.5" /> Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded text-danger bg-danger/10">
        <AlertCircle className="h-2.5 w-2.5" /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded text-accent bg-accent/10">
      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Indexing
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Tolerant response reader. Handles three cases:
 *   - 2xx + valid JSON      → returns parsed body
 *   - non-2xx + JSON error  → returns the .error string from the body
 *   - non-JSON (HTML/empty) → returns a human-friendly message instead of
 *     letting the caller die on a SyntaxError. This is the case that
 *     happens when an upstream proxy times out and serves an HTML page
 *     in place of our handler's JSON response.
 */
async function readErrorOrJson(res: Response): Promise<any | string> {
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (res.ok && isJson) {
    return res.json();
  }

  // Body might be JSON with an .error field (our own error path)
  // or HTML / empty (a proxy error). Try JSON first.
  if (isJson) {
    try {
      const j = await res.json();
      return j.error ?? `Upload failed (HTTP ${res.status})`;
    } catch {
      return `Upload failed (HTTP ${res.status})`;
    }
  }

  const text = (await res.text().catch(() => '')).slice(0, 200);
  if (res.status === 504 || /timeout/i.test(text) || /timed out/i.test(text)) {
    return 'Upload timed out. Try a smaller PDF, or split it into parts.';
  }
  if (res.status >= 500) {
    return `Server error (HTTP ${res.status}). Please retry.`;
  }
  return `Upload failed (HTTP ${res.status})`;
}
