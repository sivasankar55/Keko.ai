'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import {
  FileText,
  ImageIcon,
  Copy,
  RefreshCw,
  Pencil,
  Check,
  Trash2,
  Volume2,
  Square as Stop,
  GitBranch,
  MessageSquareOff,
} from 'lucide-react';
import type { Message } from '@/lib/types';
import { cn, formatTime } from '@/lib/utils';
import { CodeBlock } from './code-block';
import { useTTS } from '@/lib/use-tts';
import { MessageReactions, type ReactionAggregate } from './reactions';

// Allow class on code/pre/span so syntax highlighting can apply colors.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
  },
};

interface Props {
  message: Message;
  user: { id?: string; displayName: string; avatarUrl: string | null };
  personaEmoji: string;
  personaName: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
  onBranch?: () => void;
  /** Aggregated reactions for this message (host owns the data). */
  reactions?: ReactionAggregate[];
  /** Called after a reaction is added/removed locally so the host can broadcast. */
  onReactionChanged?: () => void;
}

export function MessageBubble({
  message,
  user,
  personaEmoji,
  personaName,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
  onBranch,
  reactions,
  onReactionChanged,
}: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(message.content);
  const tts = useTTS();
  const isThisSpeaking = tts.speaking;

  function copy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function commitEdit() {
    const v = editVal.trim();
    if (v && v !== message.content && onEdit) {
      onEdit(v);
    }
    setEditing(false);
  }

  void user; // Avatar is shown in header bar; keeping prop for future use

  // Decide what label to show above each message.
  // - assistant: persona emoji + name
  // - your own user message: "You"
  // - someone else's user message in a shared chat: their display name (from
  //   messages_with_author view), falling back to "Member"
  const isMine = isUser && (!message.user_id || !user.id || message.user_id === user.id);
  const userLabel = isMine ? 'You' : message.author_display_name || 'Member';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      <div className="flex items-baseline gap-3 mb-1.5">
        <p className={cn('text-[12px] font-medium', isUser ? 'text-subtle' : 'text-fg')}>
          {isUser ? userLabel : (
            <>
              <span className="opacity-70 mr-1">{personaEmoji}</span>
              {personaName}
            </>
          )}
        </p>
        {message.silent && (
          <span
            className="text-[10px] uppercase tracking-wider text-faint flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60"
            title="Sent silently — the AI did not see this message"
          >
            <MessageSquareOff className="h-2.5 w-2.5" />
            <span>Silent</span>
          </span>
        )}
        <p className="text-[10.5px] text-faint opacity-0 group-hover:opacity-100 transition">
          {formatTime(message.created_at)}
        </p>
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {message.attachments.map((a) => (
            <Attachment key={a.id} a={a} />
          ))}
        </div>
      )}

      {isStreaming ? (
        <div className="flex gap-1.5 py-1.5">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      ) : editing && isUser ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
                setEditVal(message.content);
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commitEdit();
              }
            }}
            rows={Math.min(10, Math.max(2, editVal.split('\n').length))}
            className="w-full rounded-md bg-muted border border-fg/30 px-3 py-2 text-[15px] leading-relaxed focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={commitEdit}
              className="h-7 px-3 rounded bg-fg text-bg text-[12px] font-medium hover:opacity-90 transition"
            >
              Save & resend
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditVal(message.content);
              }}
              className="h-7 px-3 rounded text-[12px] text-subtle hover:text-fg hover:bg-muted transition"
            >
              Cancel
            </button>
            <span className="ml-auto text-[10.5px] text-faint">⌘↵ to save</span>
          </div>
        </div>
      ) : isUser ? (
        <p
          className={cn(
            'text-[15px] leading-[1.7] whitespace-pre-wrap',
            message.silent
              ? 'text-subtle italic border-l-2 border-hairline pl-3'
              : 'text-fg',
          )}
        >
          {message.content}
        </p>
      ) : (
        <div className="prose-luxe">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeHighlight]}
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
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {/* Hover actions */}
      {!isStreaming && !editing && message.content && (
        <div className="mt-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition -ml-1">
          <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </ActionBtn>
          {!isUser && tts.supported && (
            <ActionBtn
              label={isThisSpeaking ? 'Stop' : 'Listen'}
              onClick={() => (isThisSpeaking ? tts.stop() : tts.speak(message.content))}
              active={isThisSpeaking}
            >
              {isThisSpeaking ? <Stop className="h-3 w-3 fill-current" /> : <Volume2 className="h-3 w-3" />}
            </ActionBtn>
          )}
          {!isUser && onRegenerate && (
            <ActionBtn label="Regenerate" onClick={onRegenerate}>
              <RefreshCw className="h-3 w-3" />
            </ActionBtn>
          )}
          {onBranch && (
            <ActionBtn label="Branch" onClick={onBranch}>
              <GitBranch className="h-3 w-3" />
            </ActionBtn>
          )}
          {isUser && onEdit && (
            <ActionBtn label="Edit & resend" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </ActionBtn>
          )}
          {onDelete && (
            <ActionBtn label="Delete" onClick={onDelete} danger>
              <Trash2 className="h-3 w-3" />
            </ActionBtn>
          )}
        </div>
      )}

      {/* Reactions strip — always rendered when there are existing reactions,
          plus a hover-only "+ add" button. Skipped while streaming. */}
      {!isStreaming && !message.id.startsWith('temp-') && (
        <MessageReactions
          messageId={message.id}
          reactions={reactions ?? []}
          onChanged={onReactionChanged}
          disabled={isStreaming}
        />
      )}

      <div className="mt-7 h-px bg-hairline last:hidden" />
    </motion.div>
  );
}

function ActionBtn({
  children,
  label,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'h-7 px-2 rounded text-[11px] flex items-center gap-1.5 transition',
        active && 'bg-muted text-fg',
        danger
          ? 'text-faint hover:text-danger hover:bg-danger/10'
          : !active && 'text-faint hover:text-fg hover:bg-muted',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Attachment({ a }: { a: NonNullable<Message['attachments']>[number] }) {
  if (a.kind === 'image' || a.kind === 'generated-image') {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border border-hairline max-w-[320px] hover:border-border transition"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name} className="w-full h-auto" loading="lazy" />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted text-[12px] text-fg hover:bg-elevated transition"
    >
      {a.type.startsWith('image') ? (
        <ImageIcon className="h-3 w-3" />
      ) : (
        <FileText className="h-3 w-3" />
      )}
      <span className="truncate max-w-[180px]">{a.name}</span>
    </a>
  );
}
