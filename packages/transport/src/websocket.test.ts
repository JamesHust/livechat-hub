import { describe, expect, it } from 'vitest';
import { AgUiEventType, type AgUiEvent } from './events';
import { TransportError, type RunInput } from './transport';
import {
  createWebSocketTransport,
  parseWsFrame,
  type WebSocketFactory,
  type WebSocketLike,
  type WsEvent,
} from './websocket';

const INPUT: RunInput = { threadId: 't1', tenantId: 'x', messages: [] };

// ---------------------------------------------------------------------------
// parseWsFrame — pure frame parsing
// ---------------------------------------------------------------------------

describe('parseWsFrame', () => {
  it('parses an event envelope with resume id + run key', () => {
    const frame = parseWsFrame(
      JSON.stringify({
        type: 'event',
        runKey: 'k1',
        id: '7',
        event: { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'hi' },
      }),
    );
    expect(frame).toEqual({
      kind: 'event',
      id: '7',
      runKey: 'k1',
      event: { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'hi' },
    });
  });

  it('parses a bare AG-UI event (single-run backend)', () => {
    const frame = parseWsFrame(JSON.stringify({ type: AgUiEventType.RunFinished, runId: 'r1' }));
    expect(frame).toEqual({
      kind: 'event',
      event: { type: AgUiEventType.RunFinished, runId: 'r1' },
    });
  });

  it('recognizes ping/pong keepalives', () => {
    expect(parseWsFrame('{"type":"pong"}')).toEqual({ kind: 'pong' });
    expect(parseWsFrame('{"type":"ping"}')).toEqual({ kind: 'pong' });
  });

  it('returns null for malformed JSON, non-strings, and invalid events', () => {
    expect(parseWsFrame('{bad')).toBeNull();
    expect(parseWsFrame(42)).toBeNull();
    expect(parseWsFrame(JSON.stringify({ type: 'event', event: { type: 'NOPE' } }))).toBeNull();
    expect(parseWsFrame(JSON.stringify({ type: 'NOPE' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scriptable fake socket
// ---------------------------------------------------------------------------

type WsListener = (event: WsEvent) => void;

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, WsListener[]> = { open: [], message: [], error: [], close: [] };

  constructor(public url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: WsListener): void {
    this.listeners[type]!.push(listener);
  }
  removeEventListener(type: 'open' | 'message' | 'error' | 'close', listener: WsListener): void {
    this.listeners[type] = this.listeners[type]!.filter((l) => l !== listener);
  }

  // -- test drivers --
  emitOpen(): void {
    this.readyState = 1;
    this.listeners.open!.slice().forEach((l) => l({}));
  }
  emit(event: unknown, envelope?: { id?: string; runKey?: string }): void {
    const data = envelope
      ? JSON.stringify({ type: 'event', ...envelope, event })
      : JSON.stringify(event);
    this.listeners.message!.slice().forEach((l) => l({ data }));
  }
  emitClose(): void {
    this.readyState = 3;
    this.listeners.close!.slice().forEach((l) => l({}));
  }
  emitError(): void {
    this.listeners.error!.slice().forEach((l) => l({}));
  }
}

/** A factory that hands out fake sockets and drives each with a scripted callback. */
function fakeWs(scripts: Array<(socket: FakeSocket) => void>) {
  const sockets: FakeSocket[] = [];
  const factory: WebSocketFactory = (url) => {
    const socket = new FakeSocket(url);
    const index = sockets.length;
    sockets.push(socket);
    // Listeners attach synchronously right after the factory returns, so a
    // microtask is enough to safely start driving this socket.
    queueMicrotask(() => scripts[Math.min(index, scripts.length - 1)]?.(socket));
    return socket;
  };
  return { factory, sockets };
}

async function collect(iterable: AsyncIterable<AgUiEvent>): Promise<AgUiEvent[]> {
  const out: AgUiEvent[] = [];
  for await (const e of iterable) out.push(e);
  return out;
}

const deltas = (events: AgUiEvent[]) =>
  events.flatMap((e) => (e.type === AgUiEventType.TextMessageContent ? [e.delta] : []));

// ---------------------------------------------------------------------------
// createWebSocketTransport — streaming, resume, resilience
// ---------------------------------------------------------------------------

describe('createWebSocketTransport', () => {
  it('sends the run frame on open and streams events to completion', async () => {
    const { factory, sockets } = fakeWs([
      (s) => {
        s.emitOpen();
        s.emit({ type: AgUiEventType.RunStarted, runId: 'r1' });
        s.emit({ type: AgUiEventType.TextMessageStart, messageId: 'a', role: 'assistant' });
        s.emit({ type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'Hi' });
        s.emit({ type: AgUiEventType.TextMessageEnd, messageId: 'a' });
        s.emit({ type: AgUiEventType.RunFinished, runId: 'r1' });
      },
    ]);
    const transport = createWebSocketTransport({ url: 'http://x', socketFactory: factory });

    const events = await collect(transport.run(INPUT));
    expect(deltas(events)).toEqual(['Hi']);
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);

    const runFrame = JSON.parse(sockets[0]!.sent[0]!);
    expect(runFrame).toMatchObject({ type: 'run', payload: INPUT });
    expect(typeof runFrame.runKey).toBe('string');
    // `http://` was upgraded to `ws://`.
    expect(sockets[0]!.url.startsWith('ws://')).toBe(true);
  });

  it('reconnects and resumes with lastEventId, deduping replayed frames', async () => {
    const { factory, sockets } = fakeWs([
      // First socket drops before a terminal event, after id "3".
      (s) => {
        s.emitOpen();
        s.emit({ type: AgUiEventType.RunStarted, runId: 'r1' }, { id: '1' });
        s.emit(
          { type: AgUiEventType.TextMessageStart, messageId: 'a', role: 'assistant' },
          { id: '2' },
        );
        s.emit(
          { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'Hel' },
          { id: '3' },
        );
        s.emitClose();
      },
      // Second socket replays from the start (client must dedupe 1–3).
      (s) => {
        s.emitOpen();
        s.emit({ type: AgUiEventType.RunStarted, runId: 'r1' }, { id: '1' });
        s.emit(
          { type: AgUiEventType.TextMessageStart, messageId: 'a', role: 'assistant' },
          { id: '2' },
        );
        s.emit(
          { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'Hel' },
          { id: '3' },
        );
        s.emit(
          { type: AgUiEventType.TextMessageContent, messageId: 'a', delta: 'lo' },
          { id: '4' },
        );
        s.emit({ type: AgUiEventType.RunFinished, runId: 'r1' }, { id: '5' });
      },
    ]);
    const transport = createWebSocketTransport({
      url: 'ws://x',
      socketFactory: factory,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(deltas(events)).toEqual(['Hel', 'lo']); // no duplicated 'Hel'
    expect(sockets.length).toBe(2);
    const resumeFrame = JSON.parse(sockets[1]!.sent[0]!);
    expect(resumeFrame.lastEventId).toBe('3');
  });

  it('reconnects after an idle socket', async () => {
    const { factory, sockets } = fakeWs([
      // Opens but sends nothing — the idle watchdog must fire.
      (s) => s.emitOpen(),
      (s) => {
        s.emitOpen();
        s.emit({ type: AgUiEventType.RunFinished, runId: 'r1' });
      },
    ]);
    const transport = createWebSocketTransport({
      url: 'ws://x',
      socketFactory: factory,
      idleTimeoutMs: 20,
      pingIntervalMs: 0,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    const events = await collect(transport.run(INPUT));
    expect(sockets.length).toBe(2);
    expect(events.some((e) => e.type === AgUiEventType.RunFinished)).toBe(true);
  });

  it('throws on abort', async () => {
    const controller = new AbortController();
    const { factory } = fakeWs([
      (s) => {
        s.emitOpen();
        s.emit({ type: AgUiEventType.RunStarted, runId: 'r1' });
        controller.abort();
      },
    ]);
    const transport = createWebSocketTransport({ url: 'ws://x', socketFactory: factory });

    await expect(
      collect(transport.run(INPUT, { signal: controller.signal })),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('gives up after maxRetries premature drops', async () => {
    const { factory, sockets } = fakeWs([
      (s) => {
        s.emitOpen();
        s.emitClose();
      },
    ]);
    const transport = createWebSocketTransport({
      url: 'ws://x',
      socketFactory: factory,
      maxRetries: 2,
      baseRetryDelayMs: 0,
      maxRetryDelayMs: 0,
    });

    await expect(collect(transport.run(INPUT))).rejects.toBeInstanceOf(TransportError);
    expect(sockets.length).toBe(3); // initial attempt + 2 reconnects
  });
});
