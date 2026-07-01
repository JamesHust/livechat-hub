/**
 * Canonical internal message schema.
 *
 * Inspired by the Vercel AI SDK `UIMessage` model: a message is a stable
 * envelope (`id`, `role`, `metadata`) carrying an ordered list of typed
 * `parts`. New part kinds can be added without changing the envelope, which
 * keeps the renderer pipeline and transport layer forward-compatible.
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Delivery lifecycle of a user message. `'sending'` until the run reaches the
 * backend, `'sent'` once it does, `'failed'` only when it never got there (e.g.
 * offline) so the UI can offer a per-message resend. Run-level failures after
 * delivery are surfaced by the error bar, not by flipping this back to failed.
 */
export type MessageStatus = 'sending' | 'sent' | 'failed';

/** End-user rating of an assistant answer (thumbs up / down). */
export type MessageFeedback = 'up' | 'down';

/** Lifecycle of a streamed tool invocation. */
export type ToolCallState = 'partial' | 'input-available' | 'output-available' | 'error';

/**
 * Streaming lifecycle of a text-like part: `'streaming'` while deltas are still
 * arriving, `'done'` once the matching `*_END` event sealed it. Absent on parts
 * that never streamed (e.g. a user message). Sealing forces a later delta for
 * the same message into a fresh part instead of merging blocks.
 */
export type TextStreamState = 'streaming' | 'done';

export interface TextPart {
  type: 'text';
  text: string;
  state?: TextStreamState;
}

export interface ReasoningPart {
  type: 'reasoning';
  text: string;
  state?: TextStreamState;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  /** Arguments, possibly partial while streaming. */
  args: unknown;
  state: ToolCallState;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ImagePart {
  type: 'image';
  url: string;
  alt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface VideoPart {
  type: 'video';
  url: string;
  poster?: string;
  mimeType?: string;
}

export interface AudioPart {
  type: 'audio';
  url: string;
  mimeType?: string;
  /** Clip length in milliseconds, when known (e.g. a recorded voice message). */
  durationMs?: number;
  /** Optional label; absent for an anonymous voice recording. */
  name?: string;
}

export interface FilePart {
  type: 'file';
  url: string;
  name: string;
  mimeType?: string;
  /** Size in bytes. */
  size?: number;
}

/** An inline source attribution, typically tied to a span of text. */
export interface CitationPart {
  type: 'citation';
  citationId: string;
  title?: string;
  url?: string;
  snippet?: string;
  /** Index in the surrounding text the citation annotates, if known. */
  startIndex?: number;
  endIndex?: number;
}

/** A standalone reference / source list entry. */
export interface ReferencePart {
  type: 'reference';
  referenceId: string;
  title: string;
  url?: string;
  description?: string;
}

/**
 * Generative UI / canvas block. The `component` is a logical name resolved by
 * a renderer at display time; `props` is the serialized payload. This keeps
 * arbitrary server-driven UI representable without coupling to React.
 */
export interface CanvasPart {
  type: 'canvas';
  component: string;
  props: Record<string, unknown>;
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolResultPart
  | ImagePart
  | VideoPart
  | AudioPart
  | FilePart
  | CitationPart
  | ReferencePart
  | CanvasPart;

export type MessagePartType = MessagePart['type'];

/**
 * Provider-agnostic message metadata. Known fields are typed; the open index
 * signature keeps it a superset of the previous `Record<string, unknown>` so
 * arbitrary host/agent annotations still ride along.
 */
export interface MessageMetadata {
  /** Client clock (epoch ms) when the message was created — drives timestamp UX. */
  createdAt?: number;
  /** Delivery lifecycle; meaningful on user messages. See {@link MessageStatus}. */
  status?: MessageStatus;
  /** End-user rating of an assistant answer, when given. */
  feedback?: MessageFeedback;
  [key: string]: unknown;
}

export interface UIMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  /** Arbitrary, provider-agnostic metadata (timestamps, status, model, etc.). */
  metadata?: MessageMetadata;
}

/** Narrowing helper used across renderers and the core store. */
export function isPartOfType<T extends MessagePartType>(
  part: MessagePart,
  type: T,
): part is Extract<MessagePart, { type: T }> {
  return part.type === type;
}
