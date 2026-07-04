import { useEffect, useRef, type KeyboardEvent } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { IconChevronDown, IconChevronUp, IconSearch, IconX } from '@tabler/icons-react';
import { useChatContext } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { cn } from '../lib/utils';
import { ITEM_TRANSITION } from '../lib/motion';
import { Button } from './ui/button';
import { Input } from './ui/input';

export interface MessageSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Number of matching messages. */
  matchCount: number;
  /** 0-based index of the match currently focused (ignored when `matchCount` is 0). */
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * In-conversation search bar. Slides in above the message list; the user types a
 * query, sees a match count, and steps through hits (which the list scrolls to
 * and highlights). Enter jumps to the next match, Shift+Enter the previous, and
 * Escape closes — mirroring a browser find bar. Collapses instantly under
 * reduced motion.
 */
export function MessageSearch({
  query,
  onQueryChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  onClose,
}: MessageSearchProps) {
  const { t } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const reduced = useReducedMotion() ?? false;
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the field as soon as the bar opens so the user can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchCount > 0) (e.shiftKey ? onPrev : onNext)();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;
  const countLabel = matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : hasQuery ? '0/0' : '';

  return (
    <m.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={ITEM_TRANSITION}
      className="bg-card/95 z-10 flex items-center gap-2 border-b px-3 py-2 backdrop-blur-xl"
    >
      <IconSearch className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="bg-background h-8 flex-1 rounded-full text-sm"
      />
      <span
        className="text-muted-foreground min-w-9 text-center text-xs tabular-nums"
        aria-live="polite"
      >
        {countLabel}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPrev}
        disabled={matchCount === 0}
        aria-label={t('search.previous')}
        className={cn('text-muted-foreground', chromeButton)}
      >
        <IconChevronUp className={chromeIcon} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={matchCount === 0}
        aria-label={t('search.next')}
        className={cn('text-muted-foreground', chromeButton)}
      >
        <IconChevronDown className={chromeIcon} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label={t('search.close')}
        className={cn('text-muted-foreground', chromeButton)}
      >
        <IconX className={chromeIcon} aria-hidden="true" />
      </Button>
    </m.div>
  );
}
