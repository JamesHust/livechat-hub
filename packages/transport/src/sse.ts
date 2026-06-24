/**
 * Minimal `text/event-stream` parser.
 *
 * Splits a byte stream into SSE frames and yields the concatenated `data:`
 * payload of each frame. Works with any `ReadableStream<Uint8Array>`, so it is
 * usable in browsers, extensions and tests without an `EventSource` (which
 * cannot send custom headers or use POST).
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. Handle both \n\n and \r\n\r\n.
      let sep: number;
      while ((sep = indexOfFrameBoundary(buffer)) !== -1) {
        const rawFrame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + boundaryLength(buffer, sep));
        const data = extractData(rawFrame);
        if (data !== null) yield data;
      }
    }
    // Flush any trailing frame without a closing blank line.
    const data = extractData(buffer);
    if (data !== null) yield data;
  } finally {
    reader.releaseLock();
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
 * Extract the `data:` payload from one SSE frame. Comment lines (`:`) and
 * other fields are ignored. Returns `null` when there is no data field.
 */
function extractData(frame: string): string | null {
  const lines = frame.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}
