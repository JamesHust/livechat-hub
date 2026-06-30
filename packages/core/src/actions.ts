import type { ContextItem, FrontendTool } from '@livechat-hub/shared';

/**
 * Handler executed when the agent invokes a frontend tool. Receives the parsed
 * arguments object and returns the value sent back to the agent (anything
 * JSON-serializable). May be async.
 */
export type FrontendActionHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

/** A frontend tool advertised to the agent, plus its browser-side handler. */
export interface FrontendAction extends FrontendTool {
  handler: FrontendActionHandler;
}

/**
 * A live-context provider. `get` is called at the start of every run so the
 * value the agent sees is always current (the page the user is on, cart
 * contents, …). The host page owns the data; the widget only forwards it.
 */
export interface ContextProvider {
  description: string;
  get: () => unknown;
}

/**
 * Headless registry of frontend tools and context providers. Plain JavaScript
 * with no React — UI hooks and the SDK both register through it, and the store
 * reads it when assembling a `RunInput`. Each register call returns an
 * unregister function for symmetric teardown (effect cleanup, `destroy()`).
 */
export interface ActionRegistry {
  registerAction(action: FrontendAction): () => void;
  registerContext(provider: ContextProvider): () => void;
  getAction(name: string): FrontendAction | undefined;
  /** Serializable tool specs to advertise in `RunInput.tools`. */
  toolSpecs(): FrontendTool[];
  /** Resolve every context provider to a wire item for `RunInput.context`. */
  contextItems(): ContextItem[];
}

export function createActionRegistry(): ActionRegistry {
  const actions = new Map<string, FrontendAction>();
  const contexts = new Set<ContextProvider>();

  return {
    registerAction(action) {
      actions.set(action.name, action);
      return () => {
        // Only remove if this exact action still owns the slot, so a
        // re-registration under the same name isn't clobbered by stale cleanup.
        if (actions.get(action.name) === action) actions.delete(action.name);
      };
    },

    registerContext(provider) {
      contexts.add(provider);
      return () => void contexts.delete(provider);
    },

    getAction(name) {
      return actions.get(name);
    },

    toolSpecs() {
      return [...actions.values()].map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      }));
    },

    contextItems() {
      return [...contexts].map((c) => ({ description: c.description, value: c.get() }));
    },
  };
}
