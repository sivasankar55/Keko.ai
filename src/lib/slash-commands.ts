/**
 * Slash command definitions used by the composer's autocomplete and the
 * command palette. Each command exposes a `kind` discriminator that the
 * caller resolves to a concrete action — that keeps this file dependency-free.
 */

export interface SlashCommand {
  /** What the user types after the leading slash, e.g. "branch". */
  name: string;
  /** Short label rendered in the dropdown. */
  label: string;
  /** One-line description rendered below the label. */
  description: string;
  /** Action token consumed by the host component. */
  kind: SlashKind;
  /** Optional placeholder argument hint, e.g. "<persona>". */
  argHint?: string;
}

export type SlashKind =
  | 'branch'
  | 'share'
  | 'silent'
  | 'persona'
  | 'clear'
  | 'invite'
  | 'docs'
  | 'export'
  | 'help';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'branch',
    label: '/branch',
    description: 'Fork this conversation from the latest message',
    kind: 'branch',
  },
  {
    name: 'share',
    label: '/share',
    description: 'Create a public share link',
    kind: 'share',
  },
  {
    name: 'silent',
    label: '/silent',
    description: 'Toggle silent mode (peers see your message, the AI does not)',
    kind: 'silent',
  },
  {
    name: 'persona',
    label: '/persona',
    description: 'Start a new chat with a specific persona',
    kind: 'persona',
    argHint: '<name>',
  },
  {
    name: 'invite',
    label: '/invite',
    description: 'Invite someone to this conversation',
    kind: 'invite',
  },
  {
    name: 'docs',
    label: '/docs',
    description: 'Manage attached documents',
    kind: 'docs',
  },
  {
    name: 'export',
    label: '/export',
    description: 'Download this conversation as Markdown',
    kind: 'export',
  },
  {
    name: 'clear',
    label: '/clear',
    description: 'Delete every message in this conversation',
    kind: 'clear',
  },
  {
    name: 'help',
    label: '/help',
    description: 'List all slash commands',
    kind: 'help',
  },
];

/**
 * Parse a composer input value, returning the slash command if the input
 * starts with `/` and matches a known command name (or its prefix).
 *
 * Returns `null` if the input is not a slash command (no leading slash, or
 * a slash followed by a space — which is treated as ordinary text).
 */
export function parseSlashInput(value: string): {
  command: SlashCommand | null;
  query: string;
  argument: string;
} | null {
  if (!value.startsWith('/')) return null;
  const body = value.slice(1);
  const firstSpace = body.indexOf(' ');
  const name = (firstSpace === -1 ? body : body.slice(0, firstSpace)).toLowerCase();
  const argument = firstSpace === -1 ? '' : body.slice(firstSpace + 1);
  const exact = SLASH_COMMANDS.find((c) => c.name === name) ?? null;
  return { command: exact, query: name, argument };
}

/** Filter commands matching a query prefix for the autocomplete dropdown. */
export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) => c.name.startsWith(q) || c.description.toLowerCase().includes(q),
  );
}
