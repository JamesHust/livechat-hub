/**
 * Minimal `text/event-stream` parser.
 *
 * Splits a byte stream into SSE frames and yields the fields of each frame
 * (`data`, plus `id` / `event` when present). Works with any
 * `ReadableStream<Uint8Array>`, so it is usable in browsers, extensions and
 * tests without an `EventSource` (which cannot send custom headers or use POST).
 *
 * The `id` field is surfaced so the transport can resume a dropped stream with
 * `Last-Event-ID`; comment frames (`:` heartbeats) carry no data but still count
 * as activity that resets the idle watchdog.
 */

/** One parsed SSE frame. `data` is `null` for a bare id / heartbeat frame. */
export interface SseMessage {
  data: string | null;
  /** `id:` field, if present — echoed back as `Last-Event-ID` on reconnect. */
  id?: string;
  /** `event:` field, if present. */
  event?: string;
}

export interface ParseSseOptions {
  signal?: AbortSignal;
  /**
   * Reject the stream if no bytes arrive for this long (ms). `0`/omitted
   * disables the watchdog. Any frame — including a comment heartbeat — resets it.
   */
  idleTimeoutMs?: number;
}

/** Thrown when a stream goes silent past `idleTimeoutMs`; retryable by callers. */
export class StreamIdleError extends Error {
  constructor(idleTimeoutMs: number) {
    super(`SSE stream idle for ${idleTimeoutMs}ms`);
    this.name = 'StreamIdleError';
  }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSseOptions = {},
): AsyncGenerator<SseMessage, void, unknown> {
  const { signal, idleTimeoutMs = 0 } = options;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await readNext(reader, signal, idleTimeoutMs);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Handle both \n\n and \r\n\r\n.
      let sep: number;
      while ((sep = indexOfFrameBoundary(buffer)) !== -1) {
        const rawFrame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + boundaryLength(buffer, sep));
        const frame = parseFrame(rawFrame);
        if (frame) yield frame;
      }
    }
    // Flush any trailing frame without a closing blank line.
    const frame = parseFrame(buffer);
    if (frame) yield frame;
  } finally {
    // Cancel (rather than only releaseLock) so an aborted / idle read that is
    // still pending is resolved and the underlying connection is torn down.
    await reader.cancel().catch(() => {});
  }
}

/**
 * `reader.read()` raced against the abort signal and the idle watchdog, so a
 * silent or aborted stream never blocks the loop forever. Resolves with the
 * chunk, or rejects with an `AbortError` (signal) / {@link StreamIdleError}.
 */
function readNext(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  idleTimeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal && idleTimeoutMs <= 0) return reader.read();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      cleanup();
      reject(abortError());
    };

    if (signal?.aborted) return void onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (idleTimeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new StreamIdleError(idleTimeoutMs));
      }, idleTimeoutMs);
    }

    reader.read().then(
      (result) => {
        if (settled) return;
        cleanup();
        resolve(result);
      },
      (error) => {
        if (settled) return;
        cleanup();
        reject(error);
      },
    );
  });
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

function indexOfFrameBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function boundaryLength(buffer: string, index: number): number {
  return buffer.startsWith('\r\n\r\n', index) ? 4 : 2;
}

/**
 * Parse one SSE frame into its fields. Multiple `data:` lines are joined with
 * newlines (per the spec); `id:` / `event:` are captured. A frame with only a
 * comment (`:` heartbeat) yields `{ data: null }` so callers still see the
 * activity. Returns `null` for an entirely empty frame.
 */
function parseFrame(frame: string): SseMessage | null {
  const lines = frame.split(/\r?\n/);
  const dataLines: string[] = [];
  let id: string | undefined;
  let event: string | undefined;
  let sawComment = false;

  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith(':')) {
      sawComment = true; // comment / heartbeat — no field, but real activity
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    switch (field) {
      case 'data':
        dataLines.push(value);
        break;
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      // `retry:` and unknown fields are ignored.
    }
  }

  if (dataLines.length === 0 && id === undefined && event === undefined) {
    return sawComment ? { data: null } : null;
  }
  return { data: dataLines.length > 0 ? dataLines.join('\n') : null, id, event };
}
