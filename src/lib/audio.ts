'use client';

/**
 * Tiny synthesized UI sounds via Web Audio.
 * No assets to ship; tones are crafted to feel quiet and refined.
 */

let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

function tone(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  ramp?: 'down' | 'flat';
  delay?: number;
}) {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);

  const peak = opts.gain ?? 0.08;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  if (opts.ramp === 'flat') {
    g.gain.setValueAtTime(peak, t0 + opts.duration - 0.05);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);

  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

const KEY = 'keko.sound';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEY) !== '0';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, enabled ? '1' : '0');
}

export const sounds = {
  send() {
    if (!isSoundEnabled()) return;
    tone({ freq: 720, duration: 0.12, type: 'sine', gain: 0.06 });
  },
  receive() {
    if (!isSoundEnabled()) return;
    tone({ freq: 480, duration: 0.16, type: 'sine', gain: 0.05 });
    tone({ freq: 600, duration: 0.18, type: 'sine', gain: 0.04, delay: 0.08 });
  },
  click() {
    if (!isSoundEnabled()) return;
    tone({ freq: 880, duration: 0.05, type: 'triangle', gain: 0.03 });
  },
  error() {
    if (!isSoundEnabled()) return;
    tone({ freq: 220, duration: 0.18, type: 'sine', gain: 0.06 });
  },
};
