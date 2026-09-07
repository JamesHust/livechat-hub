/**
 * Notification types — the in-widget notification center + the SDK's OS/desktop
 * notification bridge. These are **not** messages: a notification is a small,
 * independent record derived from the existing message stream (a completed
 * answer, a proactive nudge…), so it respects the canonical-schema invariant —
 * `UIMessage` / `MessagePart` are never redesigned to carry it.
 */

/**
 * One entry in the in-widget notification center (the bell inbox). Derived from
 * the message flow — never from a bespoke protocol event — so the frontend stays
 * provider-agnostic. Points back at the message/conversation so a click can jump
 * straight to it.
 */
export interface AppNotification {
  /** Stable id for this notification (own id space, unrelated to message ids). */
  id: string;
  /** Conversation the notification belongs to (for jump-to + per-thread read). */
  conversationId: string;
  /** Message that triggered it, when there is one (for scroll-to). */
  messageId?: string;
  /** Short headline (e.g. the conversation title or a generic "New reply"). */
  title: string;
  /** Optional preview of the content (hidden in OS notifications when private). */
  body?: string;
  /** Client clock (epoch ms) the notification was created. */
  createdAt: number;
  /** Whether the user has seen it (drives the bell badge count). */
  read: boolean;
}

/**
 * Host-tunable notification behavior (see {@link LiveChatConfig.notifications}).
 * Every channel defaults off/safe; a deployment opts in. The end-user can still
 * override the sound channel from the in-widget settings.
 */
export interface NotificationConfig {
  /** Fire an OS/desktop notification when a reply arrives while the tab is hidden. */
  desktop?: boolean;
  /** Play a short chime when a reply arrives while the widget isn't being viewed. */
  sound?: boolean;
  /** Show the unread count badge on the launcher. Defaults on. */
  badge?: boolean;
  /**
   * Include the message text in OS notifications. Defaults **off** for privacy —
   * OS notifications then read "You have a new message" with no content leak.
   */
  showPreview?: boolean;
  /**
   * URL of a custom chime to play instead of the built-in Web-Audio tone. Kept
   * small — the widget is partner-embedded and bundle/asset size is a KPI.
   */
  soundUrl?: string;
}
