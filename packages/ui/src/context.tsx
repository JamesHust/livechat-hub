import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatStore } from '@livechat-hub/core';
import {
  availableLocales,
  createTranslator,
  LOCALE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type Locale,
  type MessageFeedback,
  type StringKey,
  type ThemeMode,
  type ThemeOverrides,
  type UIMessage,
  type UploadFn,
} from '@livechat-hub/shared';
import { applyThemeToElement, resolveTheme } from '@livechat-hub/themes';
import {
  resolveRenderers,
  type GenerativeComponentMap,
  type RendererMap,
} from '@livechat-hub/renderers';

export interface ChatContextValue {
  store: StoreApi<ChatStore>;
  renderers: Required<RendererMap>;
  /** Host-registered generative-UI components, keyed by name (may be empty). */
  components: GenerativeComponentMap;
  t: (key: StringKey) => string;
  /** The active UI locale. */
  locale: Locale;
  /** Switch the UI locale at runtime; persisted for returning users. */
  setLocale: (locale: Locale) => void;
  /** The active color-scheme choice (light / dark / follow-OS). */
  themeMode: ThemeMode;
  /** Switch the color scheme at runtime; persisted and applied live. */
  setThemeMode: (mode: ThemeMode) => void;
  /** Resolve a user-attached file to a fetchable URL (or `undefined` to inline). */
  uploadFile?: UploadFn;
  /** Static suggested prompts shown on the empty state (host-configured). */
  suggestions: string[];
  /**
   * Notified when the end-user rates an assistant answer. `value` is `null` when
   * a previous rating was toggled off. Hosts use it for analytics / retraining.
   */
  onFeedback?: (messageId: string, value: MessageFeedback | null, message: UIMessage) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (availableLocales as string[]).includes(value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/** Read a previously persisted choice, ignoring unavailable storage. */
function readStored<T>(key: string, guard: (v: unknown) => v is T): T | null {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    return guard(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode, sandboxed iframe) — ignore.
  }
}

/** Map the user-facing color-scheme choice to a concrete named theme. */
function themeNameForMode(mode: ThemeMode): 'default' | 'dark' | 'auto' {
  if (mode === 'light') return 'default';
  if (mode === 'dark') return 'dark';
  return 'auto';
}

export interface ChatProviderProps {
  store: StoreApi<ChatStore>;
  /** Optional renderer overrides merged over the defaults. */
  renderers?: RendererMap;
  /** Generative-UI components the agent may render by name (`canvas` parts). */
  components?: GenerativeComponentMap;
  /** Initial locale; a persisted user choice takes precedence over it. */
  locale?: Locale;
  /** Initial color scheme; a persisted user choice takes precedence over it. */
  themeMode?: ThemeMode;
  /** White-label token overrides layered on top of the active theme. */
  themeOverrides?: ThemeOverrides;
  /** Per-instance string overrides (white-label copy). */
  strings?: Partial<Record<string, string>>;
  /** Resolve user attachments to fetchable URLs; omit to inline as data URLs. */
  uploadFile?: UploadFn;
  /** Suggested prompts shown on the empty state; clicking one sends it. */
  suggestions?: string[];
  /** Called when the end-user rates an assistant answer. See {@link ChatContextValue.onFeedback}. */
  onFeedback?: (messageId: string, value: MessageFeedback | null, message: UIMessage) => void;
  children: ReactNode;
}

export function ChatProvider({
  store,
  renderers,
  components,
  locale: initialLocale = 'en',
  themeMode: initialThemeMode = 'auto',
  themeOverrides,
  strings,
  uploadFile,
  suggestions,
  onFeedback,
  children,
}: ChatProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => readStored(LOCALE_STORAGE_KEY, isLocale) ?? initialLocale,
  );
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    () => readStored(THEME_STORAGE_KEY, isThemeMode) ?? initialThemeMode,
  );

  // `display: contents` anchor: owns no layout box, but lets us locate the themed
  // root the widget mounts under so the in-widget toggle re-applies `--lch-*` to
  // the SAME element the host seeded (the SDK's `.lch-root`, or `documentElement`
  // for the direct-mount apps) — a single source of truth, no override layering.
  const themeAnchorRef = useRef<HTMLSpanElement>(null);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStored(LOCALE_STORAGE_KEY, next);
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setThemeModeState(next);
    writeStored(THEME_STORAGE_KEY, next);
  }, []);

  // Apply the resolved theme to the host element, re-applying live when the OS
  // scheme changes while in `auto`. `useLayoutEffect` so a persisted choice that
  // differs from the host's initial seed lands before the first paint (no flash).
  useLayoutEffect(() => {
    const anchor = themeAnchorRef.current;
    if (!anchor) return;
    const host = anchor.closest<HTMLElement>('.lch-root') ?? anchor.ownerDocument.documentElement;
    const apply = () => {
      applyThemeToElement(host, resolveTheme(themeNameForMode(themeMode)), themeOverrides);
    };
    apply();
    if (themeMode !== 'auto' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode, themeOverrides]);

  const resolvedRenderers = useMemo(() => resolveRenderers(renderers), [renderers]);
  const resolvedComponents = useMemo<GenerativeComponentMap>(() => components ?? {}, [components]);
  const t = useMemo(() => createTranslator(locale, strings), [locale, strings]);
  const resolvedSuggestions = useMemo(() => suggestions ?? [], [suggestions]);

  const value = useMemo<ChatContextValue>(
    () => ({
      store,
      renderers: resolvedRenderers,
      components: resolvedComponents,
      t,
      locale,
      setLocale,
      themeMode,
      setThemeMode,
      uploadFile,
      suggestions: resolvedSuggestions,
      onFeedback,
    }),
    [
      store,
      resolvedRenderers,
      resolvedComponents,
      t,
      locale,
      setLocale,
      themeMode,
      setThemeMode,
      uploadFile,
      resolvedSuggestions,
      onFeedback,
    ],
  );

  return (
    <ChatContext.Provider value={value}>
      {/* Zero-box anchor used only to locate the themed root element. */}
      <span ref={themeAnchorRef} style={{ display: 'none' }} aria-hidden="true" />
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within a <ChatProvider>');
  return ctx;
}

/** Subscribe to a slice of the chat store. */
export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const { store } = useChatContext();
  return useStore(store, selector);
}

/** Access the imperative store actions without subscribing to state. */
export function useChatActions() {
  const { store } = useChatContext();
  const state = store.getState();
  return {
    sendMessage: state.sendMessage,
    abort: state.abort,
    retryLast: state.retryLast,
    retryMessage: state.retryMessage,
    regenerate: state.regenerate,
    setFeedback: state.setFeedback,
    clear: state.clear,
  };
}
