/**
 * Public entry point for **LiveChat Hub** — the AI-provider-agnostic live chat
 * widget. Consumers embed the built `livechat-sdk.js` bundle and call
 * {@link LiveChatHub.init} to mount the widget into a Shadow DOM. Everything the
 * host page needs is re-exported here; internals stay private.
 *
 * @packageDocumentation
 */
import { mountWidget, type MountOptions, type UpdatableConfig, type WidgetInstance } from './mount';
import type { EventName, WidgetEvents } from './emitter';
import type { TelemetryEvent, ThemeOverrides, UserIdentity } from '@livechat-hub/shared';

export type { MountOptions, WidgetInstance, UpdatableConfig };
export type { WidgetEvents, EventName } from './emitter';
export type {
  LiveChatConfig,
  UserIdentity,
  TelemetryEvent,
  AnalyticsConfig,
} from '@livechat-hub/shared';
export type { FrontendAction, FrontendActionHandler, ContextProvider } from '@livechat-hub/core';
export type {
  GenerativeComponent,
  GenerativeComponentProps,
  GenerativeComponentMap,
} from '@livechat-hub/renderers';

/**
 * The most-recently-initialized widget instance. The singleton convenience
 * methods on {@link LiveChatHub} (`open`, `sendMessage`, `identify`, …) target
 * it, which is what lets the async loader snippet replay a queued command like
 * `LiveChatHub.open()` without holding the instance handle.
 */
let current: WidgetInstance | null = null;
const noop = (): void => {};

/**
 * Public SDK surface. Designed so consumers need zero React knowledge. Beyond
 * {@link LiveChatHub.init}, the imperative instance methods are mirrored here as
 * singleton helpers that act on the active widget — the Intercom/Segment DX:
 *
 * ```html
 * <script src="livechat-sdk.js"></script>
 * <script>
 *   LiveChatHub.init({ apiUrl: 'https://api.example.com', tenantId: 't1' });
 *   LiveChatHub.identify({ userId: 'u1', name: 'Ada' });
 *   LiveChatHub.open();
 * </script>
 * ```
 *
 * For non-blocking embedding, use the async loader snippet (see the README):
 * calls made before the script finishes loading are queued and replayed here.
 */
export const LiveChatHub = {
  /** Bootstrap, mount into a Shadow DOM, and return the instance handle. */
  init(options: MountOptions): WidgetInstance {
    if (typeof document === 'undefined') {
      throw new Error('LiveChatHub.init must run in a browser environment');
    }
    current = mountWidget(options);
    return current;
  },
  /** Open the active widget's panel. No-op before `init`. */
  open(): void {
    current?.open();
  },
  /** Close the active widget's panel. No-op before `init`. */
  close(): void {
    current?.close();
  },
  /** Toggle the active widget's panel. No-op before `init`. */
  toggle(): void {
    current?.toggle();
  },
  /** Whether the active widget's panel is open (`false` before `init`). */
  isOpen(): boolean {
    return current?.isOpen() ?? false;
  },
  /** Send a message through the active widget. No-op before `init`. */
  sendMessage(text: string): void {
    current?.sendMessage(text);
  },
  /** Switch the active widget's color scheme + token overrides. */
  setTheme(theme: 'default' | 'dark' | 'auto', overrides?: ThemeOverrides): void {
    current?.setTheme(theme, overrides);
  },
  /** Set / update the end-user identity on the active widget. */
  identify(user: UserIdentity): void {
    current?.identify(user);
  },
  /** Inject a proactive assistant message into the active widget. */
  sendProactiveMessage(text: string): void {
    current?.sendProactiveMessage(text);
  },
  /** Show the CSAT prompt on the active widget. */
  requestCsat(): void {
    current?.requestCsat();
  },
  /** Patch the active widget's presentation config at runtime. */
  updateConfig(patch: UpdatableConfig): void {
    current?.updateConfig(patch);
  },
  /** Subscribe to a lifecycle event on the active widget (no-op before `init`). */
  on<E extends EventName>(event: E, handler: (payload: WidgetEvents[E]) => void): () => void {
    return current?.on(event, handler) ?? noop;
  },
  /** Remove a lifecycle listener from the active widget. */
  off<E extends EventName>(event: E, handler: (payload: WidgetEvents[E]) => void): void {
    current?.off(event, handler);
  },
  /** Subscribe to every event (`{ name, payload }`) on the active widget. */
  onEvent(handler: (event: TelemetryEvent) => void): () => void {
    return current?.onEvent(handler) ?? noop;
  },
  /** Tear down the active widget and clear the singleton. */
  destroy(): void {
    current?.destroy();
    current = null;
  },
  /**
   * @internal Replay a command queue captured by the async loader snippet before
   * this script loaded. Each entry is `[methodName, argsArrayLike]`. Called by
   * the global bootstrap ({@link file://./global.ts}); not a stable API.
   */
  _flush(queue: Array<[string, ArrayLike<unknown>]>): void {
    for (const [method, args] of queue) {
      const fn = (this as Record<string, unknown>)[method];
      if (typeof fn === 'function') {
        (fn as (...a: unknown[]) => unknown).apply(this, Array.from(args));
      }
    }
  },
};

export type LiveChatHubApi = typeof LiveChatHub;
export default LiveChatHub;
