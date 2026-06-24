import { m, useReducedMotion } from 'framer-motion';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';
import { AgentAvatar } from './AgentAvatar';

/**
 * Spot illustration for the empty conversation box (see CLAUDE.md
 * "Illustrations"). Anchors the agent's gradient-glass identity with a localized
 * heading/body so the first impression isn't a bare line of text. Color flows
 * only through `--lch-*` tokens (via `AgentAvatar`'s gradient and the text
 * utilities), so it restyles live with `setTheme()`.
 */
export function EmptyState() {
  const { t } = useChatContext();
  const reduced = useReducedMotion() ?? false;
  return (
    <m.div
      className="m-auto flex max-w-[16rem] flex-col items-center gap-3 p-6 text-center"
      // Entrance only: fade/lift the first impression; instant under reduced
      // motion. No looping ambient motion — this sits idle until typed into.
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={ITEM_TRANSITION}
    >
      <AgentAvatar size="lg" animated />
      <p className="text-foreground m-0 text-base font-semibold tracking-tight">
        {t('state.emptyTitle')}
      </p>
      <p className="text-muted-foreground m-0 text-sm leading-relaxed">{t('state.empty')}</p>
    </m.div>
  );
}
