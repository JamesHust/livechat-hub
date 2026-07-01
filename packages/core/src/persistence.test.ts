import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_STORAGE_PREFIX,
  PERSISTENCE_SCHEMA_VERSION,
  type UIMessage,
} from '@livechat-hub/shared';
import { AgUiEventType, type AgUiEvent, type Transport } from '@livechat-hub/transport';
import {
  LocalStorageMessageBackend,
  memoryStorage,
  migrateMessages,
  type MessageBackend,
  type PersistDelta,
} from './persistence';
import { createChatStore } from './store';

const msg = (id: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: `#${id}` }],
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fakeTransport(events: AgUiEvent[]): Transport {
  return {
    async *run() {
      for (const e of events) yield e;
    },
  };
}

/** A MessageBackend that serves a fixed history and records every persist. */
function recordingBackend(initial: UIMessage[]): {
  backend: MessageBackend;
  deltas: PersistDelta[];
} {
  const deltas: PersistDelta[] = [];
  return {
    deltas,
    backend: {
      load: async () => initial,
      persist: async (delta) => void deltas.push(delta),
      clear: async () => {},
    },
  };
}

describe('migrateMessages', () => {
  it('upgrades from the legacy (version 0) format without data loss', () => {
    const messages: UIMessage[] = [
      { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'x', state: 'done' }] },
    ];
    expect(migrateMessages(messages, 0)).toEqual(messages);
  });
});

describe('LocalStorageMessageBackend', () => {
  it('reads a legacy bare-array conversation and re-persists it as a versioned envelope', async () => {
    const storage = memoryStorage();
    const key = `${CONVERSATION_STORAGE_PREFIX}:t1`;
    const legacy: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    // Earlier builds stored a bare UIMessage[] with no version wrapper.
    storage.setItem(key, JSON.stringify(legacy));

    const backend = new LocalStorageMessageBackend(storage, key);
    expect(await backend.load()).toEqual(legacy);

    await backend.persist({ order: ['m1'], changed: legacy, removed: [] });
    const raw = JSON.parse(storage.getItem(key)!) as { version: number; messages: UIMessage[] };
    expect(raw.version).toBe(PERSISTENCE_SCHEMA_VERSION);
    expect(raw.messages).toEqual(legacy);
  });

  it('round-trips messages in order and applies removals', async () => {
    const backend = new LocalStorageMessageBackend(memoryStorage(), 'k');
    await backend.persist({
      order: ['a', 'b', 'c'],
      changed: [msg('a'), msg('b'), msg('c')],
      removed: [],
    });
    expect((await backend.load()).map((m) => m.id)).toEqual(['a', 'b', 'c']);

    await backend.persist({ order: ['a', 'c'], changed: [], removed: ['b'] });
    expect((await backend.load()).map((m) => m.id)).toEqual(['a', 'c']);
  });
});

describe('incremental persistence', () => {
  it('never rewrites a large history — only the touched messages are persisted', async () => {
    const initial = Array.from({ length: 5000 }, (_, i) => msg(`m${i}`));
    const { backend, deltas } = recordingBackend(initial);
    const transport = fakeTransport([
      { type: AgUiEventType.RunStarted, runId: 'r1' },
      { type: AgUiEventType.TextMessageStart, messageId: 'a1', role: 'assistant' },
      { type: AgUiEventType.TextMessageContent, messageId: 'a1', delta: 'ok' },
      { type: AgUiEventType.TextMessageEnd, messageId: 'a1' },
      { type: AgUiEventType.RunFinished, runId: 'r1' },
    ]);

    const store = createChatStore({
      transport,
      tenantId: 't1',
      storage: memoryStorage(),
      messageBackend: backend,
    });

    await flush(); // let async hydration adopt the 5000-message history
    expect(store.getState().messages.length).toBe(5000);

    await store.getState().sendMessage('hi');

    // Every save wrote at most the new user + assistant message, never the
    // whole 5000-item array — this is what keeps long chats off the quota cliff.
    expect(deltas.length).toBeGreaterThan(0);
    for (const delta of deltas) {
      expect(delta.changed.length).toBeLessThanOrEqual(2);
      expect(delta.removed.length).toBe(0);
      expect(delta.order.length).toBeGreaterThanOrEqual(5001);
    }
    expect(store.getState().messages.length).toBe(5002);
  });
});
