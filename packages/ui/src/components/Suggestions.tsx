import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';

export interface SuggestionsProps {
  /** Prompt strings to offer as chips. */
  suggestions: string[];
  /** Invoked with the chosen prompt when a chip is clicked. */
  onSelect: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A row of tappable suggestion chips (quick replies / suggested prompts). Chips
 * fade/lift in with a small stagger; instant under reduced motion. Colors flow
 * only through `--lch-*` tokens.
 */
export function Suggestions({ suggestions, onSelect, disabled, className }: SuggestionsProps) {
  const { t } = useChatContext();
  const reduced = useReducedMotion() ?? false;
  if (suggestions.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('suggestions.label')}
      className={cn('flex flex-wrap gap-2', className)}
    >
      <AnimatePresence initial={false}>
        {suggestions.map((suggestion, index) => (
          <m.button
            key={`${index}:${suggestion}`}
            type="button"
            layout={!reduced}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ ...ITEM_TRANSITION, delay: reduced ? 0 : index * 0.03 }}
            disabled={disabled}
            onClick={() => onSelect(suggestion)}
            className="border-border bg-background/60 text-foreground hover:border-primary hover:bg-primary/5 cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-50"
          >
            {suggestion}
          </m.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
