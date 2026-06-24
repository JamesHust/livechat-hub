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
}
