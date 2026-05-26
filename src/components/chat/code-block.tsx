'use client';

import { useState, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export function CodeBlock({ className, children }: Props) {
  // className looks like "language-ts"
  const lang = className?.replace(/^language-/, '') ?? '';
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    const text = ref.current?.innerText ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="relative group/code my-3 rounded-md overflow-hidden border border-hairline">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-hairline">
        <span className="text-[10.5px] uppercase tracking-wider text-faint font-mono">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            'text-[10.5px] flex items-center gap-1 px-2 py-1 rounded transition',
            copied
              ? 'text-emerald-500'
              : 'text-faint hover:text-fg hover:bg-bg/60',
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre ref={ref} className="!m-0 !rounded-none !border-0 bg-muted/30">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
