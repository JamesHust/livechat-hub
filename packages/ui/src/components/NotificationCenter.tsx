import { useEffect } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconChecks, IconX } from '@tabler/icons-react';
import type { AppNotification } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { formatDayLabel, formatTime } from '../lib/format';
import { ITEM_TRANSITION, PANEL_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  /** Jump to a message/conversation from a clicked notification. */
  onJump: (conversationId: string, messageId?: string) => void;
}

/**
 * The in-widget notification center (bell inbox), a sheet over the panel. Lists
 * recent replies/events the store derived from the message stream (no bespoke
 * protocol event); clicking one jumps to the message and marks it read. Slides
 * in from the right; fades under reduced motion. Escape closes it.
 */
export function NotificationCenter({ open, onClose, onJump }: NotificationCenterProps) {
  return (
    <AnimatePresence>
      {open && <NotificationSheet onClose={onClose} onJump={onJump} />}
    </AnimatePresence>
  );
}

function NotificationSheet({
  onClose,
  onJump,
}: {
  onClose: () => void;
  onJump: NotificationCenterProps['onJump'];
}) {
  const { t, store, locale } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const notifications = useChatStore((s) => s.notifications);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const hasUnread = notifications.some((n) => !n.read);
  const dayLabels = { today: t('message.today'), yesterday: t('message.yesterday') };

  const activate = (notification: AppNotification) => {
    store.getState().markNotificationRead(notification.id);
    onJump(notification.conversationId, notification.messageId);
    onClose();
  };

  return (
    <m.div
      role="dialog"
      aria-label={t('notify.title')}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      transition={PANEL_TRANSITION}
      className="bg-background absolute inset-0 z-20 flex flex-col"
    >
      <header className="bg-card flex items-center gap-2 px-4 py-3 shadow-[var(--lch-shadow-sm)]">
        <p className="m-0 flex-1 truncate font-semibold tracking-tight">{t('notify.title')}</p>
        {hasUnread && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => store.getState().markAllNotificationsRead()}
            aria-label={t('notify.markAllRead')}
            title={t('notify.markAllRead')}
            className={cn('text-muted-foreground', chromeButton)}
          >
            <IconChecks className={chromeIcon} aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('notify.close')}
          className={cn('text-muted-foreground', chromeButton)}
        >
          <IconX className={chromeIcon} aria-hidden="true" />
        </Button>
      </header>

      {notifications.length === 0 ? (
        <NotificationsEmpty title={t('notify.empty')} body={t('notify.emptyBody')} />
      ) : (
        <ul
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2"
          data-slot="message-list"
        >
          <AnimatePresence initial={false}>
            {notifications.map((notification) => (
              <m.li
                key={notification.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={ITEM_TRANSITION}
              >
                <button
                  type="button"
                  onClick={() => activate(notification)}
                  aria-label={t('notify.jumpTo')}
                  className={cn(
                    'focus-visible:ring-ring/60 flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2',
                    notification.read ? 'hover:bg-muted/60' : 'bg-primary/5 hover:bg-primary/10',
                  )}
                >
                  {/* Unread dot (accent) — a fixed slot so read rows stay aligned. */}
                  <span className="flex w-2 shrink-0 justify-center pt-1.5">
                    {!notification.read && (
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: 'var(--lch-primary)' }}
                        className="size-2 rounded-full"
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          notification.read
                            ? 'text-foreground font-medium'
                            : 'text-foreground font-semibold',
                        )}
                      >
                        {notification.title || t('notify.newReply')}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {relativeTime(locale, notification.createdAt, dayLabels)}
                      </span>
                    </span>
                    {notification.body && (
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        {notification.body}
                      </span>
                    )}
                  </span>
                </button>
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </m.div>
  );
}

/** Time-of-day for today's items, otherwise a short day label. */
function relativeTime(
  locale: string,
  epochMs: number,
  dayLabels: { today: string; yesterday: string },
): string {
  const label = formatDayLabel(locale, epochMs, dayLabels);
  return label === dayLabels.today ? formatTime(locale, epochMs) : label;
}

/** Empty-state spot illustration — hand-authored in the Tabler house style. */
function NotificationsEmpty({ title, body }: { title: string; body: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={PANEL_TRANSITION}
      className="text-muted-foreground m-auto flex flex-col items-center gap-3 px-8 text-center"
    >
      <svg
        viewBox="0 0 96 96"
        className="text-primary size-20"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* A calm bell — no pending alerts. */}
        <path d="M32 42a16 16 0 0 1 32 0c0 14 6 20 6 20H26s6-6 6-20z" className="fill-primary/10" />
        <path d="M42 70a6 6 0 0 0 12 0" />
        <path d="M48 20v6" />
      </svg>
      <p className="text-foreground m-0 font-semibold">{title}</p>
      <p className="m-0 max-w-[15rem] text-sm">{body}</p>
    </m.div>
  );
}
