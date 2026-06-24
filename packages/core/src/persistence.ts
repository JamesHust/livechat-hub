import {
  CONVERSATION_STORAGE_PREFIX,
  SESSION_STORAGE_KEY,
  type Session,
  type UIMessage,
} from '@livechat-hub/shared';

/**
 * Storage abstraction so persistence works in the widget (localStorage),
 * the extension (chrome.storage can be adapted), tests (memory) or be disabled.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

export class PersistenceManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly tenantId: string,
  ) {}

  loadSession(): Session | null {
    return readJson<Session>(this.storage, SESSION_STORAGE_KEY);
  }

  saveSession(session: Session): void {
    writeJson(this.storage, SESSION_STORAGE_KEY, session);
  }

  private conversationKey(): string {
    return `${CONVERSATION_STORAGE_PREFIX}:${this.tenantId}`;
  }

  loadMessages(): UIMessage[] {
    return readJson<UIMessage[]>(this.storage, this.conversationKey()) ?? [];
  }

  saveMessages(messages: UIMessage[]): void {
    writeJson(this.storage, this.conversationKey(), messages);
  }

  clear(): void {
    this.storage.removeItem(this.conversationKey());
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
