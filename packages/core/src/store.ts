import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MessagePart, RunState, Session, UIMessage } from '@livechat-hub/shared';
import { AgUiEventType, type Transport } from '@livechat-hub/transport';
import { applyEventToMessages } from './reducer';
import { applyJsonPatch } from './state-patch';
import { createId } from './id';
import { resolveSession } from './session';
import { defaultStorage, PersistenceManager, type StorageAdapter } from './persistence';

export interface ChatState {
  session: Session;
  messages: UIMessage[];
  run: RunState;
  /** Shared agent state synchronized via STATE_SNAPSHOT / STATE_DELTA. */
  agentState: Record<string, unknown>;
}

export interface ChatActions {
  /** Append a user message and start an agent run. */
  sendMessage(text: string, extraParts?: MessagePart[]): Promise<void>;
  /** Abort the in-flight run, if any. */
  abort(): void;
  /** Re-run the conversation from the last user message. */
  retryLast(): Promise<void>;
  /** Clear all messages and persisted history (keeps the session). */
  clear(): void;
  /**
   * Record the guest's display name (welcome step) on the session and persist
   * it, so returning guests skip the welcome screen.
   */
  setGuestName(name: string): void;
}

export type ChatStore = ChatState & ChatActions;

export interface CreateChatStoreOptions {
  transport: Transport;
  tenantId: string;
  userId?: string;
  /** Persistence storage. Pass `null` to disable persistence entirely. */
  storage?: StorageAdapter | null;
}

export function createChatStore(options: CreateChatStoreOptions): StoreApi<ChatStore> {
  const { transport, tenantId, userId } = options;
  const persistence =
    options.storage === null
      ? null
      : new PersistenceManager(options.storage ?? defaultStorage(), tenantId);

  const session = persistence
    ? resolveSession(persistence, tenantId, userId)
    : { sessionId: createId('sess'), tenantId, userId };

  let abortController: AbortController | null = null;

  const store = createStore<ChatStore>((set, get) => {
    const persistMessages = () => persistence?.saveMessages(get().messages);

    async function runTurn(): Promise<void> {
      abortController = new AbortController();
      set({ run: { status: 'running' } });

      try {
        const stream = transport.run(
          {
            threadId: get().session.sessionId,
            tenantId,
            userId,
            messages: get().messages,
          },
          { signal: abortController.signal },
        );

        for await (const event of stream) {
          switch (event.type) {
            case AgUiEventType.RunStarted:
              set({ run: { status: 'running', runId: event.runId } });
              break;
            case AgUiEventType.RunFinished:
              set({ run: { status: 'completed', runId: event.runId } });
              break;
            case AgUiEventType.RunError:
              set({
                run: {
                  status: 'failed',
                  runId: event.runId,
                  error: { code: event.code, message: event.message },
                },
              });
              break;
            case AgUiEventType.StateSnapshot:
              set({ agentState: event.snapshot });
              break;
            case AgUiEventType.StateDelta:
              set({ agentState: applyJsonPatch(get().agentState, event.delta) });
              break;
            default:
              set({ messages: applyEventToMessages(get().messages, event) });
          }
        }

        if (get().run.status === 'running') set({ run: { status: 'completed' } });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          set({ run: { status: 'idle' } });
        } else {
          set({
            run: { status: 'failed', error: { message: (error as Error).message } },
          });
        }
      } finally {
        abortController = null;
        persistMessages();
      }
    }

    return {
      session,
      messages: persistence?.loadMessages() ?? [],
      run: { status: 'idle' },
      agentState: {},

      async sendMessage(text, extraParts = []) {
        const trimmed = text.trim();
        if (!trimmed && extraParts.length === 0) return;
        if (get().run.status === 'running') return;

        const parts: MessagePart[] = [];
        if (trimmed) parts.push({ type: 'text', text: trimmed });
        parts.push(...extraParts);

        const userMessage: UIMessage = {
          id: createId('msg'),
          role: 'user',
          parts,
          metadata: { createdAt: Date.now() },
        };
        set({ messages: [...get().messages, userMessage] });
        persistMessages();
        await runTurn();
      },

      abort() {
        abortController?.abort();
      },

      async retryLast() {
        if (get().run.status === 'running') return;
        const messages = get().messages;
        const lastUserIndex = findLastIndex(messages, (m) => m.role === 'user');
        if (lastUserIndex === -1) return;
        // Drop everything after the last user message, then re-run.
        set({ messages: messages.slice(0, lastUserIndex + 1) });
        persistMessages();
        await runTurn();
      },

      clear() {
        abortController?.abort();
        set({ messages: [], run: { status: 'idle' }, agentState: {} });
        persistence?.clear();
      },

      setGuestName(name) {
        const trimmed = name.trim();
        if (!trimmed) return;
        const next = { ...get().session, guestName: trimmed };
        set({ session: next });
        persistence?.saveSession(next);
      },
    };
  });

  return store;
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}
