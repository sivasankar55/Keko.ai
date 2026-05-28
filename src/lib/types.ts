export type Theme = 'bone' | 'obsidian';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  systemPrompt: string;
  custom?: boolean;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  persona_id: string;
  pinned_at?: string | null;
  model_id?: string | null;
  branched_from_conversation_id?: string | null;
  branched_from_message_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id?: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[] | null;
  created_at: string;
  silent?: boolean;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  url?: string;
  kind: 'image' | 'document' | 'generated-image';
}

export interface DbPersona {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  tagline: string;
  system_prompt: string;
  created_at: string;
}
