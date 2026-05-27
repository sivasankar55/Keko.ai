'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser TTS hook. Uses SpeechSynthesis (free, built-in).
 * Picks the most natural-sounding voice we can find.
 */
export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported('speechSynthesis' in window);
  }, []);

  const pickVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // Prefer high-quality English voices known to sound natural.
    const preferences = [
      /Google US English/i,
      /Google UK English Female/i,
      /Microsoft Aria/i,
      /Microsoft Jenny/i,
      /Samantha/i, // macOS
      /Karen/i, // macOS Australian
    ];
    for (const re of preferences) {
      const match = voices.find((v) => re.test(v.name));
      if (match) return match;
    }
    return voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      // Cancel any current speech.
      window.speechSynthesis.cancel();

      // Strip code blocks and excessive markdown so it reads cleanly.
      const cleaned = text
        .replace(/```[\s\S]*?```/g, '. (code block omitted) ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~]/g, '')
        .replace(/^\s*#+\s*/gm, '')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned) return;

      const u = new SpeechSynthesisUtterance(cleaned);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    },
    [pickVoice],
  );

  const stop = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // Stop any ongoing speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, speaking, supported };
}
