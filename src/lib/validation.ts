import { z } from 'zod';

export const MAX_MESSAGE_CHARS = 12_000;
export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
export const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
];

export const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
  attachments: z
    .array(
      z.object({
        path: z.string().min(1).max(512),
        name: z.string().min(1).max(256),
        type: z.string().min(1).max(128),
        size: z.number().int().positive().max(MAX_FILE_BYTES),
      }),
    )
    .max(4)
    .optional(),
});

export const createConversationSchema = z.object({
  personaId: z.string().min(1).max(64),
  title: z.string().min(1).max(120).optional(),
});

export const renameConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
});

export const imageGenSchema = z.object({
  prompt: z.string().min(3).max(800),
  conversationId: z.string().uuid(),
});

export function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}
