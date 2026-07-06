/**
 * WebSocket transport — a bidirectional alternative to the SSE adapter that
 * speaks the same AG-UI event protocol and shares Sprint 1's resilience dialect
 * (exponential backoff, idle watchdog, resume via last-event id). A full-duplex
 * socket is what future features like "user is typing" ride on; here it already
 * carries a run request up and streams the agent's events back down.
 *
 * Wire format (see docs/BACKEND.md):
 *   client → server  {"type":"run","runKey":"<k>","payload":<RunInput>,"token"?,"lastEventId"?}
 *   client → server  {"type":"ping"}                         (app-level keepalive)
 *   server → client  {"type":"event","runKey"?,"id"?,"event":<AgUiEvent>}   (envelope)
 *   server → client  <AgUiEvent>                             (bare, single-run backends)
 *   server → client  {"type":"pong"}                         (keepalive ack, ignored)
 *
 * One socket is opened per run (mirroring how the SSE transport opens one
 * request per run); it reconnects and resumes if it drops before a terminal
 * `RUN_FINISHED` / `RUN_ERROR`.
 */

import { DEFAULT_RUN_PATH, TRANSPORT_DEFAULTS, type GetAuthToken } from '@livechat-hub/shared';
import { AgUiEventType, type AgUiEvent } from './events';
import { validateEvent } from './validate';
import { abortError, backoffDelay, sleep } from './backoff';
import { TransportError, type RunInput, type RunOptions, type Transport } from './transport';

/** Minimal subset of the DOM `WebSocket` this transport relies on. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: WsEvent) => void,
  ): void;
  removeEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: WsEvent) => void,
  ): void;
}

/** Shape of the events the socket dispatches (only `data` is read). */
export interface WsEvent {
  data?: unknown;
}

/** Opens a socket. Tests inject a fake; the default wraps the DOM `WebSocket`. */
export type WebSocketFactory = (url: string, protocols?: string | string[]) => WebSocketLike;

export interface WebSocketTransportConfig {
  /** Endpoint. `http(s)://` is upgraded to `ws(s)://`; `ws(s)://` used as-is. */
  url: string;
  /** Path appended to `url` for the run socket. Default `DEFAULT_RUN_PATH`. */
  runPath?: string;
  /** Sub-protocols forwarded to the socket constructor. */
  protocols?: string | string[];
  /** Socket factory override (tests / custom environments). */
  socketFactory?: WebSocketFactory;
  /**
   * App-level keepalive: send `{"type":"ping"}` every N ms. Browsers can't send
   * native ping frames, so the backend should reply `{"type":"pong"}`. `0`
   * disables. Default `TRANSPORT_DEFAULTS.idleTimeoutMs / 2`.
   */
  pingIntervalMs?: number;
  /** Max reconnect attempts before the run fails. Default `TRANSPORT_DEFAULTS`. */
  maxRetries?: number;
  /** Base backoff delay in ms (grows exponentially with jitter). */
  baseRetryDelayMs?: number;
  /** Ceiling for a single backoff delay in ms. */
  maxRetryDelayMs?: number;
  /** Reconnect a socket silent (no frame) longer than this (ms). `0` disables. */
  idleTimeoutMs?: number;
  /**
   * Supplies/refreshes the bearer token. Browsers can't set WebSocket headers,
   * so it rides in the `run` frame's `token` field instead of a header.
   */
  getAuthToken?: GetAuthToken;
}

/** A parsed inbound frame: a delivered event (with optional resume id / run key) or a pong. */
export type WsInbound =
  | { kind: 'event'; event: AgUiEvent; id?: string; runKey?: string }
  | { kind: 'pong' };

const WS_OPEN = 1;

/**
 * Parse one inbound WebSocket text frame into a {@link WsInbound}. Accepts the
 * `{type:'event',…}` envelope, a bare AG-UI event, and `{type:'pong'|'ping'}`
 * keepalives. Returns `null` for malformed JSON or an unrecognized / invalid
 * event — pure and independently testable.
 */
export function parseWsFrame(data: unknown): WsInbound | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.type === 'pong' || obj.type === 'ping') return { kind: 'pong' };

  // Envelope: { type:'event', runKey?, id?, event }
  if (obj.type === 'event') {
    if (!validateEvent(obj.event)) return null;
    return {
      kind: 'event',
      event: obj.event,
      id: typeof obj.id === 'string' ? obj.id : undefined,
      runKey: typeof obj.runKey === 'string' ? obj.runKey : undefined,
    };
  }

  // Bare AG-UI event (single-run backends).
  if (validateEvent(parsed)) return { kind: 'event', event: parsed };
  return null;
}

/** Outcome of one connection attempt; never rejects, so the run loop can decide. */
type AttemptResult =
  | { type: 'terminal' }
  | { type: 'dropped'; reason: string }
  | { type: 'aborted' };

/**
 * A tiny push→pull bridge: socket callbacks `push()` events; the run generator
 * `for await`s them. `end()` completes the iteration (buffered values drain
 * first); resolves are handed out FIFO.
 */
class EventQueue {
  private values: AgUiEvent[] = [];
  private waiting: Array<(r: IteratorResult<AgUiEvent>) => void> = [];
  private ended = false;

  push(value: AgUiEvent): void {
    if (this.ended) return;
    const resolve = this.waiting.shift();
    if (resolve) resolve({ value, done: false });
    else this.values.push(value);
  }

  end(): void {
    this.ended = true;
    let resolve: ((r: IteratorResult<AgUiEvent>) => void) | undefined;
    while ((resolve = this.waiting.shift())) resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<AgUiEvent> {
    return {
      next: (): Promise<IteratorResult<AgUiEvent>> => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiting.push(resolve));
      },
    };
  }
}

let runKeySeq = 0;

class WebSocketTransport implements Transport {
  constructor(private readonly config: WebSocketTransportConfig) {}

  async *run(input: RunInput, options: RunOptions = {}): AsyncIterable<AgUiEvent> {
    const {
      url,
      runPath = DEFAULT_RUN_PATH,
      protocols,
      maxRetries = TRANSPORT_DEFAULTS.maxRetries,
      baseRetryDelayMs = TRANSPORT_DEFAULTS.baseRetryDelayMs,
      maxRetryDelayMs = TRANSPORT_DEFAULTS.maxRetryDelayMs,
      idleTimeoutMs = TRANSPORT_DEFAULTS.idleTimeoutMs,
      pingIntervalMs = Math.floor(TRANSPORT_DEFAULTS.idleTimeoutMs / 2),
      getAuthToken,
    } = this.config;
    const factory = this.config.socketFactory ?? defaultFactory;
    const target = toWsUrl(url, runPath);
    const signal = options.signal;
    // A stable key so a resumed run reuses the same server-side run, and so a
    // multiplexing backend can address this run's events back to us.
    const runKey = `wsrun_${++runKeySeq}`;

    // Resume state carried across reconnects (mirrors the SSE transport).
    const seenEventIds = new Set<string>();
    let lastEventId: string | undefined;
    let retries = 0;

    while (true) {
      if (signal?.aborted) throw abortError();

      const queue = new EventQueue();
      const token = getAuthToken ? await getAuthToken() : undefined;
      const attempt = this.streamAttempt({
        factory,
        target,
        protocols,
        input,
        runKey,
        token,
        lastEventId,
        idleTimeoutMs,
        pingIntervalMs,
        signal,
        queue,
        seenEventIds,
        onEventId: (id) => (lastEventId = id),
      });

      // Yield events as they arrive; `end()` inside the attempt exits this loop.
      for await (const event of queue) yield event;

      const result = await attempt;
      if (result.type === 'terminal') return;
      if (result.type === 'aborted') throw abortError();

      // Dropped before a terminal event — back off and reconnect (resume).
      await sleep(backoffDelay(retries, baseRetryDelayMs, maxRetryDelayMs), signal);
      retries += 1;
      if (retries > maxRetries) {
        throw new TransportError(
          `${result.reason} — gave up after ${maxRetries} reconnect attempts`,
        );
      }
    }
  }

  /**
   * One socket lifecycle: open, send the run frame, stream events into `queue`,
   * and resolve how it ended. Cleans up its listeners/timers exactly once and
   * always `end()`s the queue so the caller's `for await` unblocks.
   */
  private streamAttempt(ctx: {
    factory: WebSocketFactory;
    target: string;
    protocols?: string | string[];
    input: RunInput;
    runKey: string;
    token?: string;
    lastEventId?: string;
    idleTimeoutMs: number;
    pingIntervalMs: number;
    signal?: AbortSignal;
    queue: EventQueue;
    seenEventIds: Set<string>;
    onEventId: (id: string) => void;
  }): Promise<AttemptResult> {
    return new Promise<AttemptResult>((resolve) => {
      const socket = ctx.factory(ctx.target, ctx.protocols);
      let settled = false;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let pingTimer: ReturnType<typeof setInterval> | undefined;

      const cleanup = () => {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        if (pingTimer !== undefined) clearInterval(pingTimer);
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('message', onMessage);
        socket.removeEventListener('error', onError);
        socket.removeEventListener('close', onClose);
        ctx.signal?.removeEventListener('abort', onAbort);
      };

      /** Finish this attempt once: tear down, drain the queue, report `result`. */
      const finish = (result: AttemptResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          if (socket.readyState === WS_OPEN) socket.close();
        } catch {
          /* closing a socket mid-handshake can throw — ignore */
        }
        ctx.queue.end();
        resolve(result);
      };

      const resetIdle = () => {
        if (ctx.idleTimeoutMs <= 0) return;
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => finish({ type: 'dropped', reason: 'Socket idle' }),
          ctx.idleTimeoutMs,
        );
      };

      const onOpen = () => {
        const frame: Record<string, unknown> = {
          type: 'run',
          runKey: ctx.runKey,
          payload: ctx.input,
        };
        if (ctx.token) frame.token = ctx.token;
        if (ctx.lastEventId !== undefined) frame.lastEventId = ctx.lastEventId;
        try {
          socket.send(JSON.stringify(frame));
        } catch (error) {
          finish({ type: 'dropped', reason: `Send failed: ${(error as Error).message}` });
          return;
        }
        resetIdle();
        if (ctx.pingIntervalMs > 0) {
          pingTimer = setInterval(() => {
            if (socket.readyState === WS_OPEN) {
              try {
                socket.send('{"type":"ping"}');
              } catch {
                /* a failing send surfaces via close/error — ignore here */
              }
            }
          }, ctx.pingIntervalMs);
        }
      };

      const onMessage = (event: WsEvent) => {
        const frame = parseWsFrame(event.data);
        if (!frame) return;
        resetIdle();
        if (frame.kind === 'pong') return;
        // Ignore another run's events on a shared/multiplexed socket.
        if (frame.runKey !== undefined && frame.runKey !== ctx.runKey) return;
        if (frame.id !== undefined) {
          ctx.onEventId(frame.id);
          if (ctx.seenEventIds.has(frame.id)) return; // replayed on resume — already delivered
          ctx.seenEventIds.add(frame.id);
        }
        ctx.queue.push(frame.event);
        if (
          frame.event.type === AgUiEventType.RunFinished ||
          frame.event.type === AgUiEventType.RunError
        ) {
          finish({ type: 'terminal' });
        }
      };

      const onError = () => finish({ type: 'dropped', reason: 'Socket error' });
      const onClose = () => finish({ type: 'dropped', reason: 'Socket closed before completion' });
      const onAbort = () => finish({ type: 'aborted' });

      socket.addEventListener('open', onOpen);
      socket.addEventListener('message', onMessage);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
      if (ctx.signal) {
        if (ctx.signal.aborted) return void finish({ type: 'aborted' });
        ctx.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}

export function createWebSocketTransport(config: WebSocketTransportConfig): Transport {
  return new WebSocketTransport(config);
}

const defaultFactory: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as WebSocketLike;

/** Join base + path and upgrade an `http(s)` scheme to `ws(s)`. */
function toWsUrl(base: string, path: string): string {
  const joined = `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return joined.replace(/^http(s?):\/\//i, 'ws$1://');
}
