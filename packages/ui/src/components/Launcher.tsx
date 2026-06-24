import { IconX } from '@tabler/icons-react';
import { AnimatePresence, LazyMotion, m, useReducedMotion } from 'framer-motion';
import { useChatContext } from '../context';
import { useWidgetLayout } from '../hooks/use-widget-layout';
import { buttonVariants } from './ui/button';
import { cn } from '../lib/utils';
import { AgentMark } from './AgentMark';
import { domAnimation, ITEM_TRANSITION } from '../lib/motion';

export interface LauncherProps {
  open: boolean;
  onToggle: () => void;
}

export function Launcher({ open, onToggle }: LauncherProps) {
  const { t } = useChatContext();
  const layout = useWidgetLayout();
  const reduced = useReducedMotion() ?? false;
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
        aria-label={open ? t('launcher.close') : t('launcher.open')}
        aria-expanded={open}
        {...interaction}
        // Gradient fill (token-driven) + soft glow + glass hairline ring give the
        // launcher depth; the gradient paints over the variant's flat `bg-primary`.
        // `launcherStyle` carries the (draggable) position, overriding the
        // className anchor; when no layout provider is present it is empty.
        style={{ backgroundImage: 'var(--lch-gradient)', ...layout.launcherStyle }}
        className={cn(
          buttonVariants({ size: 'icon' }),
          "text-on-gradient ring-on-gradient/25 fixed right-5 bottom-5 z-[2147483000] size-14 rounded-full shadow-[var(--lch-shadow)] ring-1 ring-inset [&_svg:not([class*='size-'])]:size-7",
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
      </m.button>
    </LazyMotion>
  );
}
