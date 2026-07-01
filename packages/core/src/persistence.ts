import {
  CONVERSATION_STORAGE_PREFIX,
  DRAFT_STORAGE_PREFIX,
  PERSISTENCE_SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
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

function conversationKey(tenantId: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}:${tenantId}`;
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

/**
 * Persistence facade: the (small, synchronous) session lives in a
 * {@link StorageAdapter}; the (potentially large) conversation lives in an
 * async {@link MessageBackend}.
 */
export class PersistenceManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly backend: MessageBackend,
    /** Key under which the composer draft is kept (synchronous storage). */
    private readonly draftStorageKey = DRAFT_STORAGE_PREFIX,
  ) {}

  loadSession(): Session | null {
    return readJson<Session>(this.storage, SESSION_STORAGE_KEY);
  }

  saveSession(session: Session): void {
    writeJson(this.storage, SESSION_STORAGE_KEY, session);
  }

  loadMessages(): Promise<UIMessage[]> {
    return this.backend.load();
  }

  persistMessages(delta: PersistDelta): Promise<void> {
    return this.backend.persist(delta);
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

  clear(): Promise<void> {
    this.saveDraft('');
    return this.backend.clear();
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
