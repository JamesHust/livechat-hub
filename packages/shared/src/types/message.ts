/**
 * Canonical internal message schema.
 *
 * Inspired by the Vercel AI SDK `UIMessage` model: a message is a stable
 * envelope (`id`, `role`, `metadata`) carrying an ordered list of typed
 * `parts`. New part kinds can be added without changing the envelope, which
 * keeps the renderer pipeline and transport layer forward-compatible.
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Lifecycle of a streamed tool invocation. */
export type ToolCallState = 'partial' | 'input-available' | 'output-available' | 'error';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  text: string;
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

export interface UIMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  /** Arbitrary, provider-agnostic metadata (timestamps, model, etc.). */
  metadata?: Record<string, unknown>;
}

/** Narrowing helper used across renderers and the core store. */
export function isPartOfType<T extends MessagePartType>(
  part: MessagePart,
  type: T,
): part is Extract<MessagePart, { type: T }> {
  return part.type === type;
}
