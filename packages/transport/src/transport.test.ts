import { describe, expect, it } from 'vitest';
import { parseSseStream } from './sse';
import { parseEvent, validateEvent } from './validate';
import { AgUiEventType } from './events';

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
    const out: string[] = [];
    for await (const d of parseSseStream(stream)) out.push(d);
    expect(out).toEqual(['{"a":1}', 'hello']);
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
