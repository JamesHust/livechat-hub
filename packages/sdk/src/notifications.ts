import type { ChatStoreApi } from '@livechat-hub/core';
import { soundEnabled } from '@livechat-hub/ui';
import type { AppNotification, NotificationConfig, StringKey } from '@livechat-hub/shared';
import type { Emitter } from './emitter';
import { playChime } from './sound';

export interface NotificationControllerOptions {
  store: ChatStoreApi;
  emitter: Emitter;
  /** Live notification config (re-read so `updateConfig` takes effect at once). */
  getConfig: () => NotificationConfig | undefined;
  /** Whether the chat panel is currently open (a "viewing" signal). */
  isPanelOpen: () => boolean;
  /** Live translator (re-read so a runtime locale change localizes OS copy). */
  getTranslate: () => (key: StringKey) => string;
  /** Focus + open the panel on the right thread when an OS notification is clicked. */
  onActivate: (conversationId: string) => void;
}

function totalUnread(unread: Record<string, number>): number {
  let sum = 0;
  for (const n of Object.values(unread)) sum += n;
  return sum;
}

/**
 * The composition-root notification bridge (kept out of `core`, which must not
 * know about tabs, sound or the Notification API). It watches the store and,
 * when a reply arrives **while the user isn't looking** (panel closed or tab
 * hidden), plays the chime and raises an OS notification — and always mirrors
 * `unread` / `notification` to the emitter so a host can render its own UI.
 *
 * Every channel is opt-in via {@link NotificationConfig}; a host with its own
 * notification system sets `desktop: false` and handles the `notification` event
 * itself. Returns a teardown function.
 */
export function createNotificationController(options: NotificationControllerOptions): () => void {
  const { store, emitter, getConfig, isPanelOpen, getTranslate, onActivate } = options;

  // Seed from current state so persisted notifications don't re-alert on load.
  let lastNotificationId = store.getState().notifications[0]?.id ?? null;
  let lastUnreadTotal = totalUnread(store.getState().unread);

  const notViewing = (): boolean => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    return !isPanelOpen() || hidden;
  };

  const showOsNotification = (n: AppNotification, config: NotificationConfig): void => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const t = getTranslate();
    const title = n.title || t('notify.newReply');
    // Privacy: hide the message content unless the host opted into previews.
    const body = config.showPreview && n.body ? n.body : t('notify.newReplyBody');
    try {
      const notification = new Notification(title, { body, tag: n.conversationId });
      notification.onclick = () => {
        try {
          window.focus();
        } catch {
          /* focus may be blocked — the activate still runs */
        }
        onActivate(n.conversationId);
        notification.close();
      };
    } catch {
      /* construction can throw on some platforms — never break the stream */
    }
  };

  const maybeAlert = (n: AppNotification): void => {
    // Only alert when the reply arrived while the user wasn't actively viewing.
    if (!notViewing()) return;
    const config = getConfig() ?? {};
    if (soundEnabled(config.sound ?? false)) playChime(config.soundUrl);
    if (config.desktop !== false) showOsNotification(n, config);
  };

  const unsubscribe = store.subscribe((state) => {
    // Unread total → event (a host may render its own badge / tab title).
    const total = totalUnread(state.unread);
    if (total !== lastUnreadTotal) {
      lastUnreadTotal = total;
      emitter.emit('unread', { total });
    }

    // New notifications are prepended (newest first). Collect everything ahead of
    // the last one we processed, emit each (oldest → newest), and alert once for
    // the newest so a burst never fires a stack of OS notifications.
    const list = state.notifications;
    if (list.length === 0) {
      lastNotificationId = null;
      return;
    }
    if (list[0]!.id === lastNotificationId) return;
    const fresh: AppNotification[] = [];
    for (const n of list) {
      if (n.id === lastNotificationId) break;
      fresh.push(n);
    }
    lastNotificationId = list[0]!.id;
    for (let i = fresh.length - 1; i >= 0; i--) emitter.emit('notification', fresh[i]!);
    if (fresh[0]) maybeAlert(fresh[0]);
  });

  return unsubscribe;
}
