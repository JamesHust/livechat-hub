import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconClock, IconMoodSmile } from '@tabler/icons-react';
import { useChatContext } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { cn } from '../lib/utils';
import { ITEM_TRANSITION } from '../lib/motion';
import {
  EMOJI_CATEGORIES,
  pushRecentEmoji,
  readRecentEmojis,
  type EmojiCategory,
} from '../lib/emoji';
import { Button } from './ui/button';

export interface EmojiPickerProps {
  /** Called with the chosen glyph; the composer inserts it at the caret. */
  onSelect: (emoji: string) => void;
  /** Disable the trigger while the composer is busy (sending / recording). */
  disabled?: boolean;
}

const RECENT_ID = 'recent';

/**
 * Messenger-style emoji tray: a category-tabbed grid that inserts plain Unicode
 * glyphs into the composer. Built as a self-positioned popover (no Radix /
 * portal) so it lives inside the Shadow DOM — it closes on Escape and on a
 * pointer-down outside, detected via `composedPath()` across the shadow
 * boundary, mirroring {@link SettingsMenu}. The tray stays open after a pick so
 * several glyphs can be added in a row (as Messenger does).
 */
export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const { t } = useChatContext();
  const { actionButton, actionIcon } = useControlSize();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readRecentEmojis());
  const reduced = useReducedMotion() ?? false;

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Tabs in display order: "frequently used" (only when populated) then the
  // eight curated categories.
  const tabs: ReadonlyArray<{
    id: string;
    labelKey: EmojiCategory['labelKey'];
    Icon: EmojiCategory['Icon'];
  }> = [
    ...(recent.length > 0
      ? [{ id: RECENT_ID, labelKey: 'emoji.frequentlyUsed' as const, Icon: IconClock }]
      : []),
    ...EMOJI_CATEGORIES.map(({ id, labelKey, Icon }) => ({ id, labelKey, Icon })),
  ];
  const [active, setActive] = useState<string>(recent.length > 0 ? RECENT_ID : 'smileys');

  // Close on Escape / outside pointer, across the shadow boundary.
  useEffect(() => {
    if (!open) return;
    const root = containerRef.current?.getRootNode() ?? document;
    const onPointerDown = (e: Event) => {
      if (containerRef.current && !e.composedPath().includes(containerRef.current)) setOpen(false);
    };
    const onKeyDown = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') setOpen(false);
    };
    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('keydown', onKeyDown, true);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // Each open is a fresh content mount (scrollTop 0); align the active tab to the
  // first section. Runs only on the open edge — recents updating mid-open must
  // not yank the highlighted tab.
  useEffect(() => {
    if (open) setActive(recent.length > 0 ? RECENT_ID : 'smileys');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open edge only
  }, [open]);

  const handlePick = (emoji: string) => {
    onSelect(emoji);
    setRecent((prev) => pushRecentEmoji(emoji, prev));
  };

  const scrollToCategory = (id: string) => {
    setActive(id);
    const el = sectionRefs.current[id];
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: el.offsetTop, behavior: reduced ? 'auto' : 'smooth' });
    } else {
      scroller.scrollTop = el.offsetTop;
    }
  };

  // Highlight the tab for the section currently scrolled into view.
  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const y = scroller.scrollTop + 8;
    let current = tabs[0]?.id;
    for (const { id } of tabs) {
      const el = sectionRefs.current[id];
      if (el && el.offsetTop <= y) current = id;
    }
    if (current) setActive(current);
  };

  return (
    // Static wrapper: the popover is positioned against the composer footer
    // (the nearest positioned ancestor) so it spans the full chat width and
    // sits directly above the footer — not anchored to this small button.
    <div ref={containerRef} className="flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={t('composer.emoji')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn('text-muted-foreground shrink-0', actionButton)}
      >
        <IconMoodSmile className={actionIcon} aria-hidden="true" />
      </Button>

      <AnimatePresence>
        {open && (
          <m.div
            role="dialog"
            aria-label={t('composer.emoji')}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={ITEM_TRANSITION}
            style={{ transformOrigin: 'bottom center' }}
            className="bg-popover absolute inset-x-0 bottom-full z-30 mx-auto flex h-72 max-w-sm flex-col overflow-hidden rounded-t-2xl border-t shadow-[var(--lch-shadow)] backdrop-blur-xl"
          >
            <div
              ref={scrollRef}
              onScroll={onScroll}
              data-slot="emoji-scroll"
              // Horizontal + bottom padding only. A `padding-top` here would let
              // the grid peek through the gap above the `sticky top-0` section
              // headers, so the top inset is owned by each header instead.
              className="relative flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
            >
              {recent.length > 0 && (
                <Section
                  id={RECENT_ID}
                  label={t('emoji.frequentlyUsed')}
                  emojis={recent}
                  onPick={handlePick}
                  registerRef={(el) => {
                    sectionRefs.current[RECENT_ID] = el;
                  }}
                />
              )}
              {EMOJI_CATEGORIES.map((cat) => (
                <Section
                  key={cat.id}
                  id={cat.id}
                  label={t(cat.labelKey)}
                  emojis={cat.emojis}
                  onPick={handlePick}
                  registerRef={(el) => {
                    sectionRefs.current[cat.id] = el;
                  }}
                />
              ))}
            </div>

            <div className="flex shrink-0 items-center border-t px-1 py-1">
              {tabs.map(({ id, labelKey, Icon }) => {
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => scrollToCategory(id)}
                    aria-label={t(labelKey)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-lg py-2.5 transition-colors',
                      isActive
                        ? 'text-primary bg-secondary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SectionProps {
  id: string;
  label: string;
  emojis: readonly string[];
  onPick: (emoji: string) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

function Section({ id, label, emojis, onPick, registerRef }: SectionProps) {
  return (
    <div ref={registerRef} data-emoji-section={id} className="mb-1">
      {/* Subtle frosted section label — blurs the glyphs scrolling beneath it so
          it stays legible without a hard opaque bar. */}
      <p className="text-muted-foreground/80 bg-popover sticky top-0 z-10 m-0 px-1.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-md">
        {label}
      </p>
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            onClick={() => onPick(emoji)}
            className="hover:bg-accent flex aspect-square w-full items-center justify-center rounded-lg text-2xl leading-none transition-transform motion-safe:hover:scale-110 motion-safe:active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
