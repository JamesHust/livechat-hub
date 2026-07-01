import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  Artifact,
  InterruptResolution,
  MessagePart,
  RunState,
  Session,
  UIMessage,
} from '@livechat-hub/shared';
import { AgUiEventType, type Transport } from '@livechat-hub/transport';
import { createActionRegistry, type ContextProvider, type FrontendAction } from './actions';
import { applyEventToMessages } from './reducer';
import { applyJsonPatch } from './state-patch';
import { createId } from './id';
import { resolveSession } from './session';
import {
  defaultMessageBackend,
  defaultStorage,
  PersistenceManager,
  type MessageBackend,
  type StorageAdapter,
} from './persistence';

/**
 * Safety cap on consecutive frontend-tool rounds in a single turn. Each round
 * is one backend run + one batch of browser tool executions; the bound stops a
 * misbehaving agent that calls a frontend tool in an unbroken loop.
 */
const MAX_FRONTEND_TOOL_ROUNDS = 8;

export interface ChatState {
  session: Session;
  messages: UIMessage[];
  run: RunState;
  /** Shared agent state synchronized via STATE_SNAPSHOT / STATE_DELTA. */
  agentState: Record<string, unknown>;
  /** Latest agent-authored artifacts, keyed by id (via ARTIFACT_UPDATE). */
  artifacts: Record<string, Artifact>;
}

export interface ChatActions {
  /** Append a user message and start an agent run. */
  sendMessage(text: string, extraParts?: MessagePart[]): Promise<void>;
  /** Abort the in-flight run, if any. */
  abort(): void;
  /**
   * Resume a paused (interrupted) run by answering every open interrupt. No-op
   * unless the run is currently `interrupted`. See {@link InterruptResolution}.
   */
  resume(resolutions: InterruptResolution[]): Promise<void>;
  /** Re-run the conversation from the last user message. */
  retryLast(): Promise<void>;
  /** Clear all messages and persisted history (keeps the session). */
  clear(): void;
  /**
   * Update the shared agent state from the frontend. Accepts a replacement
   * object or an updater. The new state is forwarded to the agent (via
   * `RunInput.state`) on the next run. See {@link ChatState.agentState}.
   */
  setAgentState(
    next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ): void;
  /**
   * Record the guest's display name (welcome step) on the session and persist
   * it, so returning guests skip the welcome screen.
   */
  setGuestName(name: string): void;
  /**
   * Register a frontend tool the agent may invoke in the browser. Returns an
   * unregister function. See {@link FrontendAction}.
   */
  registerAction(action: FrontendAction): () => void;
  /**
   * Register a live-context provider forwarded to the agent on every run.
   * Returns an unregister function. See {@link ContextProvider}.
   */
  registerContext(provider: ContextProvider): () => void;
}

export type ChatStore = ChatState & ChatActions;

export interface CreateChatStoreOptions {
  transport: Transport;
  tenantId: string;
  userId?: string;
  /**
   * Synchronous storage for the (small) session. Pass `null` to disable
   * persistence entirely. Defaults to localStorage (memory fallback).
   */
  storage?: StorageAdapter | null;
  /**
   * Backend for the (potentially large) conversation history. Defaults to
   * IndexedDB when available, else a localStorage/JSON envelope. Ignored when
   * `storage` is `null`.
   */
  messageBackend?: MessageBackend;
}

export function createChatStore(options: CreateChatStoreOptions): StoreApi<ChatStore> {
  const { transport, tenantId, userId } = options;
  const persistence =
    options.storage === null
      ? null
      : (() => {
          const storage = options.storage ?? defaultStorage();
          const backend = options.messageBackend ?? defaultMessageBackend(tenantId, storage);
          return new PersistenceManager(storage, backend);
        })();

  const session = persistence
    ? resolveSession(persistence, tenantId, userId)
    : { sessionId: createId('sess'), tenantId, userId };

  let abortController: AbortController | null = null;
  // Interrupt resolutions to attach to the next run, set by `resume()` and
  // consumed once by the following `streamRun()`.
  let pendingResume: InterruptResolution[] | null = null;
  // Last-persisted reference per message id. The reducer keeps unchanged
  // messages referentially identical, so a reference diff cheaply yields the
  // new / mutated messages to upsert and the removed ids to delete — an
  // incremental write instead of rewriting the entire history each save.
  let persistedRefs = new Map<string, UIMessage>();
  const registry = createActionRegistry();

  const store = createStore<ChatStore>((set, get) => {
    const persistMessages = () => {
      if (!persistence) return;
      const messages = get().messages;
      const changed = messages.filter((m) => persistedRefs.get(m.id) !== m);
      const currentIds = new Set(messages.map((m) => m.id));
      const removed = [...persistedRefs.keys()].filter((id) => !currentIds.has(id));
      persistedRefs = new Map(messages.map((m) => [m.id, m]));
      if (changed.length === 0 && removed.length === 0) return;
      void persistence.persistMessages({ order: messages.map((m) => m.id), changed, removed });
    };

    /** Stream a single backend run, folding its events into store state. */
    async function streamRun(): Promise<void> {
      abortController = new AbortController();
      const resume = pendingResume;
      pendingResume = null;
      // Fresh run state: drops any prior runId / open interrupts.
      set({ run: { status: 'running' } });

      try {
        const stream = transport.run(
          {
            threadId: get().session.sessionId,
            tenantId,
            userId,
            messages: get().messages,
            tools: registry.toolSpecs(),
            context: registry.contextItems(),
            ...(resume ? { resume } : {}),
            ...(Object.keys(get().agentState).length > 0 ? { state: get().agentState } : {}),
          },
          { signal: abortController.signal },
        );

        for await (const event of stream) {
          switch (event.type) {
            case AgUiEventType.RunStarted:
              set({ run: { status: 'running', runId: event.runId } });
              break;
            case AgUiEventType.RunFinished: {
              // An interrupt outcome pauses the turn for human input; otherwise
              // the run completed normally.
              const interrupts =
                event.outcome?.type === 'interrupt' ? event.outcome.interrupts : undefined;
              if (interrupts && interrupts.length > 0) {
                set({ run: { status: 'interrupted', runId: event.runId, interrupts } });
              } else {
                set({ run: { status: 'completed', runId: event.runId } });
              }
              break;
            }
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
            case AgUiEventType.ArtifactUpdate:
              set({
                artifacts: {
                  ...get().artifacts,
                  [event.artifactId]: {
                    id: event.artifactId,
                    kind: event.kind,
                    payload: event.payload,
                    updatedAt: Date.now(),
                  },
                },
              });
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
        // The turn reached a terminal state: no more results will arrive, so any
        // tool call still awaiting one (backend died after TOOL_CALL_END, or
        // args never finished) must not hang forever — mark it errored. Frontend
        // tool calls are excluded: the browser resolves those next (see runTurn).
        const status = get().run.status;
        if (status === 'completed' || status === 'failed') {
          const reconciled = reconcileOrphanToolCalls(get().messages, (name) =>
            Boolean(registry.getAction(name)),
          );
          if (reconciled !== get().messages) set({ messages: reconciled });
        }
        persistMessages();
      }
    }

    /**
     * Execute every pending frontend tool call in the browser and fold each
     * result back into the conversation (via the same reducer path as a
     * backend result), so the next run carries it to the agent.
     */
    async function resolveFrontendCalls(calls: PendingFrontendCall[]): Promise<void> {
      for (const call of calls) {
        const action = registry.getAction(call.toolName);
        if (!action) continue;
        let result: unknown;
        let isError = false;
        try {
          result = await action.handler(call.args);
        } catch (error) {
          result = { error: (error as Error).message };
          isError = true;
        }
        set({
          messages: applyEventToMessages(get().messages, {
            type: AgUiEventType.ToolCallResult,
            messageId: call.messageId,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            result,
            isError,
          }),
        });
      }
      persistMessages();
    }

    /**
     * Drive a full turn: stream the backend run, then — while the agent left
     * frontend tool calls unanswered — execute them and run again with the
     * results, until the agent stops calling them or we hit the safety cap.
     */
    async function runTurn(): Promise<void> {
      for (let round = 0; round < MAX_FRONTEND_TOOL_ROUNDS; round++) {
        await streamRun();
        if (get().run.status !== 'completed') return;

        const pending = collectPendingFrontendCalls(get().messages, registry.getAction);
        if (pending.length === 0) return;

        await resolveFrontendCalls(pending);
      }
    }

    return {
      session,
      // Starts empty; persisted history is hydrated asynchronously below
      // (IndexedDB has no synchronous read).
      messages: [],
      run: { status: 'idle' },
      agentState: {},
      artifacts: {},

      async sendMessage(text, extraParts = []) {
        const trimmed = text.trim();
        if (!trimmed && extraParts.length === 0) return;
        // Block while streaming, or while a turn is paused on an interrupt —
        // the user must resolve it (via `resume`) before a new message.
        if (get().run.status === 'running' || get().run.status === 'interrupted') return;

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

      async resume(resolutions) {
        if (get().run.status !== 'interrupted') return;
        pendingResume = resolutions;
        await runTurn();
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
        persistedRefs = new Map();
        set({ messages: [], run: { status: 'idle' }, agentState: {}, artifacts: {} });
        void persistence?.clear();
      },

      setAgentState(next) {
        const value = typeof next === 'function' ? next(get().agentState) : next;
        set({ agentState: value });
      },

      setGuestName(name) {
        const trimmed = name.trim();
        if (!trimmed) return;
        const next = { ...get().session, guestName: trimmed };
        set({ session: next });
        persistence?.saveSession(next);
      },

      registerAction: registry.registerAction,
      registerContext: registry.registerContext,
    };
  });

  // Hydrate persisted history asynchronously. Only adopt it if the user hasn't
  // already started interacting (messages still empty, run idle), so a slow disk
  // read never clobbers a fresh message.
  if (persistence) {
    void persistence
      .loadMessages()
      .then((loaded) => {
        if (loaded.length === 0) return;
        const state = store.getState();
        if (state.messages.length === 0 && state.run.status === 'idle') {
          persistedRefs = new Map(loaded.map((m) => [m.id, m]));
          store.setState({ messages: loaded });
        }
      })
      .catch(() => {
        /* corrupt / unavailable store — start fresh */
      });
  }

  return store;
}

/**
 * Mark tool calls that will never receive a result as `error`, so the UI never
 * shows a spinner forever. A call is orphaned when the turn ended and it has no
 * matching `tool-result` and is not a pending frontend action (which the browser
 * still has to execute). Returns the same array reference when nothing changed.
 */
function reconcileOrphanToolCalls(
  messages: UIMessage[],
  isFrontendAction: (name: string) => boolean,
): UIMessage[] {
  const resolved = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-result') resolved.add(part.toolCallId);
    }
  }

  let changed = false;
  const next = messages.map((message) => {
    let partsChanged = false;
    const parts = message.parts.map((part) => {
      if (part.type !== 'tool-call') return part;
      if (part.state === 'output-available' || part.state === 'error') return part;
      if (resolved.has(part.toolCallId)) return part;
      // A finished frontend call still awaiting browser execution — leave it.
      if (part.state === 'input-available' && isFrontendAction(part.toolName)) return part;
      partsChanged = true;
      return { ...part, state: 'error' as const };
    });
    if (!partsChanged) return message;
    changed = true;
    return { ...message, parts };
  });
  return changed ? next : messages;
}

/** A frontend tool call the agent left for the browser to execute. */
interface PendingFrontendCall {
  messageId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Find tool calls whose `toolName` is a registered frontend action, whose
 * arguments have finished streaming (`input-available`), and that have no
 * result yet. These are the calls the backend handed off to the browser.
 */
function collectPendingFrontendCalls(
  messages: UIMessage[],
  getAction: (name: string) => unknown,
): PendingFrontendCall[] {
  const resolved = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-result') resolved.add(part.toolCallId);
    }
  }

  const pending: PendingFrontendCall[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === 'tool-call' &&
        part.state === 'input-available' &&
        !resolved.has(part.toolCallId) &&
        getAction(part.toolName)
      ) {
        pending.push({
          messageId: message.id,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: isRecord(part.args) ? part.args : {},
        });
      }
    }
  }
  return pending;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}
