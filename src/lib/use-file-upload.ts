'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ALLOWED_MIME, MAX_FILE_BYTES } from '@/lib/validation';
import { toast } from '@/components/ui/toaster';
import type { Attachment } from '@/lib/types';

function inferMime(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    default:
      return '';
  }
}

export function useFileUpload(conversationId: string) {
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (files: File[], existingCount: number): Promise<Attachment[]> => {
      const remaining = Math.max(0, 4 - existingCount);
      if (remaining === 0) {
        toast({ title: 'Up to 4 attachments per message', variant: 'error' });
        return [];
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Please sign in again', variant: 'error' });
        return [];
      }

      setUploading(true);
      const out: Attachment[] = [];

      for (const file of files.slice(0, remaining)) {
        const mime = inferMime(file);
        if (!ALLOWED_MIME.includes(mime)) {
          toast({
            title: 'File type not allowed',
            description: `${file.name} (${file.type || 'unknown type'})`,
            variant: 'error',
          });
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast({ title: 'File too large', description: `${file.name} is over 8MB`, variant: 'error' });
          continue;
        }

        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const id = crypto.randomUUID();
        const path = `${user.id}/${conversationId}/${id}.${ext}`;
        const { error } = await supabase.storage
          .from('attachments')
          .upload(path, file, { contentType: mime, upsert: false });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[upload]', error);
          toast({ title: 'Upload failed', description: error.message, variant: 'error' });
          continue;
        }
        const { data: signed } = await supabase.storage
          .from('attachments')
          .createSignedUrl(path, 3600);

        out.push({
          id,
          name: file.name,
          type: mime,
          size: file.size,
          path,
          url: signed?.signedUrl,
          kind: mime.startsWith('image') ? 'image' : 'document',
        });
      }
      setUploading(false);
      return out;
    },
    [conversationId],
  );

  return { upload, uploading };
}
