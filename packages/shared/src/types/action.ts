/**
 * Wire shapes for frontend tools and host-page context. These are pure data
 * contracts shared between the transport request payload (`RunInput`) and the
 * `core` action registry, so they live in `shared` to stay layer-neutral —
 * neither package owns them, and `core`'s public API does not depend on
 * `transport` to reference them. Mirrors AG-UI's client-side tool / context
 * concepts (frontend "actions" / "readables").
 */

/**
 * A frontend-defined tool the agent may invoke. The handler runs in the browser
 * (on the host page), so only the serializable schema travels over the wire —
 * the implementation stays in `core`.
 */
export interface FrontendTool {
  /** Unique tool name the agent calls (matches a `TOOL_CALL_START.toolName`). */
  name: string;
  /** What the tool does — surfaced to the agent for selection. */
  description?: string;
  /** JSON Schema describing the tool's argument object. */
  parameters?: Record<string, unknown>;
}

/**
 * A piece of live context the host page exposes to the agent, e.g. the page the
 * user is viewing or the contents of their cart. Resolved fresh on every run.
 */
export interface ContextItem {
  /** Human-readable description of what `value` represents. */
  description: string;
  value: unknown;
}
