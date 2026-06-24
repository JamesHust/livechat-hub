import type { RunStatus, UIMessage } from '@livechat-hub/shared';

/** Public lifecycle events the host application can subscribe to. */
export interface WidgetEvents {
  ready: void;
  open: void;
  close: void;
  destroy: void;
  message: UIMessage;
  'run:status': RunStatus;
  error: { message: string };
}

export type EventName = keyof WidgetEvents;
type Handler<E extends EventName> = (payload: WidgetEvents[E]) => void;

/** Tiny typed event emitter — no dependency, works everywhere. */
export class Emitter {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<EventName>);
    this.handlers.set(event, set);
    return () => this.off(event, handler);
  }

  off<E extends EventName>(event: E, handler: Handler<E>): void {
    this.handlers.get(event)?.delete(handler as Handler<EventName>);
  }

  emit<E extends EventName>(event: E, payload: WidgetEvents[E]): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch {
        /* never let a subscriber break the stream */
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}
