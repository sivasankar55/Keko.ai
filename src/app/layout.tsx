import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'keko.ai',
  description: 'A quieter way to think with AI.',
  applicationName: 'keko.ai',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Let the page extend under the iOS home indicator and notch; we add
  // safe-area padding where it matters (composer, sidebar footer).
  viewportFit: 'cover',
};

// Prevent flash of wrong theme on load
const themeScript = `
(function(){try{
  var t = localStorage.getItem('keko.theme');
  if(!t){t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'obsidian' : 'bone';}
  document.documentElement.dataset.theme = t;
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <div className="grain" aria-hidden />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
