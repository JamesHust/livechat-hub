import { IconAlertCircle, IconCheck, IconLoader2 } from '@tabler/icons-react';
import type { UIMessage } from '@livechat-hub/shared';
import { useChatContext } from '../context';
import { MessageActions } from './MessageActions';
import { formatTime } from '../lib/format';
import { cn } from '../lib/utils';

export interface MessageMetaProps {
  message: UIMessage;
  isUser: boolean;
  /** Whether this is the last message in the list (enables regenerate). */
  isLast: boolean;
  /** True while this message is the active streaming target. */
  isStreaming: boolean;
}

/**
 * The footer beneath a bubble: a locale-formatted timestamp plus role-specific
 * chrome — a delivery indicator (+ resend) for user messages, and copy /
 * feedback / regenerate actions for finished assistant answers.
 */
export function MessageMeta({ message, isUser, isLast, isStreaming }: MessageMetaProps) {
  const { locale } = useChatContext();
  const createdAt = message.metadata?.createdAt;
  const time = typeof createdAt === 'number' ? formatTime(locale, createdAt) : '';

  // Assistant actions only make sense once the answer has finished streaming.
  const showActions = !isUser && !isStreaming && message.parts.length > 0;
  if (!time && !isUser && !showActions) return null;

  return (
    <div
      className={cn(
        'text-muted-foreground flex items-center gap-1.5 px-1 text-[11px] leading-none',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {time && (
        <time className="tabular-nums" dateTime={new Date(createdAt as number).toISOString()}>
          {time}
        </time>
      )}
      {isUser && <UserStatus message={message} />}
      {showActions && <MessageActions message={message} isLast={isLast} />}
    </div>
  );
}

/** Delivery indicator for a user message: spinner → check, or a resend link. */
function UserStatus({ message }: { message: UIMessage }) {
  const { t, store } = useChatContext();
  const status = message.metadata?.status;

  if (status === 'sending') {
    return (
      <span className="inline-flex items-center" title={t('message.statusSending')}>
        <IconLoader2 className="size-3 animate-spin" aria-hidden="true" />
        <span className="sr-only">{t('message.statusSending')}</span>
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        className="text-destructive inline-flex items-center gap-1"
        title={t('message.statusFailed')}
      >
        <IconAlertCircle className="size-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{t('message.statusFailed')}</span>
        <button
          type="button"
          onClick={() => void store.getState().retryMessage(message.id)}
          className="hover:text-destructive/80 cursor-pointer underline underline-offset-2"
        >
          {t('message.resend')}
        </button>
      </span>
    );
  }

  // 'sent' (or legacy messages without a status): a subtle delivered check.
  return (
    <span className="inline-flex items-center" title={t('message.statusSent')}>
      <IconCheck className="size-3" aria-hidden="true" />
      <span className="sr-only">{t('message.statusSent')}</span>
    </span>
  );
}
