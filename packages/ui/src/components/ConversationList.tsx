import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
  IconArchive,
  IconArchiveOff,
  IconCheck,
  IconMessagePlus,
  IconPencil,
  IconPin,
  IconPinFilled,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import type { ConversationSummary, StringKey } from '@livechat-hub/shared';
import { orderConversations, searchConversations } from '@livechat-hub/core';
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
 * conversation (pinned first, then most-recent), starts new ones, switches,
 * renames, pins/archives, deletes and searches them — all driven by the headless
 * store. Slides in from the left; fades under reduced motion. Escape and picking
 * a thread both close it.
 */
export function ConversationList({ open, onClose }: ConversationListProps) {
  return <AnimatePresence>{open && <ConversationSheet onClose={onClose} />}</AnimatePresence>;
}

function ConversationSheet({ onClose }: { onClose: () => void }) {
  const { t, store, locale } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const reduced = useReducedMotion() ?? false;

  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  // The thread whose title is being edited inline (null = none).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Ids that matched a full-text (message-body) search across all threads. `null`
  // while idle / not yet resolved — the instant title+preview filter still runs.
  const [contentHits, setContentHits] = useState<Set<string> | null>(null);

  // Debounced deep search: matches message bodies in every thread (loads each
  // thread's history), unioned with the synchronous title/preview filter below.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setContentHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void store
        .getState()
        .searchConversationsFullText(q)
        .then((ids) => {
          if (!cancelled) setContentHits(new Set(ids));
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const archivedCount = conversations.filter((c) => c.archived).length;
  // Filter by the query (title/preview instantly + message bodies once the deep
  // search resolves), then order (pinned first, recency after).
  const ordered = useMemo(() => {
    if (!query.trim()) return orderConversations(conversations, { showArchived });
    const matched = new Set(searchConversations(conversations, query).map((c) => c.id));
    if (contentHits) for (const id of contentHits) matched.add(id);
    return orderConversations(
      conversations.filter((c) => matched.has(c.id)),
      { showArchived },
    );
  }, [conversations, query, contentHits, showArchived]);
  const dayLabels = { today: t('message.today'), yesterday: t('message.yesterday') };

  const select = (id: string) => {
    store.getState().switchConversation(id);
    onClose();
  };
  const startNew = () => {
    store.getState().newConversation();
    onClose();
  };
  const submitRename = (id: string, title: string) => {
    store.getState().renameConversation(id, title);
    setEditingId(null);
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

      <div className="flex flex-col gap-2 p-3">
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
        {/* List-level search — filters by title + latest-message preview. */}
        <div className="relative">
          <IconSearch
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('conversation.search')}
            aria-label={t('conversation.search')}
            className="bg-secondary text-foreground placeholder:text-muted-foreground focus-visible:ring-ring/60 w-full rounded-full py-2 pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
          />
        </div>
      </div>

      {ordered.length === 0 ? (
        query.trim() ? (
          <p className="text-muted-foreground m-auto px-8 py-10 text-center text-sm">
            {t('conversation.noResults')}
          </p>
        ) : (
          <ConversationsEmpty
            title={t('conversation.emptyTitle')}
            body={t('conversation.emptyBody')}
          />
        )
      ) : (
        <ul
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-3"
          data-slot="message-list"
        >
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
                  editing={editingId === conversation.id}
                  label={conversation.title || t('conversation.untitled')}
                  timeLabel={formatDayLabel(locale, conversation.updatedAt, dayLabels)}
                  t={t}
                  onSelect={() => select(conversation.id)}
                  onStartRename={() => setEditingId(conversation.id)}
                  onSubmitRename={(title) => submitRename(conversation.id, title)}
                  onCancelRename={() => setEditingId(null)}
                  onTogglePin={() =>
                    store.getState().pinConversation(conversation.id, !conversation.pinned)
                  }
                  onToggleArchive={() =>
                    store.getState().archiveConversation(conversation.id, !conversation.archived)
                  }
                  onDelete={() => store.getState().deleteConversation(conversation.id)}
                />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          aria-pressed={showArchived}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex shrink-0 items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2"
        >
          <IconArchive className="size-3.5" aria-hidden="true" />
          {showArchived ? t('conversation.hideArchived') : t('conversation.showArchived')}
        </button>
      )}
    </m.div>
  );
}

interface ConversationRowProps {
  conversation: ConversationSummary;
  active: boolean;
  editing: boolean;
  label: string;
  timeLabel: string;
  t: (key: StringKey) => string;
  onSelect: () => void;
  onStartRename: () => void;
  onSubmitRename: (title: string) => void;
  onCancelRename: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

function ConversationRow({
  conversation,
  active,
  editing,
  label,
  timeLabel,
  t,
  onSelect,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: ConversationRowProps) {
  if (editing) {
    return (
      <RenameRow
        initialValue={conversation.title ?? ''}
        t={t}
        onSubmit={onSubmitRename}
        onCancel={onCancelRename}
      />
    );
  }

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
          {conversation.pinned && (
            <IconPinFilled
              className="text-primary size-3 shrink-0 self-center"
              aria-hidden="true"
            />
          )}
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {label}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px]">{timeLabel}</span>
        </span>
        {conversation.preview && (
          <span className="text-muted-foreground truncate text-xs">{conversation.preview}</span>
        )}
      </button>
      {/* Hover/focus actions — pin, rename, archive, delete. */}
      <div className="mr-1 flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <RowAction
          onClick={onTogglePin}
          label={conversation.pinned ? t('conversation.unpin') : t('conversation.pin')}
        >
          {conversation.pinned ? (
            <IconPinFilled className="size-4" aria-hidden="true" />
          ) : (
            <IconPin className="size-4" aria-hidden="true" />
          )}
        </RowAction>
        <RowAction onClick={onStartRename} label={t('conversation.rename')}>
          <IconPencil className="size-4" aria-hidden="true" />
        </RowAction>
        <RowAction
          onClick={onToggleArchive}
          label={conversation.archived ? t('conversation.unarchive') : t('conversation.archive')}
        >
          {conversation.archived ? (
            <IconArchiveOff className="size-4" aria-hidden="true" />
          ) : (
            <IconArchive className="size-4" aria-hidden="true" />
          )}
        </RowAction>
        <RowAction onClick={onDelete} label={t('conversation.delete')} destructive>
          <IconTrash className="size-4" aria-hidden="true" />
        </RowAction>
      </div>
    </div>
  );
}

function RowAction({
  onClick,
  label,
  destructive,
  children,
}: {
  onClick: () => void;
  label: string;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'text-muted-foreground focus-visible:ring-ring/60 rounded-lg p-1.5 outline-none transition-colors focus-visible:ring-2',
        destructive ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Inline title editor shown in place of a row while renaming. */
function RenameRow({
  initialValue,
  t,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  t: ConversationRowProps['t'];
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  const commit = () => onSubmit(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
      className="bg-muted/60 flex items-center gap-1 rounded-xl py-1 pr-1 pl-3"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('conversation.renamePlaceholder')}
        aria-label={t('conversation.renamePlaceholder')}
        className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
      />
      <button
        type="submit"
        aria-label={t('conversation.renameSave')}
        className="text-primary hover:bg-primary/10 focus-visible:ring-ring/60 rounded-lg p-1.5 outline-none focus-visible:ring-2"
      >
        <IconCheck className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t('conversation.renameCancel')}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-lg p-1.5 outline-none focus-visible:ring-2"
      >
        <IconX className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}

/** Empty-state spot illustration — hand-authored in the Tabler house style. */
function ConversationsEmpty({ title, body }: { title: string; body: string }) {
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
        {/* Two overlapping speech bubbles — an empty thread list. */}
        <path
          d="M18 30a8 8 0 0 1 8-8h30a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H36l-12 10V54h-0a8 8 0 0 1-6-8z"
          className="fill-primary/10"
        />
        <path
          d="M70 40h4a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8h-2v10l-10-10H50a8 8 0 0 1-8-8"
          className="fill-primary/20"
        />
      </svg>
      <p className="text-foreground m-0 font-semibold">{title}</p>
      <p className="m-0 max-w-[15rem] text-sm">{body}</p>
    </m.div>
  );
}
