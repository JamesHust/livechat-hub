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
  /**
   * Gate the handler behind an explicit user confirmation before it runs. Use
   * for consequential actions (delete / purchase / send) so the agent can never
   * trigger them without a human "yes". When set, the store surfaces an approval
   * card (see {@link ChatState.actionConfirmations}) and only runs the handler
   * once the user approves; a rejection returns a declined result to the agent.
   */
  requireConfirmation?: boolean;
  /** Prompt shown on the confirmation card; falls back to a generic localized one. */
  confirmationMessage?: string;
  /**
   * Auto-deny the confirmation if the user doesn't answer within this many ms.
   * `0`/omitted waits indefinitely. Guards against a turn stuck on an unanswered
   * gate.
   */
  confirmationTimeoutMs?: number;
  /**
   * Abort the handler and return an error result if it runs longer than this
   * (ms). `0`/omitted lets it run unbounded.
   */
  timeoutMs?: number;
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
  /** Names of every currently-registered action (for reactive UI mirrors). */
  actionNames(): string[];
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

    actionNames() {
      return [...actions.keys()];
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
