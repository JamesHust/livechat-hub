import { useEffect } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconMessagePlus, IconTrash, IconX } from '@tabler/icons-react';
import type { ConversationSummary } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { formatDayLabel } from '../lib/format';
import { ITEM_TRANSITION, PANEL_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export interface ConversationListProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Multi-thread sidebar, rendered as a sheet over the panel. Lists every
 * conversation (most-recent first), starts new ones, switches between them, and
 * deletes them — all driven by the headless store. Slides in from the left;
 * fades under reduced motion. Escape and picking a thread both close it.
 */
export function ConversationList({ open, onClose }: ConversationListProps) {
  return (
    <AnimatePresence>{open && <ConversationSheet onClose={onClose} />}</AnimatePresence>
  );
}

function ConversationSheet({ onClose }: { onClose: () => void }) {
  const { t, store, locale } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Most-recently-active thread first.
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const dayLabels = { today: t('message.today'), yesterday: t('message.yesterday') };

  const select = (id: string) => {
    store.getState().switchConversation(id);
    onClose();
  };
  const startNew = () => {
    store.getState().newConversation();
    onClose();
  };

  return (
    <m.div
      role="dialog"
      aria-label={t('conversation.title')}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
      transition={PANEL_TRANSITION}
      className="bg-background absolute inset-0 z-20 flex flex-col"
    >
      <header className="bg-card flex items-center gap-2 px-4 py-3 shadow-[var(--lch-shadow-sm)]">
        <p className="m-0 flex-1 truncate font-semibold tracking-tight">
          {t('conversation.title')}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('conversation.close')}
          className={cn('text-muted-foreground', chromeButton)}
        >
          <IconX className={chromeIcon} aria-hidden="true" />
        </Button>
      </header>

      <div className="p-3">
        <Button
          type="button"
          onClick={startNew}
          style={{ backgroundImage: 'var(--lch-gradient)' }}
          className={cn(
            'text-on-gradient w-full justify-center gap-2 rounded-full shadow-[var(--lch-shadow)]',
            'transition-transform hover:enabled:scale-[1.01] active:enabled:scale-[0.99]',
          )}
        >
          <IconMessagePlus className="size-4" aria-hidden="true" />
          {t('conversation.new')}
        </Button>
      </div>

      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-3" data-slot="message-list">
        <AnimatePresence initial={false}>
          {ordered.map((conversation) => (
            <m.li
              key={conversation.id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={ITEM_TRANSITION}
            >
              <ConversationRow
                conversation={conversation}
                active={conversation.id === activeId}
                label={conversation.title || t('conversation.untitled')}
                timeLabel={formatDayLabel(locale, conversation.updatedAt, dayLabels)}
                onSelect={() => select(conversation.id)}
                onDelete={() => store.getState().deleteConversation(conversation.id)}
                deleteLabel={t('conversation.delete')}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </m.div>
  );
}

interface ConversationRowProps {
  conversation: ConversationSummary;
  active: boolean;
  label: string;
  timeLabel: string;
  onSelect: () => void;
  onDelete: () => void;
  deleteLabel: string;
}

function ConversationRow({
  conversation,
  active,
  label,
  timeLabel,
  onSelect,
  onDelete,
  deleteLabel,
}: ConversationRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-xl transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className="focus-visible:ring-ring/60 flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {label}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px]">{timeLabel}</span>
        </span>
        {conversation.preview && (
          <span className="text-muted-foreground truncate text-xs">{conversation.preview}</span>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={deleteLabel}
        className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/60 mr-1 shrink-0 rounded-lg p-1.5 opacity-0 transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
      >
        <IconTrash className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
