import type { Conversation, Message, Persona } from './types';
import { getPersona } from './personas';

function fmtTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function conversationToMarkdown(
  conversation: Conversation,
  messages: Message[],
  customPersonas: Persona[] = [],
): string {
  const persona = getPersona(conversation.persona_id, customPersonas);
  const lines: string[] = [];

  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(
    `*With ${persona.emoji} ${persona.name} · ${fmtTimestamp(conversation.created_at)} → ${fmtTimestamp(conversation.updated_at)}*`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const m of messages) {
    if (m.role === 'system') continue;
    const speaker =
      m.role === 'user' ? 'You' : `${persona.emoji} ${persona.name}`;
    lines.push(`### ${speaker}`);
    lines.push(`*${fmtTimestamp(m.created_at)}*`);
    lines.push('');
    if (m.attachments && m.attachments.length > 0) {
      for (const a of m.attachments) {
        lines.push(`**Attachment:** ${a.name} (${a.type})`);
      }
      lines.push('');
    }
    lines.push(m.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('');
  lines.push('*Exported from keko.ai*');
  return lines.join('\n');
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadConversationAsMarkdown(
  conversation: Conversation,
  messages: Message[],
  customPersonas: Persona[] = [],
) {
  const md = conversationToMarkdown(conversation, messages, customPersonas);
  const safeName = conversation.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
  downloadMarkdown(safeName || 'conversation', md);
}
