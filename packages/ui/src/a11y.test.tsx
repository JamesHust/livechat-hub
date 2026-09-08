import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createChatStore } from '@livechat-hub/core';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { ChatProvider } from './context';
import { ChatWindow } from './components/ChatWindow';

const OK_RUN: AgUiEvent[] = [
  { type: AgUiEventType.RunStarted, runId: 'r1' },
  { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
  { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Hello there' },
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

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // jsdom can't lay out / compute real colors, so contrast and landmark-region
      // checks aren't meaningful here (covered by the real-browser e2e instead).
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe('a11y (axe-core)', () => {
  it('the chat window empty state has no detectable violations', async () => {
    // `userId` skips the guest welcome gate so the full chat chrome renders.
    const store = createChatStore({
      transport: fakeTransport([]),
      tenantId: 't1',
      userId: 'u1',
      storage: null,
    });
    const { container } = render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );
    await expectNoViolations(container);
  });

  it('the welcome screen has no detectable violations', async () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    const { container } = render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );
    await expectNoViolations(container);
  });

  it('a conversation with a streamed reply has no detectable violations', async () => {
    const store = createChatStore({
      transport: fakeTransport(OK_RUN),
      tenantId: 't1',
      userId: 'u1',
      storage: null,
    });
    await store.getState().sendMessage('hi');
    const { container } = render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );
    await expectNoViolations(container);
  });
});
