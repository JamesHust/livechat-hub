import { IconX } from '@tabler/icons-react';
import { AnimatePresence, LazyMotion, m, useReducedMotion } from 'framer-motion';
import { useChatContext, useChatStore } from '../context';
import { useWidgetLayout } from '../hooks/use-widget-layout';
import { buttonVariants } from './ui/button';
import { cn } from '../lib/utils';
import { AgentMark } from './AgentMark';
import { domAnimation, ITEM_TRANSITION } from '../lib/motion';

export interface LauncherProps {
  open: boolean;
  onToggle: () => void;
}

/** Sum every conversation's unread count into the single launcher badge total. */
function totalUnread(unread: Record<string, number>): number {
  let sum = 0;
  for (const n of Object.values(unread)) sum += n;
  return sum;
}

export function Launcher({ open, onToggle }: LauncherProps) {
  const { t, notifications } = useChatContext();
  const layout = useWidgetLayout();
  const reduced = useReducedMotion() ?? false;
  // Unread badge: shown on the closed launcher when replies arrived while the
  // user wasn't looking. Cleared once the panel opens (the chat marks the active
  // thread read). Host can suppress the whole channel via `notifications.badge`.
  const unread = useChatStore((s) => totalUnread(s.unread));
  const showBadge = notifications.badge !== false && !open && unread > 0;
  const badgeLabel = unread > 99 ? '99+' : String(unread);
  const openLabel = showBadge
    ? `${t('launcher.open')}, ${t('notify.unreadCount').replace('{count}', String(unread))}`
    : t('launcher.open');
  // Micro-interactions are tactile, not informational — drop them entirely
  // when the user prefers reduced motion or while a drag is in progress (the
  // hover/tap springs would fight the pointer-driven position).
  const interaction =
    reduced || layout.isDragging ? {} : { whileHover: { scale: 1.06 }, whileTap: { scale: 0.92 } };

  // The fullscreen panel covers the viewport (including this corner); a floating
  // launcher would sit on top of the chat, so step aside. The in-panel header
  // close/exit-fullscreen controls take over.
  if (layout.isFullscreen) return null;

  return (
    <LazyMotion features={domAnimation}>
      <m.button
        type="button"
        // Swallow the click that trails a drag so dropping the bubble doesn't
        // also toggle the panel; a real tap falls through to `onToggle`.
        onClick={() => {
          if (layout.consumeDragClick()) return;
          onToggle();
        }}
        {...layout.launcherHandlers}
        aria-label={open ? t('launcher.close') : openLabel}
        aria-expanded={open}
        {...interaction}
        // Gradient fill (token-driven) + soft glow + glass hairline ring give the
        // launcher depth; the gradient paints over the variant's flat `bg-primary`.
        // `launcherStyle` carries the (draggable) position, overriding the
        // className anchor; when no layout provider is present it is empty.
        style={{ backgroundImage: 'var(--lch-gradient)', ...layout.launcherStyle }}
        className={cn(
          buttonVariants({ size: 'icon' }),
          "text-on-gradient ring-on-gradient/25 fixed right-5 bottom-5 z-[2147483000] size-14 rounded-full shadow-[var(--lch-shadow)] ring-1 ring-inset rtl:right-auto rtl:left-5 [&_svg:not([class*='size-'])]:size-7",
        )}
      >
        {/* Crossfade + quarter-turn between the open/close glyphs. */}
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={open ? 'close' : 'open'}
            initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 90 }}
            transition={ITEM_TRANSITION}
            className="inline-flex"
          >
            {open ? <IconX aria-hidden="true" /> : <AgentMark animated className="size-12" />}
          </m.span>
        </AnimatePresence>
        {/* Unread count badge — pops in on the closed launcher. Color is the
         * `--lch-danger` token on white so it reads on the blue gradient in both
         * schemes; `aria-hidden` because the count is already in the button label. */}
        <AnimatePresence>
          {showBadge && (
            <m.span
              key="badge"
              aria-hidden="true"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0 }}
              transition={ITEM_TRANSITION}
              style={{ backgroundColor: 'var(--lch-danger)' }}
              className="text-on-gradient ring-background absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold ring-2"
            >
              {badgeLabel}
            </m.span>
          )}
        </AnimatePresence>
      </m.button>
    </LazyMotion>
  );
}
