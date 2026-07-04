import type { MessagePart, UIMessage } from '@livechat-hub/shared';

/** A message that matches a search query, in conversation order. */
export interface SearchMatch {
  messageId: string;
  /** The searchable text of the message (already flattened), for previews. */
  text: string;
}

/**
 * Flatten the human-readable text of a message across its parts, so search
 * covers what the user actually sees — assistant/user prose, reasoning,
 * attachment names, citation/reference titles — not the wire scaffolding
 * (tool-call ids, raw args). Provider-agnostic: reads only the canonical schema.
 */
export function messageText(message: UIMessage): string {
  return message.parts.map(partText).filter(Boolean).join(' ');
}

function partText(part: MessagePart): string {
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return part.text;
    case 'file':
      return part.name;
    case 'image':
      return part.alt ?? '';
    case 'citation':
      return [part.title, part.snippet].filter(Boolean).join(' ');
    case 'reference':
      return [part.title, part.description].filter(Boolean).join(' ');
    default:
      return '';
  }
}

/**
 * Pure, case-insensitive substring search over a conversation. Returns the
 * matching messages in order; an empty / whitespace-only query matches nothing.
 * Headless and trivially testable — the UI layers scroll-to + highlight on top.
 */
export function searchMessages(messages: UIMessage[], query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: SearchMatch[] = [];
  for (const message of messages) {
    const text = messageText(message);
    if (text.toLowerCase().includes(needle)) matches.push({ messageId: message.id, text });
  }
  return matches;
}
