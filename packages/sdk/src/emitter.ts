import type {
  CsatResult,
  HandoffState,
  MessageFeedback,
  Presence,
  RunStatus,
  TelemetryEvent,
  UIMessage,
  UserIdentity,
} from '@livechat-hub/shared';

/** Public lifecycle events the host application can subscribe to. */
export interface WidgetEvents {
  ready: void;
  open: void;
  close: void;
  destroy: void;
  message: UIMessage;
  'run:status': RunStatus;
  error: { message: string; code?: string };
  /** The end-user rated an answer; `value` is `null` when a rating was cleared. */
  feedback: { messageId: string; value: MessageFeedback | null };
  /** The host called `identify()`; carries the merged identity fields. */
  identify: UserIdentity;
  /** The host called `updateConfig()`; carries the applied patch. */
  config: Record<string, unknown>;
  /** Agent/team presence changed (backend-driven via shared state). */
  presence: Presence;
  /** Human-agent handoff state changed (backend-driven via shared state). */
  handoff: HandoffState;
  /** The end-user submitted a CSAT rating. */
  csat: CsatResult;
}

export type EventName = keyof WidgetEvents;
type Handler<E extends EventName> = (payload: WidgetEvents[E]) => void;
/** Fires for every emitted event — the analytics tap. */
type AnyHandler = (event: TelemetryEvent) => void;

/** Tiny typed event emitter — no dependency, works everywhere. */
export class Emitter {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();
  private anyHandlers = new Set<AnyHandler>();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<EventName>);
    this.handlers.set(event, set);
    return () => this.off(event, handler);
  }

  off<E extends EventName>(event: E, handler: Handler<E>): void {
    this.handlers.get(event)?.delete(handler as Handler<EventName>);
  }

  /**
   * Subscribe to **every** event as `{ name, payload }` — the analytics /
   * telemetry tap. Returns an unsubscribe function.
   */
  onAny(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler);
    return () => void this.anyHandlers.delete(handler);
  }

  emit<E extends EventName>(event: E, payload: WidgetEvents[E]): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch {
        /* never let a subscriber break the stream */
      }
    });
    this.anyHandlers.forEach((h) => {
      try {
        h({ name: event, payload });
      } catch {
        /* analytics sinks must never break the stream */
      }
    });
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
