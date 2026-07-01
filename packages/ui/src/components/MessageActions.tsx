import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheck, IconCopy, IconRefresh, IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import type { UIMessage } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface MessageActionsProps {
  message: UIMessage;
  /** Whether this is the last message — only then is "regenerate" offered. */
  isLast: boolean;
}

/** Concatenated text of an assistant message, for the copy action. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n')
    .trim();
}

/**
 * Answer-level actions shown beneath a finished assistant message: copy the
 * text, rate it 👍/👎 (toggleable), and — on the latest answer — regenerate it.
 * Everything is keyboard-reachable (real buttons with localized labels) and
 * inherits the themed text color; no hard-coded colors.
 */
export function MessageActions({ message, isLast }: MessageActionsProps) {
  const { t, store, onFeedback } = useChatContext();
  const runBusy = useChatStore((s) => s.run.status === 'running' || s.run.status === 'interrupted');
  const feedback = message.metadata?.feedback;
  const text = messageText(message);

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (permissions / insecure context) — no-op */
    }
  };

  const rate = (value: 'up' | 'down') => {
    store.getState().setFeedback(message.id, value);
    onFeedback?.(message.id, feedback === value ? null : value, message);
  };

  return (
    <div className="flex items-center gap-0.5">
      {text && (
        <ActionButton
          label={copied ? t('message.copied') : t('message.copy')}
          active={copied}
          onClick={() => void copy()}
        >
          {copied ? (
            <IconCheck className="size-3.5" aria-hidden="true" />
          ) : (
            <IconCopy className="size-3.5" aria-hidden="true" />
          )}
        </ActionButton>
      )}
      <ActionButton
        label={t('message.feedbackUp')}
        active={feedback === 'up'}
        pressed={feedback === 'up'}
        onClick={() => rate('up')}
      >
        <IconThumbUp className="size-3.5" aria-hidden="true" />
      </ActionButton>
      <ActionButton
        label={t('message.feedbackDown')}
        active={feedback === 'down'}
        pressed={feedback === 'down'}
        onClick={() => rate('down')}
      >
        <IconThumbDown className="size-3.5" aria-hidden="true" />
      </ActionButton>
      {isLast && (
        <ActionButton
          label={t('message.regenerate')}
          disabled={runBusy}
          onClick={() => void store.getState().regenerate()}
        >
          <IconRefresh className="size-3.5" aria-hidden="true" />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  active,
  pressed,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  /** Visual highlight (themed accent). */
  active?: boolean;
  /** Emit `aria-pressed` — only for genuine toggles (feedback), not copy. */
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'text-muted-foreground hover:text-foreground size-6 rounded-md',
        active && 'text-primary hover:text-primary',
      )}
    >
      {children}
    </Button>
  );
}
