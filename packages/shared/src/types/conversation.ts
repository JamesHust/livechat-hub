import type { UIMessage } from './message';

/**
 * Lifecycle status of an in-flight agent run / streaming turn. `'interrupted'`
 * means the agent paused mid-run for human input (human-in-the-loop) and is
 * waiting for the user to resolve the open interrupts before resuming.
 */
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted';

/** How an interrupt should be presented to the user. */
export type InterruptKind = 'approval' | 'input';

/**
 * An open interrupt raised by the agent mid-run (human-in-the-loop). The agent
 * pauses and waits; the client resumes by starting a new run that addresses
 * every open interrupt by `id`. Mirrors AG-UI's `RunFinished` interrupt outcome.
 */
export interface RunInterrupt {
  /** Stable id used to address this interrupt when resuming. */
  id: string;
  /**
   * How to prompt the user — `'approval'` (accept/reject) or `'input'` (free
   * text). Defaults to approval; unknown values are treated as approval.
   */
  kind?: InterruptKind;
  /** Backend-supplied prompt shown to the user (e.g. "Allow sending email?"). */
  message?: string;
  /** Arbitrary payload describing what is being confirmed (e.g. a tool call). */
  value?: unknown;
}

/** The user's response to one interrupt, sent back to resume the run. */
export interface InterruptResolution {
  id: string;
  /** e.g. `{ approved: true }` for an approval, `{ text }` for an input prompt. */
  value: unknown;
}

export interface Conversation {
  id: string;
  title?: string;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight metadata for one conversation in the multi-thread list — enough
 * to render the sidebar (title, preview, recency) without loading the full
 * message history, which lives per-conversation in the message backend. The
 * store keeps an array of these plus the active id; the active conversation's
 * messages hydrate into {@link RunState}'s sibling `messages`.
 */
export interface ConversationSummary {
  id: string;
  /** Auto-derived from the first user message, or set via rename. */
  title?: string;
  createdAt: number;
  updatedAt: number;
  /** Short snippet of the latest message, shown under the title. */
  preview?: string;
}

export interface Session {
  /** Stable end-user / device identity, used to resume conversations. */
  sessionId: string;
  tenantId: string;
  /** Opaque user identifier supplied by the host application, if any. */
  userId?: string;
  /**
   * Display name a guest entered on the welcome screen (no host `userId`).
   * Its presence is what gates the guest past the welcome step into the chat.
   */
  guestName?: string;
  metadata?: Record<string, unknown>;
}

export interface RunState {
  status: RunStatus;
  /** Id of the run currently streaming, if any. */
  runId?: string;
  error?: { code?: string; message: string };
  /** Open human-in-the-loop interrupts awaiting the user, when `interrupted`. */
  interrupts?: RunInterrupt[];
}

/**
 * A live agent-authored artifact (document, chart, generated UI, …) delivered
 * out-of-band from the message stream via `ARTIFACT_UPDATE` and keyed by
 * `id`. The store keeps the latest payload per id; Sprint 5.4 surfaces these in
 * a dedicated artifact panel. `kind` is a logical type the UI resolves at
 * render time; `payload` is opaque, provider-agnostic content.
 */
export interface Artifact {
  id: string;
  kind: string;
  payload: unknown;
  /** Human-readable label for the artifact panel; falls back to the id / kind. */
  title?: string;
  /** Client clock (epoch ms) of the last update, for ordering / freshness. */
  updatedAt?: number;
}
