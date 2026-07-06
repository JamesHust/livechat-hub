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
 * End-user identity supplied by the host page (Intercom-style `identify`).
 * Everything but `userId` is opaque, provider-agnostic annotation forwarded to
 * the agent for personalization; the frontend never interprets `traits`.
 */
export interface UserIdentity {
  /** Stable, opaque identifier for the end-user, forwarded to the backend. */
  userId?: string;
  /** Human-readable display name, if known. */
  name?: string;
  /** Contact email, if known. */
  email?: string;
  /** Free-form attributes (plan, locale, signup date, …) forwarded to the agent. */
  traits?: Record<string, unknown>;
}

/**
 * A single telemetry event surfaced to the host's analytics sink: the emitter
 * event `name` and its `payload`. Lets a deployment pipe widget lifecycle into
 * its own analytics/observability without knowing the emitter's internals.
 */
export interface TelemetryEvent {
  name: string;
  payload: unknown;
}

/**
 * Optional analytics / error-reporting sinks. `onEvent` receives **every**
 * lifecycle event the widget emits (open/close/message/run status/…); `onError`
 * is a convenience channel for run failures so hosts can wire error reporting
 * (Sentry, etc.) without filtering the event stream.
 */
export interface AnalyticsConfig {
  /** Called for every emitted lifecycle event. Never throw — it's swallowed. */
  onEvent?: (event: TelemetryEvent) => void;
  /** Called when a run fails, in addition to the `error` event. */
  onError?: (error: { message: string; code?: string }) => void;
}

/**
 * A proactive (triggered) greeting nudge — shown after the user has spent
 * `delayMs` on the page, without them opening the chat first. Host-driven; not
 * an agent run. Wire richer URL/scroll triggers with `sendProactiveMessage()`.
 */
export interface ProactiveConfig {
  /** The assistant message to inject (host copy — localize on your side). */
  message: string;
  /** Delay before showing it, in ms. Default ~5000. */
  delayMs?: number;
  /** Open the panel when the nudge fires (default: leave it to the launcher). */
  openOnShow?: boolean;
}

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
  /**
   * Full end-user identity (name / email / traits) for personalization,
   * forwarded to the agent. `user.userId` takes precedence over the flat
   * `userId` above; update it at runtime with `identify()`.
   */
  user?: UserIdentity;
  /** Analytics / error-reporting sinks. See {@link AnalyticsConfig}. */
  analytics?: AnalyticsConfig;
  /** A proactive/triggered greeting shown after a delay. See {@link ProactiveConfig}. */
  proactive?: ProactiveConfig;
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
   * Suggested prompts (quick replies) shown on the empty state; clicking one
   * sends it. Follow-up suggestions after an answer come from the agent via
   * shared state, independent of this list.
   */
  suggestions?: string[];
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
