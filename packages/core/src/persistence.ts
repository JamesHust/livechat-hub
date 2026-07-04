import {
  CONVERSATION_INDEX_STORAGE_PREFIX,
  CONVERSATION_STORAGE_PREFIX,
  DRAFT_STORAGE_PREFIX,
  PERSISTENCE_SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
  type ConversationSummary,
  type Session,
  type UIMessage,
} from '@livechat-hub/shared';
import { createIndexedDbMessageBackend } from './indexeddb';

/**
 * Synchronous key-value storage used for small records (the session). Works in
 * the widget (localStorage), the extension (adaptable to chrome.storage), tests
 * (memory) or can be disabled.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Incremental delta persisted on each save. `order` is the authoritative id
 * sequence (cheap to write); `changed` are the message bodies to upsert (only
 * the new / mutated ones — so streaming a reply rewrites one record, not the
 * whole history); `removed` are ids to delete (e.g. after a retry trims the
 * tail). This is what keeps a long conversation off the localStorage quota.
 */
export interface PersistDelta {
  order: string[];
  changed: UIMessage[];
  removed: string[];
}

/**
 * Async, versioned conversation store. IndexedDB is the primary backend (large
 * quota, per-message writes); a localStorage/JSON envelope is the fallback.
 */
export interface MessageBackend {
  load(): Promise<UIMessage[]>;
  persist(delta: PersistDelta): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Builds a {@link MessageBackend} for a given conversation id. Multi-thread
 * persistence keeps one backend per conversation (all sharing the same
 * IndexedDB database, partitioned by id) so switching threads loads only that
 * thread's history.
 */
export type MessageBackendFactory = (conversationId: string) => MessageBackend;

/**
 * Persisted index of every conversation for a tenant (the multi-thread sidebar)
 * plus which one is active. Small enough for synchronous storage; the messages
 * themselves live per-conversation in a {@link MessageBackend}.
 */
export interface ConversationIndex {
  activeId: string;
  summaries: ConversationSummary[];
}

export const memoryStorage = (): StorageAdapter => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

/** Returns localStorage when available, otherwise an in-memory fallback. */
export function defaultStorage(): StorageAdapter {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__lch_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* access denied (e.g. sandboxed iframe) — fall through */
  }
  return memoryStorage();
}

/**
 * Pick the best message backend: IndexedDB when the environment supports it
 * (large quota + incremental writes), else a localStorage/JSON envelope.
 */
export function defaultMessageBackend(tenantId: string, storage: StorageAdapter): MessageBackend {
  if (typeof indexedDB !== 'undefined') {
    try {
      return createIndexedDbMessageBackend(conversationKey(tenantId));
    } catch {
      /* IndexedDB present but unusable — fall through to localStorage */
    }
  }
  return new LocalStorageMessageBackend(storage, conversationKey(tenantId));
}

/**
 * Per-conversation backend factory used by the multi-thread store. Each
 * conversation gets its own backend, namespaced by tenant + conversation id, so
 * threads never collide (and never overwrite the pre-multi-thread single-thread
 * store at {@link defaultMessageBackend}, which the store migrates from once).
 */
export function defaultMessageBackendFactory(
  tenantId: string,
  storage: StorageAdapter,
): MessageBackendFactory {
  const useIdb = typeof indexedDB !== 'undefined';
  return (conversationId) => {
    const scope = `${tenantId}::${conversationId}`;
    if (useIdb) {
      try {
        return createIndexedDbMessageBackend(scope);
      } catch {
        /* IndexedDB present but unusable — fall through to localStorage */
      }
    }
    return new LocalStorageMessageBackend(storage, `${conversationKey(tenantId)}:${conversationId}`);
  };
}

function conversationKey(tenantId: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}:${tenantId}`;
}

/** Storage key for the tenant's conversation index (sidebar + active id). */
export function conversationIndexKey(tenantId: string): string {
  return `${CONVERSATION_INDEX_STORAGE_PREFIX}:${tenantId}`;
}

/** Storage key for the composer draft, scoped per tenant. */
export function draftKey(tenantId: string): string {
  return `${DRAFT_STORAGE_PREFIX}:${tenantId}`;
}

/** Persisted localStorage envelope: a schema version + the message array. */
interface MessageEnvelope {
  version: number;
  messages: UIMessage[];
}

/**
 * localStorage fallback. Stores the whole conversation as a versioned JSON
 * envelope (no incremental writes — that is IndexedDB's advantage), but still
 * carries a `schemaVersion` and runs migrations, and transparently upgrades the
 * legacy bare-array format written by earlier builds.
 */
export class LocalStorageMessageBackend implements MessageBackend {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key: string,
  ) {}

  async load(): Promise<UIMessage[]> {
    const raw = this.storage.getItem(this.key);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    // Legacy (pre-versioning) format: a bare UIMessage[] → treat as version 0.
    if (Array.isArray(parsed)) return migrateMessages(parsed as UIMessage[], 0);
    const envelope = parsed as Partial<MessageEnvelope>;
    if (!Array.isArray(envelope.messages)) return [];
    return migrateMessages(envelope.messages, envelope.version ?? 0);
  }

  async persist(delta: PersistDelta): Promise<void> {
    // Rebuild the ordered array from the delta's authoritative order + bodies.
    const existing = new Map((await this.load()).map((m) => [m.id, m]));
    for (const id of delta.removed) existing.delete(id);
    for (const m of delta.changed) existing.set(m.id, m);
    const messages = delta.order.map((id) => existing.get(id)).filter((m): m is UIMessage => !!m);
    const envelope: MessageEnvelope = { version: PERSISTENCE_SCHEMA_VERSION, messages };
    try {
      this.storage.setItem(this.key, JSON.stringify(envelope));
    } catch {
      /* quota exceeded / disabled — best-effort persistence */
    }
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

/**
 * Migrate a persisted message array from an older schema version up to
 * {@link PERSISTENCE_SCHEMA_VERSION}. Each step upgrades `v → v + 1` without
 * losing data; unknown steps pass through unchanged.
 */
export function migrateMessages(messages: UIMessage[], fromVersion: number): UIMessage[] {
  let result = messages;
  for (let v = fromVersion; v < PERSISTENCE_SCHEMA_VERSION; v++) {
    result = MESSAGE_MIGRATIONS[v]?.(result) ?? result;
  }
  return result;
}

/** version `n` → `n + 1` transforms. `0 → 1`: adopt versioning; shape unchanged. */
const MESSAGE_MIGRATIONS: Record<number, (messages: UIMessage[]) => UIMessage[]> = {
  0: (messages) => messages,
};

/** Options for {@link PersistenceManager}. */
export interface PersistenceManagerOptions {
  /** Key under which the composer draft is kept (synchronous storage). */
  draftStorageKey?: string;
  /** Key under which the conversation index is kept (synchronous storage). */
  indexStorageKey?: string;
  /**
   * Pre-multi-thread single-conversation backend to migrate history from on
   * first run. `null` when a custom backend is supplied (nothing to migrate).
   */
  legacyBackend?: MessageBackend | null;
}

/**
 * Persistence facade for the multi-thread store: the (small, synchronous)
 * session + conversation index live in a {@link StorageAdapter}; each
 * conversation's (potentially large) history lives in its own async
 * {@link MessageBackend}, created lazily by the backend factory and cached.
 */
export class PersistenceManager {
  private readonly backends = new Map<string, MessageBackend>();
  private readonly draftStorageKey: string;
  private readonly indexStorageKey: string;
  private readonly legacyBackend: MessageBackend | null;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly backendFactory: MessageBackendFactory,
    options: PersistenceManagerOptions = {},
  ) {
    this.draftStorageKey = options.draftStorageKey ?? DRAFT_STORAGE_PREFIX;
    this.indexStorageKey = options.indexStorageKey ?? CONVERSATION_INDEX_STORAGE_PREFIX;
    this.legacyBackend = options.legacyBackend ?? null;
  }

  private backendFor(conversationId: string): MessageBackend {
    let backend = this.backends.get(conversationId);
    if (!backend) {
      backend = this.backendFactory(conversationId);
      this.backends.set(conversationId, backend);
    }
    return backend;
  }

  loadSession(): Session | null {
    return readJson<Session>(this.storage, SESSION_STORAGE_KEY);
  }

  saveSession(session: Session): void {
    writeJson(this.storage, SESSION_STORAGE_KEY, session);
  }

  loadConversationIndex(): ConversationIndex | null {
    return readJson<ConversationIndex>(this.storage, this.indexStorageKey);
  }

  saveConversationIndex(index: ConversationIndex): void {
    writeJson(this.storage, this.indexStorageKey, index);
  }

  loadMessages(conversationId: string): Promise<UIMessage[]> {
    return this.backendFor(conversationId).load();
  }

  persistMessages(conversationId: string, delta: PersistDelta): Promise<void> {
    return this.backendFor(conversationId).persist(delta);
  }

  /** Delete one conversation's persisted history. */
  clearConversation(conversationId: string): Promise<void> {
    const backend = this.backendFor(conversationId);
    this.backends.delete(conversationId);
    return backend.clear();
  }

  /** Read the pre-multi-thread single-conversation history (for one-time migration). */
  loadLegacyMessages(): Promise<UIMessage[]> {
    return this.legacyBackend?.load() ?? Promise.resolve([]);
  }

  /** Drop the legacy single-conversation store once migrated. */
  clearLegacy(): Promise<void> {
    return this.legacyBackend?.clear() ?? Promise.resolve();
  }

  /** Read the persisted composer draft (empty string when none / unavailable). */
  loadDraft(): string {
    try {
      return this.storage.getItem(this.draftStorageKey) ?? '';
    } catch {
      return '';
    }
  }

  /** Persist the composer draft; an empty draft removes the record. */
  saveDraft(text: string): void {
    try {
      if (text) this.storage.setItem(this.draftStorageKey, text);
      else this.storage.removeItem(this.draftStorageKey);
    } catch {
      /* quota exceeded / disabled — best-effort persistence */
    }
  }
}

function readJson<T>(storage: StorageAdapter, key: string): T | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageAdapter, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded / disabled — best-effort persistence */
  }
}
