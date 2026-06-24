import { describe, expect, it } from 'vitest';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { createChatStore } from './store';

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

describe('createChatStore', () => {
  it('streams assistant text into a single message and completes', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Hel' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'lo' },
      { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);

    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hi');

    const { messages, run } = store.getState();
    expect(run.status).toBe('completed');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.parts).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('captures tool call lifecycle and result', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.ToolCallStart, messageId: 'a1', toolCallId: 'c1', toolName: 'search' },
      { type: AgUiEventType.ToolCallArgs, toolCallId: 'c1', delta: '{"q":"x"}' },
      { type: AgUiEventType.ToolCallEnd, toolCallId: 'c1' },
      {
        type: AgUiEventType.ToolCallResult,
        messageId: 'a1',
        toolCallId: 'c1',
        result: { ok: true },
      },
    ]);

    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('do it');

    const assistant = store.getState().messages[1]!;
    const call = assistant.parts.find((p) => p.type === 'tool-call');
    expect(call).toMatchObject({ state: 'output-available', args: { q: 'x' } });
    expect(assistant.parts.some((p) => p.type === 'tool-result')).toBe(true);
  });

  it('sends an attachment-only message as parts (no text)', async () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    await store.getState().sendMessage('', [
      { type: 'image', url: 'data:image/png;base64,AAA' },
      { type: 'audio', url: 'blob:clip', durationMs: 1200 },
    ]);

    const user = store.getState().messages[0]!;
    expect(user.role).toBe('user');
    expect(user.parts).toEqual([
      { type: 'image', url: 'data:image/png;base64,AAA' },
      { type: 'audio', url: 'blob:clip', durationMs: 1200 },
    ]);
  });

  it('records a trimmed guest name on the session and ignores blanks', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    store.getState().setGuestName('  Ada  ');
    expect(store.getState().session.guestName).toBe('Ada');
    store.getState().setGuestName('   ');
    expect(store.getState().session.guestName).toBe('Ada');
  });

  it('records run errors', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.RunError, message: 'boom', code: 'E_FAIL' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hi');
    expect(store.getState().run.status).toBe('failed');
    expect(store.getState().run.error?.message).toBe('boom');
  });
});
