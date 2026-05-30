/**
 * Helpers for the @-mention syntax we use in chat messages.
 *
 * Stored format: `@[Display Name](user-uuid)`
 * Render format: a chip with the display name, click → no-op for now.
 *
 * The composer detects `@<query>` while typing and shows an autocomplete; on
 * select, it replaces the in-progress token with the canonical stored form.
 */

export interface MentionContext {
  /** The slice of text from the active `@` to the caret. */
  trigger: string;
  /** Caret index where the trigger starts (the `@`). */
  start: number;
  /** Caret index where the query currently ends. */
  end: number;
  /** Just the query body — the bit after `@`. */
  query: string;
}

/**
 * Look at the input around the caret. If the user is mid-typing an @-mention
 * (i.e. there's an `@` to the left of the caret with no whitespace between),
 * return the trigger context. Otherwise null.
 */
export function detectMentionTrigger(text: string, caret: number): MentionContext | null {
  if (caret > text.length) caret = text.length;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // Make sure the @ is at the start of input or after whitespace —
      // otherwise it's likely an email or filename.
      if (i === 0 || /\s/.test(text[i - 1])) {
        return {
          trigger: text.slice(i, caret),
          start: i,
          end: caret,
          query: text.slice(i + 1, caret),
        };
      }
      return null;
    }
    if (/\s/.test(ch) || ch === '\n') return null;
    i--;
  }
  return null;
}

/**
 * Replace the active mention trigger with the canonical token. Returns the
 * new text and the caret position to place after.
 */
export function applyMention(
  text: string,
  ctx: MentionContext,
  member: { id: string; display_name: string },
): { text: string; caret: number } {
  const token = `@[${member.display_name}](${member.id})`;
  // Add a trailing space so the caret can keep typing immediately after.
  const replaced = text.slice(0, ctx.start) + token + ' ' + text.slice(ctx.end);
  return { text: replaced, caret: ctx.start + token.length + 1 };
}

/**
 * Parse a stored message body into a list of segments: plain text + mentions.
 * Used by the message bubble to render chips inline.
 */
export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; userId: string; displayName: string };

export function parseMentionSegments(content: string): MentionSegment[] {
  const re = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
  const out: MentionSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      out.push({ type: 'text', value: content.slice(last, m.index) });
    }
    out.push({ type: 'mention', displayName: m[1], userId: m[2].toLowerCase() });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    out.push({ type: 'text', value: content.slice(last) });
  }
  return out;
}
