import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { createChatStore, type ChatStore } from '@livechat-hub/core';
import type { StoreApi } from 'zustand/vanilla';
import { ChatProvider } from '../context';
import { Header } from './Header';
import { HandoffBanner } from './HandoffBanner';
import { CsatPrompt } from './CsatPrompt';

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

/** Seed the shared agent state by streaming a STATE_SNAPSHOT, then a completed run. */
async function storeWithAgentState(
  snapshot: Record<string, unknown>,
): Promise<StoreApi<ChatStore>> {
  const store = createChatStore({
    transport: fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      { type: AgUiEventType.StateSnapshot, snapshot },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]),
    tenantId: 't1',
    storage: null,
  });
  await store.getState().sendMessage('hi');
  return store;
}

describe('Header presence', () => {
  it('reflects backend-driven presence from the shared agent state', async () => {
    const store = await storeWithAgentState({ presence: 'away' });
    render(
      <ChatProvider store={store}>
        <Header />
      </ChatProvider>,
    );
    expect(screen.getByText(/away/i)).toBeInTheDocument();
  });

  it('adopts the human agent name once handed off', async () => {
    const store = await storeWithAgentState({
      handoff: { status: 'connected', agentName: 'Mai' },
    });
    render(
      <ChatProvider store={store}>
        <Header />
      </ChatProvider>,
    );
    expect(screen.getByText('Mai')).toBeInTheDocument();
  });
});

describe('HandoffBanner', () => {
  it('announces a connected human agent', async () => {
    const store = await storeWithAgentState({
      handoff: { status: 'connected', agentName: 'Mai' },
    });
    render(
      <ChatProvider store={store}>
        <HandoffBanner />
      </ChatProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/chatting with Mai/i);
  });

  it('renders nothing without a handoff', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    render(
      <ChatProvider store={store}>
        <HandoffBanner />
      </ChatProvider>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('CsatPrompt', () => {
  it('collects a star rating and shows a thank-you on submit', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    store.getState().requestCsat();
    render(
      <ChatProvider store={store}>
        <CsatPrompt />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /rate 4/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(store.getState().csat).toMatchObject({ status: 'submitted', result: { rating: 4 } });
    expect(screen.getByText(/thanks for your feedback/i)).toBeInTheDocument();
  });
});
