import { createRoot, type Root } from 'react-dom/client';
import { createChatStore, type ContextProvider, type FrontendAction } from '@livechat-hub/core';
import { createSseTransport } from '@livechat-hub/transport';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import { ChatProvider } from '@livechat-hub/ui';
import {
  HOST_ELEMENT_ID,
  type LiveChatConfig,
  type RunStatus,
  type ThemeMode,
  type ThemeOverrides,
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

export interface WidgetInstance {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  sendMessage(text: string): void;
  setTheme(theme: 'default' | 'dark' | 'auto', overrides?: ThemeOverrides): void;
  /**
   * Register a frontend tool the agent can call in the browser. Returns an
   * unregister function.
   */
  registerAction(action: FrontendAction): () => void;
  /** Register a live host-page context provider. Returns an unregister function. */
  registerContext(provider: ContextProvider): () => void;
  destroy(): void;
  on: Emitter['on'];
  off: Emitter['off'];
}

/** Seed the in-widget color-scheme toggle from the SDK's `theme`/`colorScheme`. */
function initialThemeMode(options: LiveChatConfig): ThemeMode {
  if (options.colorScheme) return options.colorScheme;
  if (options.theme === 'dark') return 'dark';
  if (options.theme === 'auto') return 'auto';
  return 'light';
}

export function mountWidget(options: MountOptions): WidgetInstance {
  const emitter = new Emitter();

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
    const theme = resolveTheme(name, options.colorScheme);
    applyThemeToElement(root, theme, overrides ?? options.themeOverrides);
  };
  applyTheme(options.theme ?? 'default');

  // 4. Transport + headless store. Resilience hooks (auth refresh, reconnect /
  // idle tuning) flow through to the SSE transport; omitted knobs fall back to
  // `TRANSPORT_DEFAULTS`.
  const transport = createSseTransport({
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
    userId: options.userId,
  });

  // Register frontend tools / context declared up front. Unregister functions
  // are dropped here — `destroy()` tears the whole store down anyway.
  options.actions?.forEach((action) => store.getState().registerAction(action));
  options.context?.forEach((provider) => store.getState().registerContext(provider));

  // 5. Bridge store changes to public events.
  let lastStatus: RunStatus = 'idle';
  let lastCount = store.getState().messages.length;
  const unsubscribe = store.subscribe((state) => {
    if (state.run.status !== lastStatus) {
      lastStatus = state.run.status;
      emitter.emit('run:status', lastStatus);
      if (lastStatus === 'failed' && state.run.error) {
        emitter.emit('error', { message: state.run.error.message });
      }
    }
    if (state.messages.length !== lastCount) {
      lastCount = state.messages.length;
      const last = state.messages[state.messages.length - 1];
      if (last) emitter.emit('message', last);
    }
  });

  // 6. React render with controlled open state.
  let open = options.defaultOpen ?? false;
  const reactRoot: Root = createRoot(root);

  const render = (): void => {
    reactRoot.render(
      <ChatProvider
        store={store}
        renderers={options.renderers}
        components={options.components}
        locale={options.locale ?? 'en'}
        themeMode={initialThemeMode(options)}
        themeOverrides={options.themeOverrides}
        strings={options.strings}
        uploadFile={options.uploadFile}
      >
        <WidgetShell
          open={open}
          onToggle={() => setOpen(!open)}
          onClose={() => setOpen(false)}
          draggable={options.draggable ?? true}
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

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    sendMessage: (text) => void store.getState().sendMessage(text),
    setTheme: applyTheme,
    registerAction: (action) => store.getState().registerAction(action),
    registerContext: (provider) => store.getState().registerContext(provider),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    destroy: () => {
      unsubscribe();
      reactRoot.unmount();
      emitter.emit('destroy', undefined);
      emitter.clear();
      host.remove();
    },
  };
}
