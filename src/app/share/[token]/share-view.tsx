'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from '@/components/chat/code-block';
import { formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
  },
};

interface Props {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
    attachments: any;
  }>;
  personaEmoji: string;
  personaName: string;
}

export function ShareView({ messages, personaEmoji, personaName }: Props) {
  return (
    <div className="space-y-7">
      {messages.map((m) => {
        const isUser = m.role === 'user';
        return (
          <div key={m.id}>
            <div className="flex items-baseline gap-3 mb-1.5">
              <p className={cn('text-[12px] font-medium', isUser ? 'text-subtle' : 'text-fg')}>
                {isUser ? 'A reader' : (
                  <>
                    <span className="opacity-70 mr-1">{personaEmoji}</span>
                    {personaName}
                  </>
                )}
              </p>
              <p className="text-[10.5px] text-faint">{formatTime(m.created_at)}</p>
            </div>
            {isUser ? (
              <p className="text-[15px] leading-[1.7] whitespace-pre-wrap text-fg">
                {m.content}
              </p>
            ) : (
              <div className="prose-luxe">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeSanitize, schema], rehypeHighlight]}
                  components={{
                    pre: ({ children }) => <>{children}</>,
                    code: ({ className, children, ...props }) => {
                      const isBlock = className?.startsWith('language-');
                      if (!isBlock) {
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                      return <CodeBlock className={className}>{children}</CodeBlock>;
                    },
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            )}
            <div className="mt-7 h-px bg-hairline last:hidden" />
          </div>
        );
      })}
    </div>
  );
}
