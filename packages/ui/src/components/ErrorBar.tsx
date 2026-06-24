import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { useChatContext, useChatStore } from '../context';
import { Button } from './ui/button';
import { ITEM_TRANSITION, errorVariants } from '../lib/motion';

export function ErrorBar() {
  const { t, store } = useChatContext();
  const run = useChatStore((s) => s.run);
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {run.status === 'failed' && (
        <m.div
          variants={errorVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={ITEM_TRANSITION}
          // overflow-hidden so the height collapse reads cleanly on exit.
          className="overflow-hidden"
        >
          <div className="text-destructive flex items-center gap-1 px-3 pb-2 text-sm" role="alert">
            <span>{run.error?.message ?? t('state.error')}</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-primary h-auto p-0"
              onClick={() => void store.getState().retryLast()}
            >
              {t('state.retry')}
            </Button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
