import type { UIMessage } from './message';

/** Lifecycle status of an in-flight agent run / streaming turn. */
export type RunStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface Conversation {
  id: string;
  title?: string;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
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
}
