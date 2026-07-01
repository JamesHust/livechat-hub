import { PERSISTENCE_SCHEMA_VERSION, type UIMessage } from '@livechat-hub/shared';
import type { MessageBackend, PersistDelta } from './persistence';

/**
 * IndexedDB-backed conversation store. Unlike the localStorage fallback it
 * writes **one record per message**, so streaming a reply or appending to a
 * long history touches a single row instead of rewriting the whole array — the
 * key to staying under storage quotas on large conversations. The database
 * version doubles as the schema version, so structural migrations run in
 * `onupgradeneeded`.
 */

const DB_NAME = 'livechat-hub';
const STORE = 'messages';
const BY_CONVERSATION = 'byConversation';

interface MessageRecord {
  /** `${conversationId}::${messageId}` — unique primary key. */
  key: string;
  conversationId: string;
  id: string;
  /** Position in the conversation, for stable ordering on load. */
  order: number;
  message: UIMessage;
}

export function createIndexedDbMessageBackend(conversationId: string): MessageBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const getDb = (): Promise<IDBDatabase> => (dbPromise ??= openDb());
  const recordKey = (id: string): string => `${conversationId}::${id}`;

  return {
    async load(): Promise<UIMessage[]> {
      const db = await getDb();
      const tx = db.transaction(STORE, 'readonly');
      const records = await reqDone<MessageRecord[]>(
        tx.objectStore(STORE).index(BY_CONVERSATION).getAll(conversationId),
      );
      return records.sort((a, b) => a.order - b.order).map((r) => r.message);
    },

    async persist(delta: PersistDelta): Promise<void> {
      const db = await getDb();
      const orderIndex = new Map(delta.order.map((id, i) => [id, i] as const));
      await txDone(db, (store) => {
        for (const message of delta.changed) {
          store.put({
            key: recordKey(message.id),
            conversationId,
            id: message.id,
            order: orderIndex.get(message.id) ?? Number.MAX_SAFE_INTEGER,
            message,
          } satisfies MessageRecord);
        }
        for (const id of delta.removed) store.delete(recordKey(id));
      });
    },

    async clear(): Promise<void> {
      const db = await getDb();
      const readTx = db.transaction(STORE, 'readonly');
      const keys = await reqDone<IDBValidKey[]>(
        readTx.objectStore(STORE).index(BY_CONVERSATION).getAllKeys(conversationId),
      );
      await txDone(db, (store) => {
        for (const key of keys) store.delete(key);
      });
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, PERSISTENCE_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex(BY_CONVERSATION, 'conversationId', { unique: false });
      }
      // Future schema bumps transform existing records here, keyed on the
      // upgrade transaction's `oldVersion`.
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

/** Resolve/reject a single IDB request. */
function reqDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Run mutations in a readwrite transaction and resolve when it commits. */
function txDone(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    run(tx.objectStore(STORE));
  });
}
