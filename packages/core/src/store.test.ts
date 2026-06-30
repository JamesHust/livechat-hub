import { describe, expect, it } from 'vitest';
import {
  AgUiEventType,
  type AgUiEvent,
  type RunInput,
  type Transport,
} from '@livechat-hub/transport';
import { createChatStore } from './store';

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

/** Transport that replays one event list per successive run and records inputs. */
function scriptedTransport(runs: AgUiEvent[][]): { transport: Transport; inputs: RunInput[] } {
  const inputs: RunInput[] = [];
  let i = 0;
  return {
    inputs,
    transport: {
      async *run(input) {
        inputs.push(input);
        for (const e of runs[i++] ?? []) yield e;
      },
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

  it('executes a frontend tool call and continues the run with its result', async () => {
    const { transport, inputs } = scriptedTransport([
      // Round 1: the agent calls a frontend tool and finishes without a result.
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        {
          type: AgUiEventType.ToolCallStart,
          messageId: 'a1',
          toolCallId: 'c1',
          toolName: 'navigate',
        },
        { type: AgUiEventType.ToolCallArgs, toolCallId: 'c1', delta: '{"path":"/pricing"}' },
        { type: AgUiEventType.ToolCallEnd, toolCallId: 'c1' },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
      // Round 2: the agent acknowledges the result.
      [
        { type: AgUiEventType.RunStarted, runId: 'r2' },
        { type: AgUiEventType.TextMessageStart, messageId: 'a2', role: 'assistant' },
        { type: AgUiEventType.TextMessageContent, messageId: 'a2', delta: 'Done.' },
        { type: AgUiEventType.TextMessageEnd, messageId: 'a2' },
        { type: AgUiEventType.RunFinished, runId: 'r2' },
      ],
    ]);

    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    const calls: unknown[] = [];
    store.getState().registerAction({
      name: 'navigate',
      description: 'Navigate the host page',
      handler: (args) => {
        calls.push(args);
        return { ok: true };
      },
    });

    await store.getState().sendMessage('take me to pricing');

    // Handler ran once with the parsed arguments.
    expect(calls).toEqual([{ path: '/pricing' }]);

    // Two backend runs happened; the first advertised the tool, the second
    // carried the executed result back to the agent.
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.tools?.map((t) => t.name)).toContain('navigate');
    const forwardedResult = inputs[1]!.messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'tool-result');
    expect(forwardedResult).toMatchObject({ toolCallId: 'c1', result: { ok: true } });

    // Final state: the call is resolved and the acknowledgement is present.
    const { messages, run } = store.getState();
    expect(run.status).toBe('completed');
    const a1 = messages.find((m) => m.id === 'a1')!;
    expect(a1.parts.some((p) => p.type === 'tool-call' && p.state === 'output-available')).toBe(
      true,
    );
    expect(a1.parts.some((p) => p.type === 'tool-result')).toBe(true);
    expect(messages.some((m) => m.id === 'a2')).toBe(true);
  });

  it('does not loop on tool calls that are not registered frontend actions', async () => {
    const { transport, inputs } = scriptedTransport([
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        {
          type: AgUiEventType.ToolCallStart,
          messageId: 'a1',
          toolCallId: 'c1',
          toolName: 'backend_search',
        },
        { type: AgUiEventType.ToolCallArgs, toolCallId: 'c1', delta: '{"q":"x"}' },
        { type: AgUiEventType.ToolCallEnd, toolCallId: 'c1' },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
    ]);

    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('search');

    // No registered action matches → no follow-up run.
    expect(inputs).toHaveLength(1);
    expect(store.getState().run.status).toBe('completed');
  });

  it('forwards registered context to the backend on every run', async () => {
    const { transport, inputs } = scriptedTransport([
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    store.getState().registerContext({ description: 'route', get: () => '/home' });
    await store.getState().sendMessage('hi');
    expect(inputs[0]!.context).toEqual([{ description: 'route', value: '/home' }]);
  });

  it('pauses on an interrupt outcome and resumes with the resolution', async () => {
    const { transport, inputs } = scriptedTransport([
      // Run 1: the agent asks for approval and pauses.
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
        { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Need approval' },
        { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
        {
          type: AgUiEventType.RunFinished,
          runId: 'r1',
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'i1', kind: 'approval', message: 'Allow delete?' }],
          },
        },
      ],
      // Run 2: resumed with the user's answer.
      [
        { type: AgUiEventType.RunStarted, runId: 'r2' },
        { type: AgUiEventType.TextMessageStart, messageId: 'a2', role: 'assistant' },
        { type: AgUiEventType.TextMessageContent, messageId: 'a2', delta: 'Done.' },
        { type: AgUiEventType.TextMessageEnd, messageId: 'a2' },
        { type: AgUiEventType.RunFinished, runId: 'r2' },
      ],
    ]);

    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('delete the file');

    // Paused, exposing the open interrupt; no second run yet.
    expect(store.getState().run.status).toBe('interrupted');
    expect(store.getState().run.interrupts).toEqual([
      { id: 'i1', kind: 'approval', message: 'Allow delete?' },
    ]);
    expect(inputs).toHaveLength(1);

    await store.getState().resume([{ id: 'i1', value: { approved: true } }]);

    // The resumed run carried the resolution and the turn completed.
    expect(inputs).toHaveLength(2);
    expect(inputs[1]!.resume).toEqual([{ id: 'i1', value: { approved: true } }]);
    const { run, messages } = store.getState();
    expect(run.status).toBe('completed');
    expect(run.interrupts).toBeUndefined();
    expect(messages.some((m) => m.id === 'a2')).toBe(true);
  });

  it('ignores resume when no run is interrupted', async () => {
    const { transport, inputs } = scriptedTransport([
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().resume([{ id: 'x', value: 1 }]);
    expect(inputs).toHaveLength(0);
    expect(store.getState().run.status).toBe('idle');
  });

  it('syncs shared agent state both ways and forwards it on the next run', async () => {
    const { transport, inputs } = scriptedTransport([
      // Run 1: the agent publishes a state snapshot.
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        { type: AgUiEventType.StateSnapshot, snapshot: { count: 1 } },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
      [
        { type: AgUiEventType.RunStarted, runId: 'r2' },
        { type: AgUiEventType.RunFinished, runId: 'r2' },
      ],
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });

    // Empty state isn't forwarded; the agent's snapshot lands in agentState.
    await store.getState().sendMessage('hi');
    expect(inputs[0]!.state).toBeUndefined();
    expect(store.getState().agentState).toEqual({ count: 1 });

    // A frontend write merges and rides along on the next run.
    store.getState().setAgentState((prev) => ({ ...prev, theme: 'dark' }));
    expect(store.getState().agentState).toEqual({ count: 1, theme: 'dark' });

    await store.getState().sendMessage('again');
    expect(inputs[1]!.state).toEqual({ count: 1, theme: 'dark' });
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
