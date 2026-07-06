import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  Artifact,
  ConversationSummary,
  CsatState,
  InterruptResolution,
  MessageFeedback,
  MessageMetadata,
  MessagePart,
  MessageStatus,
  RunState,
  Session,
  UIMessage,
  UserIdentity,
} from '@livechat-hub/shared';
import { AgUiEventType, type Transport } from '@livechat-hub/transport';
import { createActionRegistry, type ContextProvider, type FrontendAction } from './actions';
import { applyEventToMessages } from './reducer';
import { applyJsonPatch } from './state-patch';
import { messageText } from './search';
import { createId } from './id';
import { resolveSession } from './session';
import {
  conversationIndexKey,
  defaultMessageBackend,
  defaultMessageBackendFactory,
  defaultStorage,
  draftKey,
  PersistenceManager,
  type MessageBackend,
  type MessageBackendFactory,
  type StorageAdapter,
} from './persistence';

/** Longest auto-derived conversation title / preview snippet (characters). */
const TITLE_MAX = 60;
const PREVIEW_MAX = 80;

/**
 * Safety cap on consecutive frontend-tool rounds in a single turn. Each round
 * is one backend run + one batch of browser tool executions; the bound stops a
 * misbehaving agent that calls a frontend tool in an unbroken loop.
 */
const MAX_FRONTEND_TOOL_ROUNDS = 8;

/**
 * A consequential frontend action paused on an explicit user approval before
 * its handler runs (see {@link FrontendAction.requireConfirmation}). The UI
 * renders one approval card per entry and answers via {@link ChatActions.confirmAction}.
 */
export interface ActionConfirmation {
  /** Id of the tool call whose handler is gated. */
  toolCallId: string;
  toolName: string;
  /** Parsed arguments the handler would run with — shown for review. */
  args: Record<string, unknown>;
  /** Prompt to show; falls back to a generic localized message in the UI. */
  message?: string;
}

/** Outcome of an awaited action confirmation. */
type ConfirmDecision = 'approved' | 'denied' | 'aborted';

export interface ChatState {
  session: Session;
  /** Messages of the active conversation (the live thread the UI renders). */
  messages: UIMessage[];
  run: RunState;
  /**
   * All conversations for this tenant (the multi-thread sidebar), most-recent
   * ordering left to the UI. The active thread's messages live in `messages`.
   */
  conversations: ConversationSummary[];
  /** Id of the conversation currently open (its history is in `messages`). */
  activeConversationId: string;
  /** Shared agent state synchronized via STATE_SNAPSHOT / STATE_DELTA. */
  agentState: Record<string, unknown>;
  /** Latest agent-authored artifacts, keyed by id (via ARTIFACT_UPDATE). */
  artifacts: Record<string, Artifact>;
  /** Names of frontend tools currently registered (for renderers to label them). */
  frontendTools: string[];
  /** Consequential frontend actions awaiting user approval before running. */
  actionConfirmations: ActionConfirmation[];
  /**
   * End-of-chat satisfaction (CSAT) prompt state. Presence and human-agent
   * handoff are backend-driven and read from {@link ChatState.agentState}
   * (see `LifecycleAgentState`); CSAT is client-driven and lives here.
   */
  csat: CsatState;
}

export interface ChatActions {
  /** Append a user message and start an agent run. */
  sendMessage(text: string, extraParts?: MessagePart[]): Promise<void>;
  /** Abort the in-flight run, if any. */
  abort(): void;
  /**
   * Answer a pending frontend-action confirmation by tool-call id (see
   * {@link ChatState.actionConfirmations}). Approving runs the gated handler and
   * continues the turn; rejecting returns a "declined" result to the agent.
   * No-op for an unknown / already-answered id.
   */
  confirmAction(toolCallId: string, approved: boolean): void;
  /**
   * Resume a paused (interrupted) run by answering every open interrupt. No-op
   * unless the run is currently `interrupted`. See {@link InterruptResolution}.
   */
  resume(resolutions: InterruptResolution[]): Promise<void>;
  /** Re-run the conversation from the last user message (recover from an error). */
  retryLast(): Promise<void>;
  /**
   * Re-send a specific (typically failed) user message: trims everything after
   * it and starts a fresh run. Used by the per-message resend affordance.
   */
  retryMessage(messageId: string): Promise<void>;
  /**
   * Regenerate the last assistant answer: drops it and re-runs from the last
   * user message. Behaves like {@link retryLast} but is offered on a completed
   * turn rather than a failed one.
   */
  regenerate(): Promise<void>;
  /**
   * Record (or toggle off) the end-user's rating of an assistant message. Stored
   * on the message metadata and persisted; hosts observe it via the UI callback.
   */
  setFeedback(messageId: string, value: MessageFeedback): void;
  /** Read the persisted composer draft (empty string when none). */
  loadDraft(): string;
  /** Persist the composer draft; pass an empty string to clear it. */
  saveDraft(text: string): void;
  /** Clear the active conversation's messages and persisted history (keeps the thread). */
  clear(): void;
  /**
   * Start a new, empty conversation and switch to it. No-op if the active
   * conversation is already empty (you're already on a blank thread).
   */
  newConversation(): void;
  /** Switch to an existing conversation by id, loading its history. No-op if unknown. */
  switchConversation(id: string): void;
  /**
   * Delete a conversation and its history. If it was active, switches to the
   * most recent remaining thread (or a fresh empty one when none remain).
   */
  deleteConversation(id: string): void;
  /** Rename a conversation, pinning a title that auto-derivation won't overwrite. */
  renameConversation(id: string, title: string): void;
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
   * Update the end-user identity at runtime (host `identify()`), merging the
   * given fields onto the session. `userId` and the opaque `traits`/name/email
   * are forwarded to the agent on the next run — no re-init required. See
   * {@link UserIdentity}.
   */
  identify(user: UserIdentity): void;
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
  /**
   * Inject a proactive assistant message (a host-triggered greeting / nudge —
   * by URL, time on page, scroll, …). It is appended client-side and persisted,
   * but starts no run. No-op for empty text.
   */
  addProactiveMessage(text: string): void;
  /** Show the end-of-chat satisfaction (CSAT) prompt. */
  requestCsat(): void;
  /**
   * Record the end-user's CSAT rating (1–5, clamped) and optional comment, then
   * hide the prompt. No-op for an out-of-range rating.
   */
  submitCsat(rating: number, comment?: string): void;
  /** Dismiss the CSAT prompt without submitting a rating. */
  dismissCsat(): void;
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
   * Backend for a single conversation's history. When set it backs **every**
   * conversation (a shared store) — mainly a test seam. Prefer
   * `messageBackendFactory` for real per-thread isolation.
   */
  messageBackend?: MessageBackend;
  /**
   * Per-conversation backend factory. Defaults to IndexedDB when available
   * (partitioned by conversation id), else a localStorage/JSON envelope.
   * Ignored when `storage` is `null`.
   */
  messageBackendFactory?: MessageBackendFactory;
}

export function createChatStore(options: CreateChatStoreOptions): StoreApi<ChatStore> {
  const { transport, tenantId, userId } = options;
  const persistence =
    options.storage === null
      ? null
      : (() => {
          const storage = options.storage ?? defaultStorage();
          const factory: MessageBackendFactory =
            options.messageBackendFactory ??
            (options.messageBackend
              ? () => options.messageBackend!
              : defaultMessageBackendFactory(tenantId, storage));
          // Only the built-in factory has a pre-multi-thread store to migrate.
          const legacyBackend =
            options.messageBackend || options.messageBackendFactory
              ? null
              : defaultMessageBackend(tenantId, storage);
          return new PersistenceManager(storage, factory, {
            draftStorageKey: draftKey(tenantId),
            indexStorageKey: conversationIndexKey(tenantId),
            legacyBackend,
          });
        })();

  const session = persistence
    ? resolveSession(persistence, tenantId, userId)
    : { sessionId: createId('sess'), tenantId, userId };

  // Resolve the initial conversation list + active id synchronously so the
  // store has a valid active thread before any async history load. An existing
  // index is adopted; otherwise a fresh conversation #1 is created (its history
  // — including any legacy single-thread data — is hydrated asynchronously).
  const savedIndex = persistence?.loadConversationIndex() ?? null;
  const hasSavedIndex = Boolean(savedIndex && savedIndex.summaries.length > 0);
  const initialConversations: ConversationSummary[] = hasSavedIndex
    ? savedIndex!.summaries
    : [freshConversationSummary()];
  const initialActiveId =
    hasSavedIndex && savedIndex!.summaries.some((c) => c.id === savedIndex!.activeId)
      ? savedIndex!.activeId
      : initialConversations[0]!.id;

  let abortController: AbortController | null = null;
  // Interrupt resolutions to attach to the next run, set by `resume()` and
  // consumed once by the following `streamRun()`.
  let pendingResume: InterruptResolution[] | null = null;
  // Frontend-action confirmations awaiting the user. `confirmResolvers` maps a
  // paused tool-call id to the promise resolver the handler-gate is blocked on;
  // `confirmTimers` holds its optional auto-deny timeout. `turnAborted` lets an
  // `abort()`/`clear()` during a confirmation wait unwind the run loop.
  const confirmResolvers = new Map<string, (decision: ConfirmDecision) => void>();
  const confirmTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let turnAborted = false;
  // Last-persisted reference per message id. The reducer keeps unchanged
  // messages referentially identical, so a reference diff cheaply yields the
  // new / mutated messages to upsert and the removed ids to delete — an
  // incremental write instead of rewriting the entire history each save.
  let persistedRefs = new Map<string, UIMessage>();
  const registry = createActionRegistry();

  const store = createStore<ChatStore>((set, get) => {
    /**
     * Refresh the active conversation's summary (auto-title, preview, recency)
     * from its current messages and persist the index. Keeps the sidebar live
     * and is cheap — the index is a small synchronous record.
     */
    const touchActiveSummary = (messages: UIMessage[]) => {
      const activeId = get().activeConversationId;
      const summaries = get().conversations;
      const index = summaries.findIndex((c) => c.id === activeId);
      if (index === -1) return;
      const current = summaries[index]!;
      const next: ConversationSummary = {
        ...current,
        // A user-set title is sticky; otherwise derive from the first user turn.
        title: current.title ?? deriveTitle(messages),
        preview: derivePreview(messages),
        updatedAt: Date.now(),
      };
      const updated = summaries.map((c, i) => (i === index ? next : c));
      set({ conversations: updated });
      persistence?.saveConversationIndex({ activeId, summaries: updated });
    };

    const persistMessages = () => {
      const messages = get().messages;
      const activeId = get().activeConversationId;
      const changed = messages.filter((m) => persistedRefs.get(m.id) !== m);
      const currentIds = new Set(messages.map((m) => m.id));
      const removed = [...persistedRefs.keys()].filter((id) => !currentIds.has(id));
      persistedRefs = new Map(messages.map((m) => [m.id, m]));
      if (changed.length === 0 && removed.length === 0) return;
      // Refresh the in-memory summary (title/preview) even without a backend, so
      // the conversation list is correct in memory-only mode too.
      touchActiveSummary(messages);
      if (!persistence) return;
      void persistence.persistMessages(activeId, {
        order: messages.map((m) => m.id),
        changed,
        removed,
      });
    };

    /** Immutably merge a metadata patch onto the message at `index`. */
    const patchMessageMetadata = (index: number, patch: MessageMetadata) => {
      const messages = get().messages;
      const target = messages[index];
      if (!target) return;
      set({
        messages: messages.map((m, i) =>
          i === index ? { ...m, metadata: { ...m.metadata, ...patch } } : m,
        ),
      });
    };

    /** Set the delivery status of the message that triggered the current turn. */
    const setTriggerStatus = (status: MessageStatus) => {
      const messages = get().messages;
      const index = findLastIndex(messages, (m) => m.role === 'user');
      if (index === -1 || messages[index]?.metadata?.status === status) return;
      patchMessageMetadata(index, { status });
    };

    /** Stream a single backend run, folding its events into store state. */
    async function streamRun(): Promise<void> {
      abortController = new AbortController();
      const resume = pendingResume;
      pendingResume = null;
      // Fresh run state: drops any prior runId / open interrupts.
      set({ run: { status: 'running' } });
      // Whether the run reached the backend this attempt — a message is only
      // marked `failed` (offer resend) when it never got there.
      let contacted = false;

      try {
        // Read identity from the (live) session so a runtime `identify()` takes
        // effect on the very next run without a re-init.
        const activeSession = get().session;
        const identity = identityMetadata(activeSession);
        const stream = transport.run(
          {
            // A conversation is a thread: the active conversation id is the
            // backend threadId, so each thread streams / resumes independently.
            threadId: get().activeConversationId,
            tenantId,
            userId: activeSession.userId,
            messages: get().messages,
            tools: registry.toolSpecs(),
            context: registry.contextItems(),
            ...(resume ? { resume } : {}),
            ...(identity ? { metadata: { user: identity } } : {}),
            ...(Object.keys(get().agentState).length > 0 ? { state: get().agentState } : {}),
          },
          { signal: abortController.signal },
        );

        for await (const event of stream) {
          switch (event.type) {
            case AgUiEventType.RunStarted:
              contacted = true;
              // The message reached the backend — it's delivered.
              setTriggerStatus('sent');
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
                    ...(event.title !== undefined ? { title: event.title } : {}),
                    updatedAt: Date.now(),
                  },
                },
              });
              break;
            default: {
              const prev = get().messages;
              set({ messages: stampNewMessages(prev, applyEventToMessages(prev, event)) });
            }
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
        // Finalize the triggering message's delivery status. A failure that
        // never reached the backend (offline) is a genuine send failure the user
        // can resend; a failure after contact is a run error (the error bar owns
        // retry), so the message stays `sent`.
        if (status === 'completed' || status === 'interrupted') setTriggerStatus('sent');
        else if (status === 'failed' && !contacted) setTriggerStatus('failed');
        persistMessages();
      }
    }

    /** Fold a tool result into the target message (same path as a backend result). */
    const foldToolResult = (call: PendingFrontendCall, result: unknown, isError: boolean) => {
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
    };

    /** Resolve a pending confirmation: clear its timer + state and wake the gate. */
    const settleConfirmation = (toolCallId: string, decision: ConfirmDecision) => {
      const resolve = confirmResolvers.get(toolCallId);
      if (!resolve) return;
      confirmResolvers.delete(toolCallId);
      const timer = confirmTimers.get(toolCallId);
      if (timer !== undefined) {
        clearTimeout(timer);
        confirmTimers.delete(toolCallId);
      }
      set({
        actionConfirmations: get().actionConfirmations.filter((c) => c.toolCallId !== toolCallId),
      });
      resolve(decision);
    };

    /** Surface an approval card for `call` and wait for the user's decision. */
    const requestConfirmation = (
      call: PendingFrontendCall,
      action: FrontendAction,
    ): Promise<ConfirmDecision> => {
      set({
        actionConfirmations: [
          ...get().actionConfirmations,
          {
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            args: call.args,
            ...(action.confirmationMessage ? { message: action.confirmationMessage } : {}),
          },
        ],
      });
      return new Promise<ConfirmDecision>((resolve) => {
        confirmResolvers.set(call.toolCallId, resolve);
        const timeout = action.confirmationTimeoutMs ?? 0;
        if (timeout > 0) {
          confirmTimers.set(
            call.toolCallId,
            setTimeout(() => settleConfirmation(call.toolCallId, 'denied'), timeout),
          );
        }
      });
    };

    /** Run a handler, failing it if it exceeds the action's `timeoutMs` (if any). */
    const runHandler = (
      action: FrontendAction,
      args: Record<string, unknown>,
    ): Promise<unknown> => {
      const settled = Promise.resolve().then(() => action.handler(args));
      const timeout = action.timeoutMs ?? 0;
      if (timeout <= 0) return settled;
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Action timed out')), timeout);
        settled.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
    };

    /**
     * Execute every pending frontend tool call in the browser and fold each
     * result back into the conversation, so the next run carries it to the
     * agent. A call flagged `requireConfirmation` first pauses on an approval
     * card: approval runs the handler, rejection returns a declined result, and
     * an `abort()`/`clear()` during the wait stops the turn.
     */
    async function resolveFrontendCalls(calls: PendingFrontendCall[]): Promise<void> {
      for (const call of calls) {
        if (turnAborted) return;
        const action = registry.getAction(call.toolName);
        if (!action) continue;

        if (action.requireConfirmation) {
          const decision = await requestConfirmation(call, action);
          if (decision === 'aborted') {
            foldToolResult(call, { aborted: true }, true);
            persistMessages();
            return;
          }
          if (decision === 'denied') {
            foldToolResult(call, { declined: true }, false);
            continue;
          }
        }

        let result: unknown;
        let isError = false;
        try {
          result = await runHandler(action, call.args);
        } catch (error) {
          result = { error: (error as Error).message };
          isError = true;
        }
        foldToolResult(call, result, isError);
      }
      persistMessages();
    }

    /**
     * Drive a full turn: stream the backend run, then — while the agent left
     * frontend tool calls unanswered — execute them and run again with the
     * results, until the agent stops calling them or we hit the safety cap.
     */
    async function runTurn(): Promise<void> {
      turnAborted = false;
      for (let round = 0; round < MAX_FRONTEND_TOOL_ROUNDS; round++) {
        await streamRun();
        if (get().run.status !== 'completed') return;

        const pending = collectPendingFrontendCalls(get().messages, registry.getAction);
        if (pending.length === 0) return;

        await resolveFrontendCalls(pending);
        // An abort during a confirmation wait stops the turn here rather than
        // looping into another backend run.
        if (turnAborted) return;
      }
    }

    /** Deny + release every confirmation the UI is waiting on (abort / clear / teardown). */
    const releaseConfirmations = () => {
      turnAborted = true;
      for (const id of [...confirmResolvers.keys()]) settleConfirmation(id, 'aborted');
    };

    /** True while a turn is in-flight: streaming, or paused on an action confirmation. */
    const isTurnBusy = () => get().run.status === 'running' || get().actionConfirmations.length > 0;

    /**
     * Make `id` the active conversation: stop any live turn, reset transient
     * per-thread state, persist the active pointer, then hydrate that thread's
     * history asynchronously (guarded so a fast interaction never clobbers it).
     * The summary for `id` must already be in `conversations`.
     */
    const activate = (id: string) => {
      abortController?.abort();
      releaseConfirmations();
      persistedRefs = new Map();
      set({
        activeConversationId: id,
        messages: [],
        run: { status: 'idle' },
        agentState: {},
        artifacts: {},
        actionConfirmations: [],
        csat: { status: 'idle' },
      });
      persistence?.saveConversationIndex({ activeId: id, summaries: get().conversations });
      if (!persistence) return;
      void persistence
        .loadMessages(id)
        .then((loaded) => {
          if (loaded.length === 0) return;
          if (
            get().activeConversationId === id &&
            get().messages.length === 0 &&
            get().run.status === 'idle'
          ) {
            persistedRefs = new Map(loaded.map((m) => [m.id, m]));
            set({ messages: loaded });
          }
        })
        .catch(() => {
          /* corrupt / unavailable thread — leave it empty */
        });
    };

    /**
     * Re-run the turn anchored at the user message at `index`: drop everything
     * after it, reset its status to `sending`, and stream a fresh run. Shared by
     * `retryLast` (error recovery), `regenerate` (redo the last answer), and
     * `retryMessage` (resend a specific failed message).
     */
    async function rerunFrom(index: number): Promise<void> {
      const trimmed = get()
        .messages.slice(0, index + 1)
        .map((m, i) =>
          i === index ? { ...m, metadata: { ...m.metadata, status: 'sending' as const } } : m,
        );
      set({ messages: trimmed });
      persistMessages();
      await runTurn();
    }

    return {
      session,
      // Starts empty; persisted history is hydrated asynchronously below
      // (IndexedDB has no synchronous read).
      messages: [],
      run: { status: 'idle' },
      conversations: initialConversations,
      activeConversationId: initialActiveId,
      agentState: {},
      artifacts: {},
      frontendTools: registry.actionNames(),
      actionConfirmations: [],
      csat: { status: 'idle' },

      async sendMessage(text, extraParts = []) {
        const trimmed = text.trim();
        if (!trimmed && extraParts.length === 0) return;
        // Block while streaming, while a turn is paused on an interrupt, or while
        // a frontend action awaits confirmation — the user must resolve those
        // (via `resume` / `confirmAction`) before a new message.
        if (isTurnBusy() || get().run.status === 'interrupted') return;

        const parts: MessagePart[] = [];
        if (trimmed) parts.push({ type: 'text', text: trimmed });
        parts.push(...extraParts);

        const userMessage: UIMessage = {
          id: createId('msg'),
          role: 'user',
          parts,
          metadata: { createdAt: Date.now(), status: 'sending' },
        };
        set({ messages: [...get().messages, userMessage] });
        persistMessages();
        await runTurn();
      },

      abort() {
        abortController?.abort();
        // Also release any confirmation the turn is blocked on so it unwinds.
        releaseConfirmations();
      },

      confirmAction(toolCallId, approved) {
        settleConfirmation(toolCallId, approved ? 'approved' : 'denied');
      },

      async resume(resolutions) {
        if (get().run.status !== 'interrupted') return;
        pendingResume = resolutions;
        await runTurn();
      },

      async retryLast() {
        if (isTurnBusy()) return;
        const index = findLastIndex(get().messages, (m) => m.role === 'user');
        if (index === -1) return;
        await rerunFrom(index);
      },

      async regenerate() {
        // Regenerating discards the current answer; block while a run is live,
        // paused on an interrupt, or awaiting an action confirmation.
        if (isTurnBusy() || get().run.status === 'interrupted') return;
        const index = findLastIndex(get().messages, (m) => m.role === 'user');
        if (index === -1) return;
        await rerunFrom(index);
      },

      async retryMessage(messageId) {
        if (isTurnBusy()) return;
        const messages = get().messages;
        const index = messages.findIndex((m) => m.id === messageId);
        if (index === -1 || messages[index]?.role !== 'user') return;
        await rerunFrom(index);
      },

      setFeedback(messageId, value) {
        const messages = get().messages;
        const index = messages.findIndex((m) => m.id === messageId);
        if (index === -1) return;
        // Clicking the active rating clears it (toggle off).
        const next = messages[index]?.metadata?.feedback === value ? undefined : value;
        set({
          messages: messages.map((m, i) =>
            i === index ? { ...m, metadata: { ...m.metadata, feedback: next } } : m,
          ),
        });
        persistMessages();
      },

      loadDraft() {
        return persistence?.loadDraft() ?? '';
      },

      saveDraft(text) {
        persistence?.saveDraft(text);
      },

      clear() {
        abortController?.abort();
        releaseConfirmations();
        persistedRefs = new Map();
        const activeId = get().activeConversationId;
        // The active thread is now empty, so drop its derived title/preview too.
        const summaries = get().conversations.map((c) =>
          c.id === activeId ? { id: c.id, createdAt: c.createdAt, updatedAt: Date.now() } : c,
        );
        set({
          messages: [],
          run: { status: 'idle' },
          agentState: {},
          artifacts: {},
          actionConfirmations: [],
          csat: { status: 'idle' },
          conversations: summaries,
        });
        persistence?.saveConversationIndex({ activeId, summaries });
        void persistence?.clearConversation(activeId);
      },

      newConversation() {
        // Already on a blank thread — nothing to start.
        if (get().messages.length === 0) return;
        const conv = freshConversationSummary();
        set({ conversations: [conv, ...get().conversations] });
        activate(conv.id);
      },

      switchConversation(id) {
        if (id === get().activeConversationId) return;
        if (!get().conversations.some((c) => c.id === id)) return;
        activate(id);
      },

      deleteConversation(id) {
        const summaries = get().conversations;
        if (!summaries.some((c) => c.id === id)) return;
        void persistence?.clearConversation(id);
        const remaining = summaries.filter((c) => c.id !== id);
        if (id === get().activeConversationId) {
          // Fall back to the most recent remaining thread, or a fresh empty one.
          const nextSummaries = remaining.length > 0 ? remaining : [freshConversationSummary()];
          set({ conversations: nextSummaries });
          activate(nextSummaries[0]!.id);
        } else {
          set({ conversations: remaining });
          persistence?.saveConversationIndex({
            activeId: get().activeConversationId,
            summaries: remaining,
          });
        }
      },

      renameConversation(id, title) {
        const trimmed = title.trim();
        const summaries = get().conversations.map((c) =>
          c.id === id ? { ...c, title: trimmed || undefined, updatedAt: Date.now() } : c,
        );
        set({ conversations: summaries });
        persistence?.saveConversationIndex({ activeId: get().activeConversationId, summaries });
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

      identify(user) {
        const prev = get().session;
        // Merge onto the session: `userId` is a first-class field; name / email
        // / traits ride in `metadata` (opaque, provider-agnostic annotations).
        const metadata: Record<string, unknown> = { ...prev.metadata };
        if (user.name !== undefined) metadata.name = user.name;
        if (user.email !== undefined) metadata.email = user.email;
        if (user.traits !== undefined) metadata.traits = user.traits;
        const next: Session = {
          ...prev,
          ...(user.userId !== undefined ? { userId: user.userId } : {}),
          metadata,
        };
        set({ session: next });
        persistence?.saveSession(next);
      },

      registerAction(action) {
        const unregister = registry.registerAction(action);
        // Mirror the registered names into state so renderers can tell a
        // frontend action apart from a backend tool.
        set({ frontendTools: registry.actionNames() });
        return () => {
          unregister();
          set({ frontendTools: registry.actionNames() });
        };
      },
      registerContext: registry.registerContext,

      addProactiveMessage(text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        const message: UIMessage = {
          id: createId('msg'),
          role: 'assistant',
          parts: [{ type: 'text', text: trimmed, state: 'done' }],
          // Flag it so hosts / analytics can tell a proactive nudge apart from a
          // streamed answer; the open metadata index allows the extra key.
          metadata: { createdAt: Date.now(), proactive: true },
        };
        set({ messages: [...get().messages, message] });
        persistMessages();
      },

      requestCsat() {
        set({ csat: { status: 'requested' } });
      },

      submitCsat(rating, comment) {
        const clamped = Math.round(rating);
        if (clamped < 1 || clamped > 5) return;
        const result =
          comment && comment.trim()
            ? { rating: clamped, comment: comment.trim() }
            : { rating: clamped };
        set({ csat: { status: 'submitted', result } });
      },

      dismissCsat() {
        set({ csat: { status: 'idle', result: get().csat.result } });
      },
    };
  });

  // Hydrate the active conversation's history asynchronously (IndexedDB has no
  // synchronous read). Only adopt it if the user hasn't already started
  // interacting (messages still empty, run idle, same thread), so a slow disk
  // read never clobbers a fresh message.
  if (persistence) {
    void (async () => {
      try {
        const activeId = store.getState().activeConversationId;
        let loaded = await persistence.loadMessages(activeId);
        // First run (no saved index): adopt any pre-multi-thread single-thread
        // history into this conversation, then retire the legacy store.
        if (loaded.length === 0 && !hasSavedIndex) {
          const legacy = await persistence.loadLegacyMessages();
          if (legacy.length > 0) {
            loaded = legacy;
            await persistence.persistMessages(activeId, {
              order: legacy.map((m) => m.id),
              changed: legacy,
              removed: [],
            });
            await persistence.clearLegacy();
          }
        }

        const state = store.getState();
        const adoptable =
          loaded.length > 0 &&
          state.activeConversationId === activeId &&
          state.messages.length === 0 &&
          state.run.status === 'idle';
        if (!adoptable) return;
        persistedRefs = new Map(loaded.map((m) => [m.id, m]));
        if (hasSavedIndex) {
          store.setState({ messages: loaded });
        } else {
          // Seed the (new / migrated) conversation's summary from its history.
          const summaries = state.conversations.map((c) =>
            c.id === activeId
              ? { ...c, title: c.title ?? deriveTitle(loaded), preview: derivePreview(loaded) }
              : c,
          );
          store.setState({ messages: loaded, conversations: summaries });
          persistence.saveConversationIndex({ activeId, summaries });
        }
      } catch {
        /* corrupt / unavailable store — start fresh */
      }
    })();
  }

  return store;
}

/**
 * The identity annotation forwarded to the agent (via `RunInput.metadata.user`)
 * — name / email / traits set through `identify()`. Returns `undefined` when the
 * session carries no identity so an empty object never rides on the wire.
 */
function identityMetadata(session: Session): Record<string, unknown> | undefined {
  const meta = session.metadata;
  if (!meta) return undefined;
  const entries: Record<string, unknown> = {};
  if (meta.name !== undefined) entries.name = meta.name;
  if (meta.email !== undefined) entries.email = meta.email;
  if (meta.traits !== undefined) entries.traits = meta.traits;
  return Object.keys(entries).length > 0 ? entries : undefined;
}

/** A brand-new, empty conversation summary (fresh id + timestamps). */
function freshConversationSummary(): ConversationSummary {
  const now = Date.now();
  return { id: createId('conv'), createdAt: now, updatedAt: now };
}

/** Auto-title a conversation from its first user message; `undefined` when none. */
function deriveTitle(messages: UIMessage[]): string | undefined {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return undefined;
  const text = messageText(firstUser);
  return text ? truncate(text, TITLE_MAX) : undefined;
}

/** Short preview of the latest message for the sidebar; `undefined` when empty. */
function derivePreview(messages: UIMessage[]): string | undefined {
  const last = messages[messages.length - 1];
  if (!last) return undefined;
  const text = messageText(last);
  return text ? truncate(text, PREVIEW_MAX) : undefined;
}

/** Collapse whitespace and clip to `max` characters with an ellipsis. */
function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed;
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

/**
 * Stamp a client `createdAt` on messages the reducer just appended (assistant /
 * system / tool turns) so every bubble can show a send time. The reducer only
 * ever appends, so only indices past the previous length can be new — keeping
 * this O(1) amortized on the streaming hot path (delta events don't grow the
 * array, so they early-return). Keeps the reducer itself pure.
 */
function stampNewMessages(prev: UIMessage[], next: UIMessage[]): UIMessage[] {
  if (next.length <= prev.length) return next;
  return next.map((m, i) =>
    i >= prev.length && m.metadata?.createdAt == null
      ? { ...m, metadata: { ...m.metadata, createdAt: Date.now() } }
      : m,
  );
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return i;
  }
  return -1;
}
