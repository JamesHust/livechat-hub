import { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconStar, IconStarFilled } from '@tabler/icons-react';
import { useChatContext, useChatStore } from '../context';
import { ITEM_TRANSITION, errorVariants } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const STARS = [1, 2, 3, 4, 5];

/**
 * End-of-chat satisfaction (CSAT) prompt. Shown when the store's CSAT status is
 * `requested` (typically at the end of a chat / after a handoff wraps up); a
 * star rating + optional comment feed `submitCsat`, which hosts observe via the
 * `csat` emitter event. Collapses in/out; a thank-you replaces it on submit.
 */
export function CsatPrompt() {
  const { t, store } = useChatContext();
  const csat = useChatStore((s) => s.csat);
  const reduced = useReducedMotion() ?? false;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');

  const visible = csat.status === 'requested' || csat.status === 'submitted';
  const active = hover || rating;

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          variants={errorVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={ITEM_TRANSITION}
          className="overflow-hidden"
        >
          <div className="border-primary/30 bg-primary/5 mx-3 mb-2 flex flex-col gap-2 rounded-xl border p-3">
            {csat.status === 'submitted' ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-foreground m-0 text-sm font-medium">{t('csat.thanks')}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs"
                  onClick={() => store.getState().dismissCsat()}
                >
                  {t('csat.dismiss')}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-foreground m-0 text-sm font-semibold">{t('csat.title')}</p>
                <p className="text-muted-foreground m-0 text-xs">{t('csat.prompt')}</p>
                <div
                  role="radiogroup"
                  aria-label={t('csat.title')}
                  className="flex items-center gap-1"
                  onMouseLeave={() => setHover(0)}
                >
                  {STARS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${t('csat.rate')} ${n}`}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onFocus={() => setHover(n)}
                      className="focus-visible:ring-ring/60 rounded p-0.5 outline-none focus-visible:ring-2"
                    >
                      {active >= n ? (
                        <IconStarFilled className="text-primary size-6" aria-hidden="true" />
                      ) : (
                        <IconStar className="text-muted-foreground size-6" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('csat.commentPlaceholder')}
                  rows={2}
                  className="min-h-0 resize-none text-sm"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => store.getState().dismissCsat()}
                  >
                    {t('csat.dismiss')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={rating === 0}
                    style={{ backgroundImage: 'var(--lch-gradient)' }}
                    className={cn('text-on-gradient gap-1 rounded-full')}
                    onClick={() => store.getState().submitCsat(rating, comment)}
                  >
                    {t('csat.submit')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
