import type { ColorScheme, ThemeOverrides } from './theme';

export type TransportKind = 'sse' | 'websocket';

export type Locale = 'en' | 'vi' | 'ja' | 'zh' | 'id';

/**
 * End-user-facing color-scheme choice. `'auto'` follows the OS
 * `prefers-color-scheme`. Distinct from the named `theme` (`'default'`/`'dark'`):
 * this is the runtime toggle surfaced in the widget's settings menu.
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * Resolves a user-attached file to a URL the backend can fetch. Deployments wire
 * this to their upload service; when absent, the widget inlines the file as a
 * `data:` URL so it still rides along inside the message JSON (fine for small
 * media / demos — see `fileToPart` in the UI layer).
 */
export type UploadFn = (file: File) => Promise<{ url: string; mimeType?: string }>;

/**
 * Supplies (or refreshes) the bearer token attached to every transport request.
 * Called immediately before each attempt — including reconnects and the retry
 * after {@link ResilienceConfig.onAuthError} — so a token refreshed out of band
 * is picked up automatically. Return `undefined` to send no `Authorization`.
 */
export type GetAuthToken = () => string | undefined | Promise<string | undefined>;

/**
 * Transport resilience hooks/tuning. Sensible defaults come from
 * `TRANSPORT_DEFAULTS`; override only what a deployment needs.
 */
export interface ResilienceConfig {
  /** @see GetAuthToken */
  getAuthToken?: GetAuthToken;
  /**
   * Invoked once when a run fails with `401`/`403`. Use it to refresh the
   * session (e.g. mint a new token) before the transport retries the request a
   * single time with a freshly fetched {@link getAuthToken}.
   */
  onAuthError?: (status: number) => void | Promise<void>;
  /** Max reconnect attempts before the run is reported `failed`. */
  maxRetries?: number;
  /** Reconnect a stream idle (no bytes/heartbeat) longer than this (ms). `0` disables. */
  idleTimeoutMs?: number;
}

/**
 * Public configuration accepted by the SDK. Intentionally free of any
 * AI-provider or framework concept — only transport endpoint + presentation.
 */
export interface LiveChatConfig {
  /** Base URL of the backend (e.g. `https://api.example.com`). */
  apiUrl: string;
  tenantId: string;
  /** Named theme to start with, or `'auto'` to follow the OS color scheme. */
  theme?: 'default' | 'dark' | 'auto';
  /** Fine-grained white-label token overrides applied on top of the theme. */
  themeOverrides?: ThemeOverrides;
  /** Force a color scheme regardless of theme name. */
  colorScheme?: ColorScheme;
  locale?: Locale;
  transport?: TransportKind;
  /** Opaque identity for the current end-user, forwarded to the backend. */
  userId?: string;
  /** Extra headers attached to every transport request. */
  headers?: Record<string, string>;
  /** Initial open/closed state of the launcher. */
  defaultOpen?: boolean;
  /**
   * Let the end-user drag the launcher bubble to either side of the screen
   * (snapping to the nearest edge, position persisted). Defaults to `true`.
   */
  draggable?: boolean;
  /** Greeting / placeholder copy overrides. */
  strings?: Partial<Record<string, string>>;
  /**
   * Resolves user attachments to fetchable URLs. Omit to inline files as
   * `data:` URLs (no upload backend required).
   */
  uploadFile?: UploadFn;
  /**
   * Streaming resilience: auth-token refresh + reconnect/idle tuning. The
   * transport reconnects dropped SSE streams with exponential backoff and
   * resumes them via `Last-Event-ID`; these hooks/knobs steer that behavior.
   */
  resilience?: ResilienceConfig;
}
