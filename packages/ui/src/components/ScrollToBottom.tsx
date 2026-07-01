import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconArrowDown } from '@tabler/icons-react';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';

export interface ScrollToBottomProps {
  /** Show the control (user has scrolled up from the latest message). */
  visible: boolean;
  /** Count of unread messages that arrived while scrolled up. */
  unread: number;
  onClick: () => void;
}

/**
 * Floating "jump to latest" control, shown when the user scrolls up from the
 * bottom of the list. Carries an unread badge. A `pointer-events-none` centering
 * wrapper lets the button own its own transform (so framer-motion's enter/exit
 * scale doesn't fight a Tailwind centering transform).
 */
export function ScrollToBottom({ visible, unread, onClick }: ScrollToBottomProps) {
  const { t } = useChatContext();
  const reduced = useReducedMotion() ?? false;
  const label =
    unread > 0 ? `${t('message.newMessages')} (${unread})` : t('message.scrollToBottom');

  return (
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <m.button
            key="scroll-to-bottom"
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
            transition={ITEM_TRANSITION}
            className="bg-card text-foreground pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[var(--lch-shadow)] backdrop-blur"
          >
            <IconArrowDown className="size-4" aria-hidden="true" />
            {unread > 0 && (
              <span className="bg-primary text-on-gradient min-w-4 rounded-full px-1 text-center text-[10px] leading-4 tabular-nums">
                {unread}
              </span>
            )}
          </m.button>
        </div>
      )}
    </AnimatePresence>
  );
}
