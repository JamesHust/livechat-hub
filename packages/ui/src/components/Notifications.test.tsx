import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createChatStore } from '@livechat-hub/core';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import { ChatProvider } from '../context';
import { ChatWindow } from './ChatWindow';
import { Launcher } from './Launcher';
import { NotificationCenter } from './NotificationCenter';
import { SettingsMenu } from './SettingsMenu';

/** A complete streamed assistant turn — settles into one unread reply. */
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

/** A store with one unread reply already recorded (panel was never mounted). */
async function storeWithUnread() {
  const store = createChatStore({
    transport: fakeTransport(OK_RUN),
    tenantId: 't1',
    storage: null,
  });
  await store.getState().sendMessage('hi');
  return store;
}

describe('notification surfaces', () => {
  it('shows the unread badge on the closed launcher after a reply', async () => {
    const store = await storeWithUnread();
    render(
      <ChatProvider store={store}>
        <Launcher open={false} onToggle={() => {}} />
      </ChatProvider>,
    );
    // The count rides in the accessible label and as visible text.
    expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides the badge while the launcher is open (the user is viewing)', async () => {
    const store = await storeWithUnread();
    render(
      <ChatProvider store={store}>
        <Launcher open={true} onToggle={() => {}} />
      </ChatProvider>,
    );
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('suppresses the badge when the host disables it via config', async () => {
    const store = await storeWithUnread();
    render(
      <ChatProvider store={store} notifications={{ badge: false }}>
        <Launcher open={false} onToggle={() => {}} />
      </ChatProvider>,
    );
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('lists notifications and jumps + marks read on click', async () => {
    const store = await storeWithUnread();
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(
      <ChatProvider store={store}>
        <NotificationCenter open onClose={onClose} onJump={onJump} />
      </ChatProvider>,
    );

    // The reply preview is listed in the inbox.
    expect(screen.getByText('Hi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /go to message/i }));
    expect(onJump).toHaveBeenCalledWith(store.getState().activeConversationId, 'a1');
    expect(onClose).toHaveBeenCalled();
    expect(store.getState().notifications[0]?.read).toBe(true);
  });

  it('marks everything read from the notification center', async () => {
    const store = await storeWithUnread();
    render(
      <ChatProvider store={store}>
        <NotificationCenter open onClose={() => {}} onJump={() => {}} />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(store.getState().notifications.every((n) => n.read)).toBe(true);
    expect(Object.keys(store.getState().unread)).toHaveLength(0);
  });

  it('offers the sound toggle in settings by default', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    render(
      <ChatProvider store={store}>
        <SettingsMenu />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('switch', { name: /sound/i })).toBeInTheDocument();
  });

  it('hides the sound toggle when the host disables the channel', () => {
    const store = createChatStore({ transport: fakeTransport([]), tenantId: 't1', storage: null });
    render(
      <ChatProvider store={store} notifications={{ sound: false, desktop: false }}>
        <SettingsMenu />
      </ChatProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.queryByRole('switch', { name: /sound/i })).not.toBeInTheDocument();
  });

  it('does not leave a reply unread while the panel is open and viewed', async () => {
    // `userId` skips the guest welcome gate so the chat renders (i.e. is viewed).
    const store = createChatStore({
      transport: fakeTransport(OK_RUN),
      tenantId: 't1',
      userId: 'u1',
      storage: null,
    });
    render(
      <ChatProvider store={store}>
        <ChatWindow />
      </ChatProvider>,
    );

    // The reply completes while mounted — its unread bump must be auto-cleared
    // (the completion bump doesn't change the message count, so this guards the
    // effect keying on the active thread's unread count).
    await act(async () => {
      await store.getState().sendMessage('hi');
    });
    await waitFor(() => {
      expect(Object.keys(store.getState().unread)).toHaveLength(0);
      expect(store.getState().notifications[0]?.read).toBe(true);
    });
  });
});
