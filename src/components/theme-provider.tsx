'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Theme } from '@/lib/types';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEMES: Theme[] = ['bone', 'obsidian'];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('bone');

  useEffect(() => {
    const stored = localStorage.getItem('keko.theme') as Theme | null;
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored && THEMES.includes(stored) ? stored : prefersDark ? 'obsidian' : 'bone';
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem('keko.theme', t);
  };

  const toggle = () => setTheme(theme === 'bone' ? 'obsidian' : 'bone');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
