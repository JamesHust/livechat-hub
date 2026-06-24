import type { Session } from '@livechat-hub/shared';
import { createId } from './id';
import type { PersistenceManager } from './persistence';

/** Load an existing session for the tenant or create and persist a new one. */
export function resolveSession(
  persistence: PersistenceManager,
  tenantId: string,
  userId?: string,
): Session {
  const existing = persistence.loadSession();
  if (existing && existing.tenantId === tenantId) {
    return userId && existing.userId !== userId ? { ...existing, userId } : existing;
  }
  const session: Session = {
    sessionId: createId('sess'),
    tenantId,
    userId,
  };
  persistence.saveSession(session);
  return session;
}
