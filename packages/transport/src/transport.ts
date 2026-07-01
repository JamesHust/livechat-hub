import { DEFAULT_RUN_PATH, TRANSPORT_DEFAULTS } from '@livechat-hub/shared';
import type {
  ContextItem,
  FrontendTool,
  GetAuthToken,
  InterruptResolution,
  UIMessage,
} from '@livechat-hub/shared';
import { AgUiEventType, type AgUiEvent } from './events';
import { parseSseStream } from './sse';
import { parseEvent } from './validate';

/** Payload sent to the backend to start an agent run. Provider-agnostic. */
export interface RunInput {
  threadId: string;
  tenantId: string;
  messages: UIMessage[];
  userId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Frontend tools the agent may call in the browser. The backend emits a
   * `TOOL_CALL_*` for one of these and finishes without a result; the client
   * executes the handler and starts a follow-up run carrying the result.
   */
  tools?: FrontendTool[];
  /** Live context the host page provides to the agent for this run. */
  context?: ContextItem[];
  /**
   * Resolutions to open interrupts, resuming a previously paused (interrupted)
   * run. Each entry addresses one `RunInterrupt` by id.
   */
  resume?: InterruptResolution[];
  /**
   * Shared agent state owned/edited by the frontend, forwarded so the agent
   * sees the client's latest view. The agent mirrors changes back via
   * `STATE_SNAPSHOT` / `STATE_DELTA`.
   */
  state?: Record<string, unknown>;
}

export interface RunOptions {
  signal?: AbortSignal;
}

/**
 * Transport contract. Implementations turn a run request into a stream of
 * AG-UI events. The rest of the system depends only on this interface, never
 * on a concrete network mechanism — enabling SSE today and WebSocket later.
 */
export interface Transport {
  run(input: RunInput, options?: RunOptions): AsyncIterable<AgUiEvent>;
}

export interface SseTransportConfig {
  apiUrl: string;
  runPath?: string;
  headers?: Record<string, string>;
  /** Override for tests / custom environments. */
  fetchImpl?: typeof fetch;
  /** Max reconnect attempts before the run fails. Default `TRANSPORT_DEFAULTS`. */
  maxRetries?: number;
  /** Base backoff delay in ms (grows exponentially with jitter). */
  baseRetryDelayMs?: number;
  /** Ceiling for a single backoff delay in ms. */
  maxRetryDelayMs?: number;
  /** Reconnect a stream idle (no bytes/heartbeat) longer than this (ms). `0` disables. */
  idleTimeoutMs?: number;
  /** Supplies/refreshes the bearer token attached to each request. */
  getAuthToken?: GetAuthToken;
  /** Invoked once on 401/403 to refresh credentials before a single retry. */
  onAuthError?: (status: number) => void | Promise<void>;
}

class SseTransport implements Transport {
  constructor(private readonly config: SseTransportConfig) {}

  async *run(input: RunInput, options: RunOptions = {}): AsyncIterable<AgUiEvent> {
    const {
      apiUrl,
      runPath = DEFAULT_RUN_PATH,
      headers = {},
      maxRetries = TRANSPORT_DEFAULTS.maxRetries,
      baseRetryDelayMs = TRANSPORT_DEFAULTS.baseRetryDelayMs,
      maxRetryDelayMs = TRANSPORT_DEFAULTS.maxRetryDelayMs,
      idleTimeoutMs = TRANSPORT_DEFAULTS.idleTimeoutMs,
      getAuthToken,
      onAuthError,
    } = this.config;
    const doFetch = this.config.fetchImpl ?? globalThis.fetch;
    const url = joinUrl(apiUrl, runPath);
    const body = JSON.stringify(input);

    // Resume state carried across reconnects: the last SSE id (sent back as
    // `Last-Event-ID`) and the set of ids already surfaced (so a backend that
    // replays from the start on reconnect never double-yields events).
    const seenEventIds = new Set<string>();
    let lastEventId: string | undefined;
    let retries = 0;
    let authRefreshed = false;

    // One backoff step: waits (abortable) then enforces the retry budget.
    const reconnect = async (reason: string, status?: number): Promise<void> => {
      const delay = backoffDelay(retries, baseRetryDelayMs, maxRetryDelayMs);
      await sleep(delay, options.signal);
      retries += 1;
      if (retries > maxRetries) {
        throw new TransportError(
          `${reason} — gave up after ${maxRetries} reconnect attempts`,
          status,
        );
      }
    };

    while (true) {
      if (options.signal?.aborted) throw abortError();

      let response: Response;
      try {
        const authToken = getAuthToken ? await getAuthToken() : undefined;
        response = await doFetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
            ...headers,
            ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
            ...(lastEventId !== undefined ? { 'last-event-id': lastEventId } : {}),
          },
          body,
          signal: options.signal,
        });
      } catch (error) {
        if (isAbort(error, options.signal)) throw error;
        await reconnect(`Transport request failed: ${(error as Error).message}`);
        continue;
      }

      if (!response.ok || !response.body) {
        const status = response.status;
        // 401/403: refresh credentials once, then retry immediately (a fresh
        // token from `getAuthToken` rides along) without spending the budget.
        if ((status === 401 || status === 403) && onAuthError && !authRefreshed) {
          authRefreshed = true;
          await onAuthError(status);
          continue;
        }
        // 429: honor `Retry-After` (seconds or HTTP-date), else back off.
        if (status === 429) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          await sleep(
            retryAfter ?? backoffDelay(retries, baseRetryDelayMs, maxRetryDelayMs),
            options.signal,
          );
          retries += 1;
          if (retries > maxRetries) {
            throw new TransportError(`Rate-limited — gave up after ${maxRetries} retries`, status);
          }
          continue;
        }
        // Server errors are transient, as is an OK response that somehow lacks a
        // body; other 4xx (incl. 401/403 with no refresh) are the client's fault.
        if (status >= 500 || (response.ok && !response.body)) {
          await reconnect(`Transport request failed with status ${status}`, status);
          continue;
        }
        throw new TransportError(`Transport request failed with status ${status}`, status);
      }

      const bodyStream = response.body;
      let reachedTerminal = false;
      try {
        for await (const msg of parseSseStream(bodyStream, {
          signal: options.signal,
          idleTimeoutMs,
        })) {
          if (msg.id !== undefined) {
            lastEventId = msg.id;
            if (seenEventIds.has(msg.id)) continue; // replayed frame — already delivered
            seenEventIds.add(msg.id);
          }
          if (msg.data === null) continue; // heartbeat / bare-id frame
          if (msg.data === '[DONE]') {
            reachedTerminal = true;
            break;
          }
          const event = parseEvent(msg.data);
          if (!event) continue;
          yield event;
          if (event.type === AgUiEventType.RunFinished || event.type === AgUiEventType.RunError) {
            reachedTerminal = true;
            break;
          }
        }
      } catch (error) {
        if (isAbort(error, options.signal)) throw error;
        // Idle timeout or a mid-stream network drop — reconnect and resume.
        await reconnect(`Stream interrupted: ${(error as Error).message}`);
        continue;
      }

      if (reachedTerminal) return;
      // The stream closed before a terminal event (RUN_FINISHED/RUN_ERROR/[DONE]).
      await reconnect('Stream ended before completion');
    }
  }
}

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export function createSseTransport(config: SseTransportConfig): Transport {
  return new SseTransport(config);
}

/** Full-jitter exponential backoff: random delay in `[0, min(max, base·2^n)]`. */
function backoffDelay(attempt: number, base: number, max: number): number {
  const ceiling = Math.min(max, base * 2 ** attempt);
  return Math.random() * ceiling;
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** Abortable delay: rejects with an `AbortError` if the signal fires first. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return void reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function abortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
