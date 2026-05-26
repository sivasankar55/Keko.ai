'use client';

import { useState, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const SNIPPETS = [
  { emoji: '🪷', name: 'Sage', text: 'What\u2019s been on your mind lately?' },
  { emoji: '🎨', name: 'Muse', text: 'She walked through October like a question.' },
  { emoji: '🧠', name: 'Mentor', text: 'Let me show you a cleaner pattern for this.' },
  { emoji: '♟️', name: 'Strategist', text: 'Three constraints. Pick two. Defend the third.' },
  { emoji: '🍳', name: 'Chef', text: 'Salt early. Often. Always.' },
  { emoji: '✨', name: 'Keko', text: 'Where would you like to begin?' },
];

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [snippetIdx, setSnippetIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setSnippetIdx((i) => (i + 1) % SNIPPETS.length);
    }, 4200);
    return () => clearInterval(t);
  }, []);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    try {
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInErr) {
          router.replace(next);
          router.refresh();
        } else {
          toast({ title: 'Account created', description: 'Check your email to confirm.', variant: 'success' });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err: any) {
      toast({ title: 'Could not continue', description: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const snippet = SNIPPETS[snippetIdx];

  return (
    <div className="min-h-screen w-full overflow-hidden grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      {/* ============== Hero side ============== */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden">
        {/* Animated orb */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{
            opacity: 0.6,
            x: [0, 40, -20, 0],
            y: [0, -30, 30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-32 top-1/3 h-[480px] w-[480px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, hsl(var(--accent) / 0.25), transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{
            opacity: 0.45,
            x: [0, -30, 20, 0],
            y: [0, 20, -30, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute right-0 top-10 h-[360px] w-[360px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, hsl(28 90% 55% / 0.18), transparent 70%)',
            filter: 'blur(50px)',
          }}
        />

        {/* Top folio */}
        <div className="relative flex items-center justify-between text-faint">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]">
            <span className="font-mono">01</span>
            <span className="h-px w-10 bg-border" />
            <span>Volume i</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] font-mono">
            keko.ai
          </div>
        </div>

        {/* Center brand */}
        <div className="relative">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-[12px] text-subtle uppercase tracking-[0.3em] mb-4"
          >
            <span className="italic font-display normal-case tracking-normal text-[14px]">
              an essay in
            </span>{' '}
            quiet conversation
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-[clamp(72px,11vw,148px)] leading-[0.92] tracking-[-0.02em]"
          >
            keko<span className="italic text-subtle">.</span>ai
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-subtle text-[17px] mt-6 max-w-md leading-relaxed"
          >
            A thoughtful AI workspace. Six voices, your own personas, image generation, files, and voice. All free, all yours.
          </motion.p>
        </div>

        {/* Overhear panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-md"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="h-px w-8 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-faint">
              Overheard
            </span>
          </div>
          <div className="min-h-[80px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={snippet.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="font-display italic text-[22px] leading-snug text-fg">
                  &ldquo;{snippet.text}&rdquo;
                </p>
                <p className="mt-2 text-[12px] text-subtle">
                  <span className="opacity-70 mr-1.5">{snippet.emoji}</span>
                  <span className="uppercase tracking-wider">{snippet.name}</span>
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex gap-1 mt-4">
            {SNIPPETS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-px transition-all',
                  i === snippetIdx ? 'w-6 bg-fg' : 'w-3 bg-border',
                )}
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* ============== Form side ============== */}
      <div className="relative flex items-center justify-center px-6 py-10 lg:py-0">
        {/* Mobile-only mini header */}
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-2">
          <p className="font-display text-[26px] tracking-tight">
            keko<span className="italic text-subtle">.</span>ai
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          {/* Mode tabs */}
          <div className="flex p-1 bg-muted rounded-lg mb-8 relative">
            <button
              type="button"
              onClick={() => setMode('sign-in')}
              className={cn(
                'flex-1 h-9 text-[13px] font-medium rounded-md transition relative z-10',
                mode === 'sign-in' ? 'text-fg' : 'text-subtle hover:text-fg',
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('sign-up')}
              className={cn(
                'flex-1 h-9 text-[13px] font-medium rounded-md transition relative z-10',
                mode === 'sign-up' ? 'text-fg' : 'text-subtle hover:text-fg',
              )}
            >
              Create account
            </button>
            <motion.div
              layout
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-surface border border-hairline rounded-md shadow-sm"
              style={{ left: mode === 'sign-in' ? 4 : 'calc(50% + 0px)' }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="mb-7"
            >
              <p className="font-display text-[32px] leading-[1.05] tracking-tight">
                {mode === 'sign-in' ? 'Welcome back.' : 'Begin here.'}
              </p>
              <p className="text-[14px] text-subtle mt-2">
                {mode === 'sign-in'
                  ? 'Pick up where your conversations left off.'
                  : 'A free account in about ten seconds.'}
              </p>
            </motion.div>
          </AnimatePresence>

          <form onSubmit={handleEmail} className="space-y-3.5">
            <FloatingField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <FloatingField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              minLength={8}
              hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
            />

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full h-12 rounded-lg bg-fg text-bg font-medium text-[14px] flex items-center justify-center gap-2 transition hover:opacity-95 disabled:opacity-60 overflow-hidden mt-5"
            >
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {mode === 'sign-in' ? 'Sign in' : 'Create account'}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
              <span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-bg/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                aria-hidden
              />
            </button>
          </form>

          <p className="text-[11px] text-faint mt-10 leading-relaxed">
            By continuing you agree to our{' '}
            <a href="/legal/terms" className="underline underline-offset-2 hover:text-subtle transition">
              Terms
            </a>{' '}
            and{' '}
            <a href="/legal/privacy" className="underline underline-offset-2 hover:text-subtle transition">
              Privacy
            </a>
            .
          </p>
        </motion.div>

        {/* Bottom-right corner ornament */}
        <div className="hidden lg:flex absolute bottom-6 right-8 items-center gap-2 text-[10px] text-faint uppercase tracking-[0.2em] font-mono">
          <span>secure · v0.1</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
        </div>
      </div>
    </div>
  );
}

function FloatingField({
  label,
  type,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div>
      <div className="relative">
        <input
          type={type}
          required
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            'peer w-full h-12 rounded-lg bg-transparent border px-3.5 pt-4 pb-1 text-[14px] outline-none transition',
            focused
              ? 'border-fg/50'
              : 'border-border hover:border-fg/30',
          )}
        />
        <label
          className={cn(
            'absolute left-3.5 pointer-events-none transition-all duration-200 ease-out',
            active
              ? 'top-1.5 text-[10.5px] uppercase tracking-wider text-subtle'
              : 'top-1/2 -translate-y-1/2 text-[14px] text-faint',
          )}
        >
          {label}
        </label>
      </div>
      {hint && <p className="text-[11px] text-faint mt-1.5 ml-1">{hint}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
