'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp,
  Paperclip,
  Mic,
  Square,
  Sparkles,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toaster';
import { ALLOWED_MIME, MAX_FILE_BYTES } from '@/lib/validation';
import { createClient } from '@/lib/supabase/client';
import type { Attachment } from '@/lib/types';

interface Props {
  conversationId: string;
  onSend: (content: string, attachments: Attachment[]) => void;
  onGenerateImage: (prompt: string) => void;
  disabled: boolean;
}

export function Composer({ conversationId, onSend, onGenerateImage, disabled }: Props) {
  const [text, setText] = useState('');
  const [imageMode, setImageMode] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (imageMode) onGenerateImage(trimmed);
    else onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    setImageMode(false);
    if (taRef.current) taRef.current.style.height = 'auto';
  }

  function autosize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  }

  async function handleFiles(files: FileList) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Please sign in again', variant: 'error' });
      return;
    }
    setUploading(true);
    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files).slice(0, 4 - attachments.length)) {
      if (!ALLOWED_MIME.includes(file.type)) {
        toast({ title: 'File type not allowed', description: file.name, variant: 'error' });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast({ title: 'File too large', description: 'Max 8MB', variant: 'error' });
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const id = crypto.randomUUID();
      const path = `${user.id}/${conversationId}/${id}.${ext}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        toast({ title: 'Upload failed', description: error.message, variant: 'error' });
        continue;
      }
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 3600);
      newAttachments.push({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        path,
        url: signed?.signedUrl,
        kind: file.type.startsWith('image') ? 'image' : 'document',
      });
    }
    setAttachments((a) => [...a, ...newAttachments]);
    setUploading(false);
  }

  function toggleVoice() {
    const SR =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      toast({ title: 'Voice not supported', description: 'Try Chrome or Edge.', variant: 'error' });
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText((prev) => (prev ? prev + ' ' + transcript : transcript));
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  }

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="px-6 lg:px-8 pb-6 pt-2">
      <form
        onSubmit={handleSubmit}
        className="max-w-3xl mx-auto surface rounded-2xl px-3 py-2.5 transition focus-within:border-fg/40"
      >
        <AnimatePresence>
          {imageMode && (
            <motion.div
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              className="flex items-center gap-2 px-1 pb-2 text-[11.5px] text-accent"
            >
              <Sparkles className="h-3 w-3" />
              <span>Image mode — describe what to generate</span>
              <button
                type="button"
                onClick={() => setImageMode(false)}
                className="ml-auto text-faint hover:text-fg transition"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}

          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 px-1 pb-2"
            >
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative group rounded-md border border-hairline bg-muted overflow-hidden"
                >
                  {a.kind === 'image' && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.name} className="h-12 w-12 object-cover" />
                  ) : (
                    <div className="h-12 px-3 flex items-center text-[11px] truncate max-w-[160px]">
                      {a.name}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
                    className="absolute top-0.5 right-0.5 bg-bg/80 rounded-full p-0.5 text-fg opacity-0 group-hover:opacity-100 transition"
                    aria-label="Remove"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="h-12 w-12 grid place-items-center rounded-md border border-hairline bg-muted">
                  <Loader2 className="h-3 w-3 animate-spin text-faint" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          ref={taRef}
          value={text}
          onChange={autosize}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={imageMode ? 'A photograph of…' : 'Ask anything'}
          rows={1}
          className="w-full resize-none bg-transparent border-0 outline-none text-[15px] py-1.5 px-1 max-h-[200px] min-h-[28px] placeholder:text-faint leading-relaxed"
          disabled={disabled}
        />

        <div className="flex items-center gap-1 pt-1.5">
          <ToolBtn
            label="Attach file"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading || attachments.length >= 4}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
          </ToolBtn>
          <ToolBtn label="Voice" onClick={toggleVoice} disabled={disabled} active={recording}>
            {recording ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
          </ToolBtn>
          <ToolBtn
            label="Generate image"
            onClick={() => setImageMode((s) => !s)}
            active={imageMode}
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </ToolBtn>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10.5px] text-faint hidden sm:inline">
              <span className="kbd">↵</span> to send · <span className="kbd">⇧↵</span> new line
            </span>
            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                'h-8 w-8 grid place-items-center rounded-md transition shrink-0',
                canSend
                  ? 'bg-fg text-bg hover:opacity-90'
                  : 'bg-muted text-faint',
              )}
              aria-label="Send"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_MIME.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </form>
    </div>
  );
}

function ToolBtn({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-7 w-7 grid place-items-center rounded-md transition',
        active ? 'bg-muted text-fg' : 'text-faint hover:text-fg hover:bg-muted',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}
