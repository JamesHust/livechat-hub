import { DEFAULT_RUN_PATH } from '@livechat-hub/shared';
import type {
  ContextItem,
  FrontendTool,
  InterruptResolution,
  UIMessage,
} from '@livechat-hub/shared';
import type { AgUiEvent } from './events';
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
}

class SseTransport implements Transport {
  constructor(private readonly config: SseTransportConfig) {}

  async *run(input: RunInput, options: RunOptions = {}): AsyncIterable<AgUiEvent> {
    const { apiUrl, runPath = DEFAULT_RUN_PATH, headers = {} } = this.config;
    const doFetch = this.config.fetchImpl ?? globalThis.fetch;
    const url = joinUrl(apiUrl, runPath);

    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...headers,
      },
      body: JSON.stringify(input),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new TransportError(
        `Transport request failed with status ${response.status}`,
        response.status,
      );
    }

    for await (const data of parseSseStream(response.body, options.signal)) {
      if (data === '[DONE]') return;
      const event = parseEvent(data);
      if (event) yield event;
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

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
