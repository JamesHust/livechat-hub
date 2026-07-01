/** Prefix applied to every theme CSS custom property: `--lch-primary`, etc. */
export const CSS_VAR_PREFIX = '--lch';

/** Attribute set on the Shadow DOM host element for styling hooks. */
export const HOST_ELEMENT_ID = 'livechat-hub-root';

/** localStorage key under which session identity is persisted. */
export const SESSION_STORAGE_KEY = 'livechat-hub:session';

/** localStorage key prefix for persisted conversations, per tenant. */
export const CONVERSATION_STORAGE_PREFIX = 'livechat-hub:conversation';

/** localStorage key prefix for the composer draft, per tenant. */
export const DRAFT_STORAGE_PREFIX = 'livechat-hub:draft';

/** localStorage key under which the end-user's chosen UI locale is persisted. */
export const LOCALE_STORAGE_KEY = 'livechat-hub:locale';

/** localStorage key under which the end-user's chosen color-scheme is persisted. */
export const THEME_STORAGE_KEY = 'livechat-hub:theme';

/** Default SSE path appended to `apiUrl` for opening an agent run. */
export const DEFAULT_RUN_PATH = '/agent/run';

export const DEFAULT_LOCALE = 'en' as const;

/** Reconnect/backoff defaults for the transport layer (milliseconds). */
export const TRANSPORT_DEFAULTS = {
  maxRetries: 5,
  baseRetryDelayMs: 500,
  maxRetryDelayMs: 10_000,
  /**
   * Abort and reconnect a stream that goes silent for this long (no bytes /
   * no heartbeat). `0` disables the idle watchdog. Backends should emit an SSE
   * comment ping (`:\n\n`) well under this interval to keep the stream alive.
   */
  idleTimeoutMs: 30_000,
} as const;

/** Schema version for persisted conversation records; bump on shape changes. */
export const PERSISTENCE_SCHEMA_VERSION = 1;
