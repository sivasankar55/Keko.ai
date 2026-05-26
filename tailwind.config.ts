import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="obsidian"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        elevated: 'hsl(var(--elevated) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        hairline: 'hsl(var(--hairline) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        fg: 'hsl(var(--fg) / <alpha-value>)',
        subtle: 'hsl(var(--subtle) / <alpha-value>)',
        faint: 'hsl(var(--faint) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-fg': 'hsl(var(--accent-fg) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': '28px',
      },
      transitionTimingFunction: {
        ease: 'var(--ease)',
      },
      transitionDuration: {
        fast: 'var(--d-fast)',
        DEFAULT: 'var(--d-base)',
        slow: 'var(--d-slow)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--d-base) var(--ease)',
        'slide-up': 'slide-up var(--d-base) var(--ease)',
      },
    },
  },
  plugins: [],
};

export default config;
