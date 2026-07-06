import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconHeadset, IconLoader2 } from '@tabler/icons-react';
import { readHandoff } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { ITEM_TRANSITION, errorVariants } from '../lib/motion';

/**
 * Human-agent handoff banner. Reads the backend-driven handoff state from the
 * shared agent state (no bespoke protocol events) and narrates the transition
 * from AI to a human teammate: connecting → connected (with their name) → ended.
 */
export function HandoffBanner() {
  const { t } = useChatContext();
  const handoff = readHandoff(useChatStore((s) => s.agentState));
  const reduced = useReducedMotion() ?? false;

  const message = !handoff
    ? null
    : handoff.status === 'requested'
      ? t('handoff.connecting')
      : handoff.status === 'connected'
        ? handoff.agentName
          ? t('handoff.connected').replace('{name}', handoff.agentName)
          : t('handoff.connectedGeneric')
        : t('handoff.ended');

  return (
    <AnimatePresence>
      {handoff && message && (
        <m.div
          variants={errorVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={ITEM_TRANSITION}
          className="overflow-hidden"
        >
          <div
            role="status"
            className="border-primary/30 bg-primary/5 text-foreground mx-3 mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
          >
            {handoff.status === 'requested' ? (
              <IconLoader2
                className="text-primary size-4 shrink-0 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <IconHeadset className="text-primary size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">{message}</span>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
