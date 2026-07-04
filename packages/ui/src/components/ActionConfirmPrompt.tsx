import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconShieldCheck } from '@tabler/icons-react';
import type { ActionConfirmation } from '@livechat-hub/core';
import { useChatContext, useChatStore } from '../context';
import { Button } from './ui/button';
import { ITEM_TRANSITION, errorVariants } from '../lib/motion';
import { cn } from '../lib/utils';

/**
 * Frontend-action confirmation gate. A consequential browser action (delete,
 * purchase, send…) flagged `requireConfirmation` pauses here before its handler
 * runs; the user approves or declines and the turn continues. Shares the
 * interrupt gate's slide-in styling and collapses instantly under reduced
 * motion. This is the client-side sibling of the backend-driven
 * {@link InterruptPrompt}.
 */
export function ActionConfirmPrompt() {
  const confirmations = useChatStore((s) => s.actionConfirmations);
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {confirmations.length > 0 && (
        <m.div
          key="action-confirm"
          variants={errorVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={ITEM_TRANSITION}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-2">
            {confirmations.map((confirmation) => (
              <ConfirmCard key={confirmation.toolCallId} confirmation={confirmation} />
            ))}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Turn `set_page_background` into `Set page background` for the card title. */
function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ConfirmCard({ confirmation }: { confirmation: ActionConfirmation }) {
  const { t, store } = useChatContext();
  const message = confirmation.message ?? t('action.defaultMessage');
  const hasArgs = Object.keys(confirmation.args).length > 0;
  const answer = (approved: boolean) =>
    store.getState().confirmAction(confirmation.toolCallId, approved);

  return (
    <div
      role="group"
      aria-label={t('action.title')}
      className="border-primary/30 bg-primary/5 mx-3 mb-2 flex flex-col gap-2 rounded-xl border p-3"
    >
      <div className="text-foreground flex items-center gap-2 text-sm font-medium">
        <IconShieldCheck className="text-primary size-4 shrink-0" aria-hidden="true" />
        <span>{humanizeToolName(confirmation.toolName)}</span>
      </div>
      <p className="text-muted-foreground m-0 text-sm">{message}</p>
      {hasArgs && (
        <pre className="bg-muted/60 text-muted-foreground m-0 max-h-32 overflow-auto rounded-lg p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(confirmation.args, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => answer(true)}
          style={{ backgroundImage: 'var(--lch-gradient)' }}
          className={cn(
            'text-on-gradient flex-1 rounded-full shadow-[var(--lch-shadow)]',
            'transition-transform hover:enabled:scale-[1.02] active:enabled:scale-95',
          )}
        >
          {t('action.approve')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => answer(false)}
          className="flex-1 rounded-full"
        >
          {t('action.reject')}
        </Button>
      </div>
    </div>
  );
}
