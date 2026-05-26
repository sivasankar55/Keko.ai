'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import type { Persona } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  customPersonas: Persona[];
  onCreated: (p: Persona) => void;
  onDeleted: (id: string) => void;
}

const EMOJI_SUGGESTIONS = ['✨', '🎨', '🧠', '🪷', '♟️', '🍳', '📚', '🔮', '🛠️', '🎭', '🌿', '⚡', '🦉', '🌙', '🔥', '💎'];

export function PersonaModal({ open, onClose, customPersonas, onCreated, onDeleted }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [tagline, setTagline] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmoji('✨');
      setTagline('');
      setSystemPrompt('');
    }
  }, [open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, emoji, tagline, systemPrompt }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Could not save');
      }
      const { persona } = await res.json();
      onCreated(persona);
      toast({ title: 'Persona created', variant: 'success' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/personas/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: 'Delete failed', variant: 'error' });
      return;
    }
    onDeleted(id);
    toast({ title: 'Persona deleted', variant: 'success' });
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
              className="pointer-events-auto w-[min(92vw,560px)] max-h-[88vh] surface rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
              <div>
                <p className="font-display text-[20px] tracking-tight leading-none">Personas</p>
                <p className="text-[12px] text-subtle mt-1">Craft your own AI voice.</p>
              </div>
              <button
                onClick={onClose}
                className="text-faint hover:text-fg transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {customPersonas.length > 0 && (
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[10px] uppercase tracking-wider text-faint font-medium mb-2">Yours</p>
                  <div className="space-y-1">
                    {customPersonas.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/60 transition group"
                      >
                        <span className="text-[15px] w-5 text-center shrink-0">{p.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{p.name}</p>
                          <p className="text-[11.5px] text-subtle truncate">{p.tagline || 'No tagline'}</p>
                        </div>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-faint hover:text-danger transition opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-bg"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
                <p className="text-[10px] uppercase tracking-wider text-faint font-medium">
                  Create new
                </p>

                <div>
                  <p className="text-[12px] text-subtle mb-1.5">Emoji</p>
                  <div className="flex flex-wrap gap-1">
                    {EMOJI_SUGGESTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className={`h-9 w-9 inline-flex items-center justify-center rounded text-[18px] leading-none transition ${
                          emoji === e
                            ? 'bg-muted ring-1 ring-fg/30'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <span className="block leading-none translate-y-[1px]">{e}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Name">
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Atlas"
                    className="w-full h-10 rounded-md bg-transparent border border-border px-3 text-[14px] focus:outline-none focus:border-fg/40 transition"
                  />
                </Field>

                <Field label="Tagline" hint="A short description (optional).">
                  <input
                    type="text"
                    maxLength={120}
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Patient explainer of complex things."
                    className="w-full h-10 rounded-md bg-transparent border border-border px-3 text-[14px] focus:outline-none focus:border-fg/40 transition"
                  />
                </Field>

                <Field
                  label="System prompt"
                  hint="Tells the AI who to be. Be specific about tone, role, and constraints."
                >
                  <textarea
                    required
                    minLength={10}
                    maxLength={4000}
                    rows={5}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are Atlas, a patient and clear explainer. You break complex topics into simple, vivid analogies. You answer in 3 short paragraphs..."
                    className="w-full rounded-md bg-transparent border border-border px-3 py-2.5 text-[13.5px] leading-relaxed focus:outline-none focus:border-fg/40 transition resize-none"
                  />
                </Field>

                <button
                  type="submit"
                  disabled={saving || !name.trim() || systemPrompt.trim().length < 10}
                  className="w-full h-10 rounded-md bg-fg text-bg font-medium text-[13.5px] flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create persona'}
                </button>
              </form>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-subtle block mb-1.5">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint mt-1 block">{hint}</span>}
    </label>
  );
}
