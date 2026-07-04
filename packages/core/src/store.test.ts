import { describe, expect, it } from 'vitest';
import {
  AgUiEventType,
  type AgUiEvent,
  type RunInput,
  type Transport,
} from '@livechat-hub/transport';
import { createChatStore } from './store';
import { memoryStorage } from './persistence';

/** A complete, streamed assistant turn used across the send-status tests. */
const OK_RUN: AgUiEvent[] = [
  { type: AgUiEventType.RunStarted, runId: 'r1' },
  { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
  { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Hi' },
  { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
  { type: AgUiEventType.RunFinished, runId: 'r1' },
];

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

/** Let queued microtasks/timers drain (streaming a scripted run is async). */
const flush = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A frontend tool call the agent hands to the browser, then acknowledges. */
const CALL_THEN_ACK = (toolName: string): AgUiEvent[][] => [
  [
    { type: AgUiEventType.RunStarted, runId: 'r1' },
    { type: AgUiEventType.ToolCallStart, messageId: 'a1', toolCallId: 'c1', toolName },
    { type: AgUiEventType.ToolCallArgs, toolCallId: 'c1', delta: '{"path":"/demo/report.pdf"}' },
    { type: AgUiEventType.ToolCallEnd, toolCallId: 'c1' },
    { type: AgUiEventType.RunFinished, runId: 'r1' },
  ],
  [
    { type: AgUiEventType.RunStarted, runId: 'r2' },
    { type: AgUiEventType.TextMessageStart, messageId: 'a2', role: 'assistant' },
    { type: AgUiEventType.TextMessageContent, messageId: 'a2', delta: 'Done.' },
    { type: AgUiEventType.TextMessageEnd, messageId: 'a2' },
    { type: AgUiEventType.RunFinished, runId: 'r2' },
  ],
];

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
    // TEXT_MESSAGE_END sealed the streamed block (`state: 'done'`).
    expect(messages[1]?.parts).toEqual([{ type: 'text', text: 'Hello', state: 'done' }]);
  });

  it('starts a fresh text block after an END seals the previous one', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'One' },
      { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Two' },
      { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hi');

    // Sealing prevents the second delta from merging into the first block.
    expect(store.getState().messages[1]?.parts).toEqual([
      { type: 'text', text: 'One', state: 'done' },
      { type: 'text', text: 'Two', state: 'done' },
    ]);
  });

  it('seals a reasoning block on REASONING_END', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.ReasoningStart, messageId: 'a1' },
      { type: AgUiEventType.ReasoningContent, messageId: 'a1', delta: 'thinking' },
      { type: AgUiEventType.ReasoningEnd, messageId: 'a1' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hi');
    expect(store.getState().messages[1]?.parts).toEqual([
      { type: 'reasoning', text: 'thinking', state: 'done' },
    ]);
  });

  it('keeps ARTIFACT_UPDATE payloads in state keyed by id', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      { type: AgUiEventType.ArtifactUpdate, artifactId: 'doc1', kind: 'markdown', payload: '# v1' },
      { type: AgUiEventType.ArtifactUpdate, artifactId: 'doc1', kind: 'markdown', payload: '# v2' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('make a doc');

    const artifact = store.getState().artifacts['doc1'];
    expect(artifact).toMatchObject({ id: 'doc1', kind: 'markdown', payload: '# v2' });
  });

  it('errors an orphaned tool call when the run ends without a result', async () => {
    // Backend tool: START + ARGS + END, then the run finishes with no RESULT.
    const transport = fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      {
        type: AgUiEventType.ToolCallStart,
        messageId: 'a1',
        toolCallId: 'c1',
        toolName: 'db_query',
      },
      { type: AgUiEventType.ToolCallArgs, toolCallId: 'c1', delta: '{"sql":"SELECT 1"}' },
      { type: AgUiEventType.ToolCallEnd, toolCallId: 'c1' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('query');

    const call = store.getState().messages[1]?.parts.find((p) => p.type === 'tool-call');
    expect(call).toMatchObject({ toolCallId: 'c1', state: 'error' });
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

  it('gates a confirm-required frontend action until the user approves', async () => {
    const { transport, inputs } = scriptedTransport(CALL_THEN_ACK('delete_file'));
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    const calls: unknown[] = [];
    store.getState().registerAction({
      name: 'delete_file',
      description: 'Delete a file on the page',
      requireConfirmation: true,
      handler: (args) => {
        calls.push(args);
        return { ok: true };
      },
    });

    const done = store.getState().sendMessage('delete the file');
    await flush();

    // Paused on the approval gate — the handler has NOT run, no follow-up yet.
    expect(store.getState().actionConfirmations).toEqual([
      { toolCallId: 'c1', toolName: 'delete_file', args: { path: '/demo/report.pdf' } },
    ]);
    expect(calls).toHaveLength(0);
    expect(inputs).toHaveLength(1);

    store.getState().confirmAction('c1', true);
    await done;

    // Approved: the handler ran and the result was carried back to the agent.
    expect(calls).toEqual([{ path: '/demo/report.pdf' }]);
    expect(store.getState().actionConfirmations).toHaveLength(0);
    expect(inputs).toHaveLength(2);
    const forwarded = inputs[1]!.messages.flatMap((m) => m.parts).find((p) => p.type === 'tool-result');
    expect(forwarded).toMatchObject({ toolCallId: 'c1', result: { ok: true } });
    expect(store.getState().run.status).toBe('completed');
  });

  it('declines a confirm-required action and returns a declined result without running it', async () => {
    const { transport, inputs } = scriptedTransport(CALL_THEN_ACK('delete_file'));
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    const calls: unknown[] = [];
    store.getState().registerAction({
      name: 'delete_file',
      description: 'Delete a file on the page',
      requireConfirmation: true,
      handler: (args) => {
        calls.push(args);
        return { ok: true };
      },
    });

    const done = store.getState().sendMessage('delete the file');
    await flush();
    store.getState().confirmAction('c1', false);
    await done;

    // Rejected: the handler never ran, but the agent still learns it was declined.
    expect(calls).toHaveLength(0);
    expect(store.getState().actionConfirmations).toHaveLength(0);
    const forwarded = inputs[1]!.messages.flatMap((m) => m.parts).find((p) => p.type === 'tool-result');
    expect(forwarded).toMatchObject({ toolCallId: 'c1', result: { declined: true } });
    expect(store.getState().run.status).toBe('completed');
  });

  it('auto-denies a confirmation that goes unanswered past its timeout', async () => {
    const { transport, inputs } = scriptedTransport(CALL_THEN_ACK('delete_file'));
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    const calls: unknown[] = [];
    store.getState().registerAction({
      name: 'delete_file',
      description: 'Delete a file on the page',
      requireConfirmation: true,
      confirmationTimeoutMs: 20,
      handler: (args) => {
        calls.push(args);
        return { ok: true };
      },
    });

    // Never answer: the timeout auto-denies and the turn continues on its own.
    await store.getState().sendMessage('delete the file');

    expect(calls).toHaveLength(0);
    expect(store.getState().actionConfirmations).toHaveLength(0);
    const forwarded = inputs[1]!.messages.flatMap((m) => m.parts).find((p) => p.type === 'tool-result');
    expect(forwarded).toMatchObject({ toolCallId: 'c1', result: { declined: true } });
  });

  it('exposes registered frontend tool names in state', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    const unregister = store.getState().registerAction({
      name: 'set_page_background',
      description: 'Change the page background',
      handler: () => ({ ok: true }),
    });
    expect(store.getState().frontendTools).toContain('set_page_background');
    unregister();
    expect(store.getState().frontendTools).not.toContain('set_page_background');
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

  it('stamps createdAt and marks a delivered message sent', async () => {
    const store = createChatStore({
      transport: fakeTransport(OK_RUN),
      tenantId: 't1',
      storage: null,
    });
    await store.getState().sendMessage('hi');

    const [user, assistant] = store.getState().messages;
    expect(typeof user?.metadata?.createdAt).toBe('number');
    expect(typeof assistant?.metadata?.createdAt).toBe('number');
    // RUN_STARTED reached the backend → the user message is delivered.
    expect(user?.metadata?.status).toBe('sent');
  });

  it('marks a message failed when the run never reaches the backend, and resends it', async () => {
    // First attempt throws before any event (offline); the second succeeds.
    let attempt = 0;
    const transport: Transport = {
      async *run() {
        if (attempt++ === 0) throw new Error('network down');
        for (const e of OK_RUN) yield e;
      },
    };
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hello');

    const userId = store.getState().messages[0]!.id;
    expect(store.getState().messages[0]?.metadata?.status).toBe('failed');
    expect(store.getState().run.status).toBe('failed');

    await store.getState().retryMessage(userId);
    expect(store.getState().messages[0]?.metadata?.status).toBe('sent');
    expect(store.getState().run.status).toBe('completed');
  });

  it('regenerate drops the last answer and re-runs from the last user message', async () => {
    const { transport } = scriptedTransport([
      [
        { type: AgUiEventType.RunStarted, runId: 'r1' },
        { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
        { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'First' },
        { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
        { type: AgUiEventType.RunFinished, runId: 'r1' },
      ],
      [
        { type: AgUiEventType.RunStarted, runId: 'r2' },
        { type: AgUiEventType.TextMessageStart, messageId: 'a2', role: 'assistant' },
        { type: AgUiEventType.TextMessageContent, messageId: 'a2', delta: 'Second' },
        { type: AgUiEventType.TextMessageEnd, messageId: 'a2' },
        { type: AgUiEventType.RunFinished, runId: 'r2' },
      ],
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });
    await store.getState().sendMessage('hi');
    expect(store.getState().messages[1]?.id).toBe('a1');

    await store.getState().regenerate();
    const { messages } = store.getState();
    // Old answer (a1) is gone, replaced by the regenerated one (a2).
    expect(messages).toHaveLength(2);
    expect(messages[1]?.id).toBe('a2');
    expect(messages.some((m) => m.id === 'a1')).toBe(false);
  });

  it('toggles assistant feedback on the message metadata', async () => {
    const store = createChatStore({
      transport: fakeTransport(OK_RUN),
      tenantId: 't1',
      storage: null,
    });
    await store.getState().sendMessage('hi');

    store.getState().setFeedback('a1', 'up');
    expect(store.getState().messages.find((m) => m.id === 'a1')?.metadata?.feedback).toBe('up');
    // Clicking the active rating clears it.
    store.getState().setFeedback('a1', 'up');
    expect(
      store.getState().messages.find((m) => m.id === 'a1')?.metadata?.feedback,
    ).toBeUndefined();
    // Switching to the other rating replaces it.
    store.getState().setFeedback('a1', 'down');
    expect(store.getState().messages.find((m) => m.id === 'a1')?.metadata?.feedback).toBe('down');
  });

  it('persists the composer draft across store instances via the storage adapter', () => {
    const storage = memoryStorage();
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage });
    store.getState().saveDraft('half-typed message');
    expect(store.getState().loadDraft()).toBe('half-typed message');

    // A fresh store (reload) rehydrates the draft from the same storage.
    const reopened = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage });
    expect(reopened.getState().loadDraft()).toBe('half-typed message');

    reopened.getState().saveDraft('');
    expect(reopened.getState().loadDraft()).toBe('');
  });
});

describe('multi-thread conversations', () => {
  const hasText = (store: ReturnType<typeof createChatStore>, text: string) =>
    store.getState().messages.some((m) => m.parts.some((p) => p.type === 'text' && p.text === text));

  it('starts with a single active conversation', () => {
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage: null });
    expect(store.getState().conversations).toHaveLength(1);
    expect(store.getState().activeConversationId).toBe(store.getState().conversations[0]!.id);
  });

  it('creates, switches, and isolates per-thread history; auto-titles from the first message', async () => {
    const storage = memoryStorage();
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage });
    await flush();
    const firstId = store.getState().activeConversationId;

    await store.getState().sendMessage('hello one');
    await flush();
    expect(hasText(store, 'hello one')).toBe(true);
    // The thread auto-titles from the first user message.
    expect(store.getState().conversations.find((c) => c.id === firstId)?.title).toBe('hello one');

    // A new conversation is blank and becomes active; the list grows.
    store.getState().newConversation();
    const secondId = store.getState().activeConversationId;
    expect(secondId).not.toBe(firstId);
    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().conversations).toHaveLength(2);

    // Starting a new one while already blank is a no-op (no empty-thread spam).
    store.getState().newConversation();
    expect(store.getState().conversations).toHaveLength(2);

    await store.getState().sendMessage('hello two');
    await flush();
    expect(hasText(store, 'hello two')).toBe(true);
    expect(hasText(store, 'hello one')).toBe(false);

    // Switching back loads the first thread's own history.
    store.getState().switchConversation(firstId);
    await flush();
    expect(store.getState().activeConversationId).toBe(firstId);
    expect(hasText(store, 'hello one')).toBe(true);
    expect(hasText(store, 'hello two')).toBe(false);
  });

  it('restores conversations, the active thread, and its history on reload', async () => {
    const storage = memoryStorage();
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage });
    await flush();
    await store.getState().sendMessage('remember me');
    await flush();
    store.getState().newConversation();
    const secondId = store.getState().activeConversationId;
    await store.getState().sendMessage('and me too');
    await flush();

    // A fresh store (reload) over the same storage rehydrates everything.
    const reopened = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage });
    await flush();
    expect(reopened.getState().conversations).toHaveLength(2);
    expect(reopened.getState().activeConversationId).toBe(secondId);
    expect(hasText(reopened, 'and me too')).toBe(true);
  });

  it('deletes a conversation and falls back to a remaining thread', async () => {
    const storage = memoryStorage();
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage });
    await flush();
    const firstId = store.getState().activeConversationId;
    await store.getState().sendMessage('keep me');
    await flush();
    store.getState().newConversation();
    const secondId = store.getState().activeConversationId;

    // Deleting the active (second) thread falls back to the first, loading it.
    store.getState().deleteConversation(secondId);
    await flush();
    expect(store.getState().conversations.some((c) => c.id === secondId)).toBe(false);
    expect(store.getState().activeConversationId).toBe(firstId);
    expect(hasText(store, 'keep me')).toBe(true);

    // Deleting the last thread leaves a fresh empty conversation, never zero.
    store.getState().deleteConversation(firstId);
    await flush();
    expect(store.getState().conversations).toHaveLength(1);
    expect(store.getState().messages).toHaveLength(0);
  });

  it('titles from the first user message and previews the latest message', async () => {
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage: null });
    const id = store.getState().activeConversationId;
    await store.getState().sendMessage('hello there');
    const summary = store.getState().conversations.find((c) => c.id === id)!;
    expect(summary.title).toBe('hello there');
    // OK_RUN's assistant reply is "Hi" — the preview tracks the newest message.
    expect(summary.preview).toBe('Hi');
  });

  it('keeps a renamed title even as new messages arrive', async () => {
    const store = createChatStore({ transport: fakeTransport(OK_RUN), tenantId: 't1', storage: null });
    const id = store.getState().activeConversationId;
    store.getState().renameConversation(id, 'My pinned title');
    await store.getState().sendMessage('this would auto-title otherwise');
    expect(store.getState().conversations.find((c) => c.id === id)?.title).toBe('My pinned title');
  });
});
