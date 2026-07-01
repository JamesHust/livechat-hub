import { describe, expect, it } from 'vitest';
import { parseSseStream } from './sse';
import { parseEvent, validateEvent } from './validate';
import { AgUiEventType, type AgUiEvent } from './events';
import { createSseTransport, TransportError, type RunInput } from './transport';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  it('yields data payloads split across chunks', async () => {
    const stream = streamFrom(['data: {"a":', '1}\n\n', 'data: hello\n\n']);
    const out: (string | null)[] = [];
    for await (const m of parseSseStream(stream)) out.push(m.data);
    expect(out).toEqual(['{"a":1}', 'hello']);
  });

  it('surfaces the id field for resume', async () => {
    const stream = streamFrom(['id: 7\ndata: hi\n\n', ': ping\n\n']);
    const out: Array<{ data: string | null; id?: string }> = [];
    for await (const m of parseSseStream(stream)) out.push(m);
    expect(out).toEqual([{ data: 'hi', id: '7' }, { data: null }]);
  });
});

describe('validateEvent', () => {
  it('accepts a valid TEXT_MESSAGE_CONTENT event', () => {
    expect(
      validateEvent({ type: AgUiEventType.TextMessageContent, messageId: 'm1', delta: 'hi' }),
    ).toBe(true);
  });

  it('rejects unknown event types', () => {
    expect(validateEvent({ type: 'NOPE' })).toBe(false);
  });

  it('rejects events missing required fields', () => {
    expect(validateEvent({ type: AgUiEventType.TextMessageContent, messageId: 'm1' })).toBe(false);
  });

  it('accepts RUN_FINISHED with no outcome and with a valid interrupt outcome', () => {
    expect(validateEvent({ type: AgUiEventType.RunFinished, runId: 'r1' })).toBe(true);
    expect(
      validateEvent({
        type: AgUiEventType.RunFinished,
        runId: 'r1',
        outcome: { type: 'interrupt', interrupts: [{ id: 'i1', kind: 'approval' }] },
      }),
    ).toBe(true);
  });

  it('rejects a RUN_FINISHED interrupt outcome that is empty or missing ids', () => {
    expect(
      validateEvent({
        type: AgUiEventType.RunFinished,
        runId: 'r1',
        outcome: { type: 'interrupt', interrupts: [] },
      }),
    ).toBe(false);
    expect(
      validateEvent({
        type: AgUiEventType.RunFinished,
        runId: 'r1',
        outcome: { type: 'interrupt', interrupts: [{ kind: 'approval' }] },
      }),
    ).toBe(false);
  });
});

describe('parseEvent', () => {
  it('returns null on malformed JSON', () => {
    expect(parseEvent('{bad')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resilient SSE transport (Sprint 1: reconnect, resume, idle, auth, rate-limit)
// ---------------------------------------------------------------------------

const INPUT: RunInput = { threadId: 't1', tenantId: 'x', messages: [] };

/** Build one SSE frame string with an optional id. */
function frame(id: number | null, event: Record<string, unknown>): string {
  const idLine = id === null ? '' : `id: ${id}\n`;
  return `${idLine}data: ${JSON.stringify(event)}\n\n`;
}

/** An SSE Response from frame strings; `hang: true` never closes the body. */
function sse(
  frames: string[],
  opts: { status?: number; headers?: Record<string, string>; hang?: boolean } = {},
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const f of frames) controller.enqueue(encoder.encode(f));
      if (!opts.hang) controller.close();
    },
  });
  return new Response(body, { status: opts.status ?? 200, headers: opts.headers });
}

/** A fake `fetch` that returns scripted responses and records each request. */
function mockFetch(handlers: Array<() => Response>) {
  const calls: RequestInit[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const handler = handlers[calls.length - 1] ?? handlers[handlers.length - 1];
    return handler!();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

async function collect(iterable: AsyncIterable<AgUiEvent>): Promise<AgUiEvent[]> {
  const out: AgUiEvent[] = [];
  for await (const e of iterable) out.push(e);
  return out;
}

function contentDeltas(events: AgUiEvent[]): string[] {
  return events.flatMap((e) => (e.type === AgUiEventType.TextMessageContent ? [e.delta] : []));
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe('createSseTransport resilience', () => {
  it('reconnects with backoff after a premature stream close', async () => {
    const m = mockFetch([
      () =>
        sse([
          frame(1, { type: AgUiEventType.RunStarted, runId: 'r1' }),
          frame(2, { type: AgUiEventType.TextMessageStart, messageId: 'a', role: 'assistant' }),
          frame(3, { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'Hi' }),
        ]),
      () =>
        sse([
          frame(4, { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: '!' }),
          frame(5, { type: AgUiEventType.TextMessageEnd, messageId: 'a' }),
          frame(6, { type: AgUiEventType.RunFinished, runId: 'r1' }),
        ]),
    ]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(m.calls.length).toBe(2);
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);
    expect(contentDeltas(events)).toEqual(['Hi', '!']);
  });

  it('resumes with Last-Event-ID and dedupes replayed frames', async () => {
    const first = [
      frame(1, { type: AgUiEventType.RunStarted, runId: 'r1' }),
      frame(2, { type: AgUiEventType.TextMessageStart, messageId: 'a', role: 'assistant' }),
      frame(3, { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'Hel' }),
    ];
    // The backend replays from the start on reconnect; the client must dedupe.
    const replay = [
      ...first,
      frame(4, { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'lo' }),
      frame(5, { type: AgUiEventType.TextMessageEnd, messageId: 'a' }),
      frame(6, { type: AgUiEventType.RunFinished, runId: 'r1' }),
    ];
    const m = mockFetch([() => sse(first), () => sse(replay)]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(contentDeltas(events)).toEqual(['Hel', 'lo']); // no duplicated 'Hel'
    expect(header(m.calls[1], 'last-event-id')).toBe('3');
  });

  it('aborts an idle stream and reconnects', async () => {
    const m = mockFetch([
      () => sse([frame(1, { type: AgUiEventType.RunStarted, runId: 'r1' })], { hang: true }),
      () => sse([frame(2, { type: AgUiEventType.RunFinished, runId: 'r1' })]),
    ]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      idleTimeoutMs: 20,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(m.calls.length).toBe(2);
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);
  });

  it('refreshes credentials on 401 and retries once with the new token', async () => {
    let token = 'old';
    const m = mockFetch([
      () => new Response(null, { status: 401 }),
      () => sse([frame(1, { type: AgUiEventType.RunFinished, runId: 'r1' })]),
    ]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      getAuthToken: () => token,
      onAuthError: () => {
        token = 'new';
      },
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(m.calls.length).toBe(2);
    expect(header(m.calls[0], 'authorization')).toBe('Bearer old');
    expect(header(m.calls[1], 'authorization')).toBe('Bearer new');
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);
  });

  it('fails on 401 when no refresh hook is provided', async () => {
    const m = mockFetch([() => new Response(null, { status: 401 })]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      baseRetryDelayMs: 0,
    });
    await expect(collect(transport.run(INPUT))).rejects.toMatchObject({
      name: 'TransportError',
      status: 401,
    });
    expect(m.calls.length).toBe(1);
  });

  it('honors Retry-After on 429 then retries', async () => {
    const m = mockFetch([
      () => new Response(null, { status: 429, headers: { 'retry-after': '0' } }),
      () => sse([frame(1, { type: AgUiEventType.RunFinished, runId: 'r1' })]),
    ]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      baseRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(m.calls.length).toBe(2);
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);
  });

  it('gives up after maxRetries reconnect attempts', async () => {
    // Every attempt closes prematurely (no terminal event).
    const m = mockFetch([() => sse([frame(1, { type: AgUiEventType.RunStarted, runId: 'r1' })])]);
    const transport = createSseTransport({
      apiUrl: 'http://x',
      fetchImpl: m.fetch,
      maxRetries: 2,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    await expect(collect(transport.run(INPUT))).rejects.toBeInstanceOf(TransportError);
    expect(m.calls.length).toBe(3); // initial attempt + 2 reconnects
  });
});
