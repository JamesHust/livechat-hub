import { useCallback } from 'react';
import { useChatContext, useChatStore } from '../context';

type State = Record<string, unknown>;

/**
 * Read and write the shared, bidirectional agent state. Returns
 * a `[state, setState]` tuple like `useState`: `state` is kept in sync with the
 * agent (it updates live as `STATE_SNAPSHOT` / `STATE_DELTA` events arrive), and
 * `setState` updates the frontend-owned view, which is forwarded to the agent on
 * the next run via `RunInput.state`.
 *
 * ```tsx
 * const [state, setState] = useCoAgentState<{ cart: string[] }>();
 * setState((prev) => ({ ...prev, cart: [...(prev.cart ?? []), id] }));
 * ```
 */
export function useCoAgentState<T extends State = State>(): readonly [
  T,
  (next: T | ((prev: T) => T)) => void,
] {
  const { store } = useChatContext();
  const state = useChatStore((s) => s.agentState) as T;

  const setState = useCallback(
    (next: T | ((prev: T) => T)) => {
      store.getState().setAgentState(next as State | ((prev: State) => State));
    },
    [store],
  );

  return [state, setState] as const;
}
