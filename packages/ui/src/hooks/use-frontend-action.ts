import { useEffect, useRef } from 'react';
import type { ContextProvider, FrontendAction } from '@livechat-hub/core';
import { useChatContext } from '../context';

/**
 * Register a frontend tool (a frontend action) the agent can invoke in the
 * browser, for the lifetime of the calling component. The handler is read
 * through a ref so it always sees fresh props/state without re-registering;
 * re-registration only happens when the advertised schema (`name`,
 * `description`, `parameters`) changes.
 *
 * ```tsx
 * useFrontendAction({
 *   name: 'navigate',
 *   description: 'Navigate the host page to a route',
 *   parameters: { type: 'object', properties: { path: { type: 'string' } } },
 *   handler: ({ path }) => { router.push(path as string); return { ok: true }; },
 * });
 * ```
 */
export function useFrontendAction(action: FrontendAction): void {
  const { store } = useChatContext();
  const ref = useRef(action);
  ref.current = action;

  useEffect(
    () =>
      store.getState().registerAction({
        name: action.name,
        description: action.description,
        parameters: action.parameters,
        handler: (args) => ref.current.handler(args),
      }),
    // Re-register only on schema changes; the handler is proxied via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, action.name, action.description, JSON.stringify(action.parameters ?? null)],
  );
}

/**
 * Expose a piece of live host-page context to the agent (an AG-UI "readable")
 * for the lifetime of the calling component. `get` is re-read on every run via
 * a ref, so the agent always receives the current value.
 *
 * ```tsx
 * useFrontendContext({ description: 'Current route', get: () => location.pathname });
 * ```
 */
export function useFrontendContext(provider: ContextProvider): void {
  const { store } = useChatContext();
  const ref = useRef(provider);
  ref.current = provider;

  useEffect(
    () =>
      store.getState().registerContext({
        description: provider.description,
        get: () => ref.current.get(),
      }),
    [store, provider.description],
  );
}
