import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createChatStore } from '@livechat-hub/core';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { ChatProvider } from './context';
import { ChatWindow } from './components/ChatWindow';

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

describe('ChatWindow', () => {
  it('renders empty state and streams an assistant reply on send', async () => {
    const transport = fakeTransport([
      { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'Hi there' },
      { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);
    const store = createChatStore({ transport, tenantId: 't1', storage: null });

    render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );

    // Guest onboarding: enter a name on the welcome screen first.
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start chatting/i }));

    expect(screen.getByText(/Start the conversation/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText('Hi there')).toBeInTheDocument());
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('inserts a picked emoji into the composer at the caret', async () => {
    const store = createChatStore({
      transport: fakeTransport([]),
      tenantId: 't1',
      storage: null,
    });

    render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );

    // Skip the guest welcome screen.
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start chatting/i }));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hi' } });

    // Open the emoji tray and pick a glyph — it appends at the caret.
    fireEvent.click(screen.getByRole('button', { name: /emoji/i }));
    fireEvent.click(await screen.findByRole('button', { name: '😀' }));

    await waitFor(() => expect(input).toHaveValue('hi😀'));
  });

  it('switches theme from the settings menu and toggles fullscreen', () => {
    const store = createChatStore({
      transport: fakeTransport([]),
      tenantId: 't1',
      storage: null,
    });

    render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );

    // Skip the guest welcome screen.
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start chatting/i }));

    // Open settings and switch to the dark scheme — applied to the themed root.
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }));
    expect(document.documentElement.dataset.lchColorScheme).toBe('dark');

    // Fullscreen toggle flips the control's label.
    fireEvent.click(screen.getByRole('button', { name: /^full screen$/i }));
    expect(screen.getByRole('button', { name: /exit full screen/i })).toBeInTheDocument();
  });
});
