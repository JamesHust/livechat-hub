import { createRoot, type Root } from 'react-dom/client';
import { createChatStore, type ContextProvider, type FrontendAction } from '@livechat-hub/core';
import { createSseTransport, createWebSocketTransport } from '@livechat-hub/transport';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import { ChatProvider } from '@livechat-hub/ui';
import {
  HOST_ELEMENT_ID,
  readHandoff,
  readPresence,
  type LiveChatConfig,
  type Presence,
  type RunStatus,
  type TelemetryEvent,
  type ThemeMode,
  type ThemeOverrides,
  type UserIdentity,
} from '@livechat-hub/shared';
import type { GenerativeComponentMap, RendererMap } from '@livechat-hub/renderers';
// `?inline` makes Vite return the compiled stylesheet as a string so we can
// inject it into the Shadow DOM instead of the document head. This is the
// Tailwind v4 + shadcn entry, compiled by `@tailwindcss/vite` at build time.
import baseCss from '@livechat-hub/ui/styles.css?inline';
import { WidgetShell } from './WidgetShell';
import { Emitter } from './emitter';

export interface MountOptions extends LiveChatConfig {
  /** Renderer overrides forwarded to the UI layer. */
  renderers?: RendererMap;
  /** Generative-UI components the agent may render by name (`canvas` parts). */
  components?: GenerativeComponentMap;
  /** Existing element to host the widget; defaults to a new <div> on body. */
  target?: HTMLElement;
  /** Frontend tools the agent may invoke in the browser, registered at mount. */
  actions?: FrontendAction[];
  /** Live host-page context providers forwarded to the agent on every run. */
  context?: ContextProvider[];
}

/**
 * Handle returned by {@link LiveChatHub.init}. The imperative surface a host
 * page uses to drive the widget — no React knowledge required.
 */
export interface WidgetInstance {
  /** Open the chat panel. No-op if already open. */
  open(): void;
  /** Close the chat panel. No-op if already closed. */
  close(): void;
  /** Toggle the panel between open and closed. */
  toggle(): void;
  /** Whether the panel is currently open. */
  isOpen(): boolean;
  /** Send a user message as if typed into the composer, starting a run. */
  sendMessage(text: string): void;
  /**
   * Switch the color scheme at runtime, optionally patching `--lch-*` token
   * overrides. Restyles the live widget without a re-init.
   */
  setTheme(theme: 'default' | 'dark' | 'auto', overrides?: ThemeOverrides): void;
  /**
   * Register a frontend tool the agent can call in the browser. Returns an
   * unregister function.
   */
  registerAction(action: FrontendAction): () => void;
  /** Register a live host-page context provider. Returns an unregister function. */
  registerContext(provider: ContextProvider): () => void;
  /**
   * Inject a proactive assistant message (a triggered greeting / nudge you fire
   * on your own URL/scroll/time logic). Appended client-side; starts no run.
   */
  sendProactiveMessage(text: string): void;
  /** Show the end-of-chat satisfaction (CSAT) prompt. Hosts observe `csat`. */
  requestCsat(): void;
  /**
   * Set / update the end-user identity at runtime (Intercom-style). Forwarded to
   * the agent on the next run; no re-init required. See {@link UserIdentity}.
   */
  identify(user: UserIdentity): void;
  /**
   * Patch presentation config at runtime without a re-init: `theme` /
   * `colorScheme` / `themeOverrides`, `locale`, `strings`, `suggestions`.
   * Transport-level fields (`apiUrl`, `tenantId`, `transport`) can't change live
   * and are ignored.
   */
  updateConfig(patch: UpdatableConfig): void;
  /** Unmount the widget, clear subscriptions, and remove the host element. */
  destroy(): void;
  /** Subscribe to a lifecycle event (`ready`, `open`, `message`, `error`, …). */
  on: Emitter['on'];
  /** Remove a previously registered event listener. */
  off: Emitter['off'];
  /**
   * Subscribe to **every** lifecycle event as `{ name, payload }` — the analytics
   * tap. Returns an unsubscribe function. Complements {@link LiveChatConfig.analytics}.
   */
  onEvent(handler: (event: TelemetryEvent) => void): () => void;
}

/**
 * The subset of {@link LiveChatConfig} that can be patched live via
 * {@link WidgetInstance.updateConfig}. Transport identity (`apiUrl`, `tenantId`,
 * `transport`) is fixed at mount and intentionally excluded.
 */
export type UpdatableConfig = Partial<Omit<LiveChatConfig, 'apiUrl' | 'tenantId' | 'transport'>>;

/** Seed the in-widget color-scheme toggle from the SDK's `theme`/`colorScheme`. */
function initialThemeMode(options: LiveChatConfig): ThemeMode {
  if (options.colorScheme) return options.colorScheme;
  if (options.theme === 'dark') return 'dark';
  if (options.theme === 'auto') return 'auto';
  return 'light';
}

export function mountWidget(options: MountOptions): WidgetInstance {
  const emitter = new Emitter();

  // Mutable presentation config: `updateConfig()` patches this and re-renders,
  // so locale / strings / suggestions / theme change live without a re-init.
  // Transport-level fields stay pinned to the original `options`.
  const config: MountOptions = { ...options };

  // Analytics tap: mirror every lifecycle event into the host's sink, and route
  // failures to the dedicated error channel. Wired before anything can emit.
  if (options.analytics?.onEvent) emitter.onAny(options.analytics.onEvent);

  // 1. Host element + Shadow DOM (style isolation from the host page).
  const host = options.target ?? document.createElement('div');
  host.setAttribute('data-livechat-hub', '');
  if (!options.target) document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // 2a. Load the widget's brand fonts (Plus Jakarta Sans + JetBrains Mono) into
  // the Shadow DOM so the glassmorphism type system renders correctly even when
  // the partner page hasn't loaded them; falls back to the token's system stack.
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
  shadow.appendChild(fontLink);

  // 2b. Inject the scoped stylesheet.
  const style = document.createElement('style');
  style.textContent = baseCss;
  shadow.appendChild(style);

  // 3. Themed root container.
  const root = document.createElement('div');
  root.className = 'lch-root';
  root.id = HOST_ELEMENT_ID;
  shadow.appendChild(root);

  const applyTheme = (name: 'default' | 'dark' | 'auto', overrides?: ThemeOverrides): void => {
    const theme = resolveTheme(name, config.colorScheme);
    applyThemeToElement(root, theme, overrides ?? config.themeOverrides);
  };
  applyTheme(config.theme ?? 'default');

  // 4. Transport + headless store. Resilience hooks (auth refresh, reconnect /
  // idle tuning) flow through to the transport; omitted knobs fall back to
  // `TRANSPORT_DEFAULTS`. The WebSocket transport can't set request headers, so
  // tenant/auth ride in the run payload (`RunInput.tenantId`, `token` frame).
  const transport =
    options.transport === 'websocket'
      ? createWebSocketTransport({
          url: options.apiUrl,
          getAuthToken: options.resilience?.getAuthToken,
          maxRetries: options.resilience?.maxRetries,
          idleTimeoutMs: options.resilience?.idleTimeoutMs,
        })
      : createSseTransport({
          apiUrl: options.apiUrl,
          headers: { ...options.headers, 'x-tenant-id': options.tenantId },
          getAuthToken: options.resilience?.getAuthToken,
          onAuthError: options.resilience?.onAuthError,
          maxRetries: options.resilience?.maxRetries,
          idleTimeoutMs: options.resilience?.idleTimeoutMs,
        });
  const store = createChatStore({
    transport,
    tenantId: options.tenantId,
    // `user.userId` (full identity) takes precedence over the flat `userId`.
    userId: options.user?.userId ?? options.userId,
  });

  // Seed the full end-user identity (name / email / traits) if supplied at boot.
  if (options.user) store.getState().identify(options.user);

  // Register frontend tools / context declared up front. Unregister functions
  // are dropped here — `destroy()` tears the whole store down anyway.
  options.actions?.forEach((action) => store.getState().registerAction(action));
  options.context?.forEach((provider) => store.getState().registerContext(provider));

  // 5. Bridge store changes to public events.
  let lastStatus: RunStatus = 'idle';
  let lastCount = store.getState().messages.length;
  let lastPresence: Presence = readPresence(store.getState().agentState);
  let lastHandoff = JSON.stringify(readHandoff(store.getState().agentState) ?? null);
  let lastCsatStatus = store.getState().csat.status;
  const unsubscribe = store.subscribe((state) => {
    if (state.run.status !== lastStatus) {
      lastStatus = state.run.status;
      emitter.emit('run:status', lastStatus);
      if (lastStatus === 'failed' && state.run.error) {
        const error = { message: state.run.error.message, code: state.run.error.code };
        emitter.emit('error', error);
        // Convenience error-reporting channel (Sentry, etc.) — the `error` event
        // above already flows through the analytics tap, so guard the payload
        // shape here rather than re-emitting.
        config.analytics?.onError?.(error);
      }
    }
    if (state.messages.length !== lastCount) {
      lastCount = state.messages.length;
      const last = state.messages[state.messages.length - 1];
      if (last) emitter.emit('message', last);
    }
    // Lifecycle: presence + handoff are published into the shared agent state by
    // the backend; surface transitions as public events for the host.
    const presence = readPresence(state.agentState);
    if (presence !== lastPresence) {
      lastPresence = presence;
      emitter.emit('presence', presence);
    }
    const handoff = readHandoff(state.agentState);
    const handoffKey = JSON.stringify(handoff ?? null);
    if (handoffKey !== lastHandoff) {
      lastHandoff = handoffKey;
      if (handoff) emitter.emit('handoff', handoff);
    }
    if (state.csat.status !== lastCsatStatus) {
      lastCsatStatus = state.csat.status;
      if (state.csat.status === 'submitted' && state.csat.result) {
        emitter.emit('csat', state.csat.result);
      }
    }
  });

  // 6. React render with controlled open state.
  let open = options.defaultOpen ?? false;
  const reactRoot: Root = createRoot(root);

  const render = (): void => {
    reactRoot.render(
      <ChatProvider
        store={store}
        renderers={config.renderers}
        components={config.components}
        locale={config.locale ?? 'en'}
        themeMode={initialThemeMode(config)}
        themeOverrides={config.themeOverrides}
        strings={config.strings}
        uploadFile={config.uploadFile}
        suggestions={config.suggestions}
        onFeedback={(messageId, value) => emitter.emit('feedback', { messageId, value })}
      >
        <WidgetShell
          open={open}
          onToggle={() => setOpen(!open)}
          onClose={() => setOpen(false)}
          draggable={config.draggable ?? true}
        />
      </ChatProvider>,
    );
  };

  const setOpen = (next: boolean): void => {
    if (open === next) return;
    open = next;
    render();
    emitter.emit(next ? 'open' : 'close', undefined);
  };

  render();
  queueMicrotask(() => emitter.emit('ready', undefined));

  // Proactive/triggered greeting: after a delay, inject an assistant nudge (a
  // time-on-page trigger). Cleared on destroy so it never fires post-teardown.
  let proactiveTimer: ReturnType<typeof setTimeout> | undefined;
  if (options.proactive?.message) {
    const { message, delayMs = 5000, openOnShow } = options.proactive;
    proactiveTimer = setTimeout(() => {
      store.getState().addProactiveMessage(message);
      if (openOnShow) setOpen(true);
    }, delayMs);
  }

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    sendMessage: (text) => void store.getState().sendMessage(text),
    setTheme: applyTheme,
    registerAction: (action) => store.getState().registerAction(action),
    registerContext: (provider) => store.getState().registerContext(provider),
    sendProactiveMessage: (text) => store.getState().addProactiveMessage(text),
    requestCsat: () => store.getState().requestCsat(),
    identify: (user) => {
      store.getState().identify(user);
      emitter.emit('identify', user);
    },
    updateConfig: (patch) => {
      // Transport-level fields are pinned at mount; strip them defensively so a
      // stray apiUrl/tenantId (e.g. from the untyped async-loader queue) can't
      // desync the live transport.
      const presentation = { ...patch } as Record<string, unknown>;
      delete presentation.apiUrl;
      delete presentation.tenantId;
      delete presentation.transport;
      Object.assign(config, presentation);
      // Theme changes restyle the live root immediately; everything else lands
      // via the re-render below (locale / strings / suggestions are props).
      if (
        'theme' in presentation ||
        'colorScheme' in presentation ||
        'themeOverrides' in presentation
      ) {
        applyTheme(config.theme ?? 'default');
      }
      const analytics = (presentation as UpdatableConfig).analytics;
      if (analytics?.onEvent) emitter.onAny(analytics.onEvent);
      render();
      emitter.emit('config', presentation);
    },
    onEvent: (handler) => emitter.onAny(handler),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    destroy: () => {
      if (proactiveTimer !== undefined) clearTimeout(proactiveTimer);
      unsubscribe();
      reactRoot.unmount();
      emitter.emit('destroy', undefined);
      emitter.clear();
      host.remove();
    },
  };
}
