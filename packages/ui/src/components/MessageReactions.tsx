import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconMoodPlus } from '@tabler/icons-react';
import type { UIMessage } from '@livechat-hub/shared';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';

/** A small, curated quick-reaction set (a full emoji picker would be overkill). */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

export interface MessageReactionsProps {
  message: UIMessage;
  isUser: boolean;
}

/**
 * Emoji reactions on a message: the applied reactions as toggleable chips, plus
 * an "add reaction" affordance opening a compact quick-picker. Reactions live on
 * the message metadata (toggled in the headless store), so they persist. The
 * picker is a plain positioned element (Shadow-DOM-safe) closing on outside
 * pointer / Escape.
 */
export function MessageReactions({ message, isUser }: MessageReactionsProps) {
  const { t, store } = useChatContext();
  const reactions = message.metadata?.reactions ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const root = containerRef.current?.getRootNode() ?? document;
    const onDown = (e: Event) => {
      if (containerRef.current && !e.composedPath().includes(containerRef.current)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') setPickerOpen(false);
    };
    root.addEventListener('pointerdown', onDown, true);
    root.addEventListener('keydown', onKey, true);
    return () => {
      root.removeEventListener('pointerdown', onDown, true);
      root.removeEventListener('keydown', onKey, true);
    };
  }, [pickerOpen]);

  const toggle = (emoji: string) => {
    store.getState().toggleReaction(message.id, emoji);
    setPickerOpen(false);
  };

  // Nothing to show and (on hover) the add button — keep the row present only
  // when there are reactions, else the add button appears via group-hover below.
  const hasReactions = reactions.length > 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center gap-1',
        isUser ? 'flex-row-reverse' : 'flex-row',
        !hasReactions &&
          'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
      )}
    >
      {reactions.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => toggle(emoji)}
          aria-pressed="true"
          className="bg-primary/10 hover:bg-primary/20 focus-visible:ring-ring/60 rounded-full px-1.5 py-0.5 text-xs leading-none outline-none transition-colors focus-visible:ring-2"
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        aria-label={t('message.react')}
        aria-expanded={pickerOpen}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 flex size-5 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2"
      >
        <IconMoodPlus className="size-3.5" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {pickerOpen && (
          <m.div
            role="menu"
            aria-label={t('message.react')}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.9 }}
            transition={ITEM_TRANSITION}
            style={{ transformOrigin: 'bottom center' }}
            className={cn(
              'bg-popover absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border p-1 shadow-[var(--lch-shadow)]',
              isUser ? 'right-0' : 'left-0',
            )}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => toggle(emoji)}
                aria-pressed={reactions.includes(emoji)}
                className={cn(
                  'focus-visible:ring-ring/60 rounded-full p-1 text-base leading-none outline-none transition-transform focus-visible:ring-2 motion-safe:hover:scale-125',
                  reactions.includes(emoji) && 'bg-primary/10',
                )}
              >
                {emoji}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
