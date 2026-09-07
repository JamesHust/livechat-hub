import type { ConversationSummary, MessagePart, UIMessage } from '@livechat-hub/shared';

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

/**
 * Filter the conversation list by a query against each thread's searchable
 * summary text (title + latest-message preview). Case-insensitive; an empty /
 * whitespace-only query returns every conversation unchanged. Pure and headless
 * — the list-level search box in the sidebar layers UI on top.
 *
 * Deep, per-message cross-thread search would need every thread's full history
 * loaded (or a backend index); that is an optional multi-device concern (see
 * `docs/BACKEND.md`). This covers the common "find the thread" case synchronously.
 */
export function searchConversations(
  summaries: ConversationSummary[],
  query: string,
): ConversationSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return summaries;
  return summaries.filter((c) => conversationText(c).toLowerCase().includes(needle));
}

function conversationText(summary: ConversationSummary): string {
  return [summary.title, summary.preview].filter(Boolean).join(' ');
}

/** Options for {@link orderConversations}. */
export interface OrderConversationsOptions {
  /** Include archived threads (still sorted in). Default: archived are hidden. */
  showArchived?: boolean;
}

/**
 * Order conversations for display: pinned first, then most-recently-active. When
 * `showArchived` is false (default) archived threads are dropped. Pure and
 * stable enough to test directly; the sidebar renders the result as-is.
 */
export function orderConversations(
  summaries: ConversationSummary[],
  options: OrderConversationsOptions = {},
): ConversationSummary[] {
  const visible = options.showArchived ? summaries : summaries.filter((c) => !c.archived);
  return [...visible].sort((a, b) => {
    // Pinned threads float to the top regardless of recency.
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
