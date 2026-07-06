/**
 * Live-chat lifecycle contracts (Sprint 5.1): presence, human agent handoff, and
 * end-of-chat satisfaction (CSAT).
 *
 * Presence and handoff are **backend-driven** and travel in the shared agent
 * state (`STATE_SNAPSHOT` / `STATE_DELTA`) under the well-known keys in
 * {@link LifecycleAgentState} — no bespoke protocol events, keeping the frontend
 * provider-agnostic (invariant #3). CSAT is client-driven and lives in the core
 * store.
 */

/** Availability of the agent / support team, shown as the header status dot. */
export type Presence = 'online' | 'away' | 'offline';

/** Lifecycle of an AI → human handoff. */
export type HandoffStatus = 'requested' | 'connected' | 'ended';

export interface HandoffState {
  status: HandoffStatus;
  /** Display name of the human agent once connected (e.g. "Mai"). */
  agentName?: string;
}

/** Well-known shared-agent-state keys the backend publishes to drive the UI. */
export interface LifecycleAgentState {
  presence?: Presence;
  handoff?: HandoffState;
}

/** The end-user's satisfaction rating submitted at the end of a chat. */
export interface CsatResult {
  /** 1–5 stars. */
  rating: number;
  /** Optional free-text comment. */
  comment?: string;
}

export type CsatStatus = 'idle' | 'requested' | 'submitted';

export interface CsatState {
  status: CsatStatus;
  /** Present once the user has submitted a rating. */
  result?: CsatResult;
}

/** Safely read presence from the (untyped) shared agent state; defaults `online`. */
export function readPresence(agentState: Record<string, unknown>): Presence {
  const value = agentState.presence;
  return value === 'away' || value === 'offline' || value === 'online' ? value : 'online';
}

/** Safely read a handoff state from the (untyped) shared agent state, if any. */
export function readHandoff(agentState: Record<string, unknown>): HandoffState | undefined {
  const value = agentState.handoff;
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== 'requested' && status !== 'connected' && status !== 'ended') return undefined;
  return {
    status,
    ...(typeof record.agentName === 'string' ? { agentName: record.agentName } : {}),
  };
}
