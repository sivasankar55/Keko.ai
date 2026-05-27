'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link as LinkIcon, Check, Loader2, Trash2, UserPlus } from 'lucide-react';
import { toast } from '@/components/ui/toaster';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  conversationTitle?: string;
}

export function InviteModal({ open, onClose, conversationId, conversationTitle }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !conversationId) return;
    setLoading(true);
    setToken(null);
    fetch(`/api/invite?conversationId=${conversationId}`)
      .then((r) => r.json())
      .then((j) => setToken(j.link?.token ?? null))
      .finally(() => setLoading(false));
  }, [open, conversationId]);

  async function create() {
    if (!conversationId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setToken(j.link.token);
    } catch (e: any) {
      toast({ title: 'Could not create invite', description: e.message, variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (!conversationId) return;
    setRevoking(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error('Failed');
      setToken(null);
      toast({ title: 'Invite revoked', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e.message, variant: 'error' });
    } finally {
      setRevoking(false);
    }
  }

  const url =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/join/${token}`
      : '';

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
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
              className="pointer-events-auto w-[min(92vw,500px)] surface rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
                <div>
                  <p className="font-display text-[20px] tracking-tight leading-none">Invite to chat</p>
                  <p className="text-[12px] text-subtle mt-1 truncate max-w-[380px]">
                    {conversationTitle ?? 'Untitled'}
                  </p>
                </div>
                <button onClick={onClose} className="text-faint hover:text-fg transition" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-5">
                {loading ? (
                  <div className="py-8 grid place-items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-faint" />
                  </div>
                ) : token ? (
                  <>
                    <p className="text-[12.5px] text-subtle mb-3">
                      Anyone with this link (and a keko.ai account) can join the chat. They&rsquo;ll see your messages and the AI&rsquo;s responses, and can send their own.
                    </p>
                    <div className="flex items-center gap-2 surface rounded-md px-3 py-2.5 border-fg/20">
                      <LinkIcon className="h-3.5 w-3.5 text-faint shrink-0" />
                      <input
                        readOnly
                        value={url}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 bg-transparent text-[12.5px] outline-none truncate"
                      />
                      <button
                        onClick={copy}
                        className="text-[11.5px] flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition shrink-0"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" /> Copied
                          </>
                        ) : (
                          'Copy'
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-end mt-4">
                      <button
                        onClick={revoke}
                        disabled={revoking}
                        className="text-[12px] text-faint hover:text-danger transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {revoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Revoke invite
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-subtle mb-5">
                      Make this a shared room. People you invite will join the conversation and chat with the AI alongside you in real time.
                    </p>
                    <button
                      onClick={create}
                      disabled={creating}
                      className="w-full h-10 rounded-md bg-fg text-bg font-medium text-[13.5px] flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-50"
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" />
                          Create invite link
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
