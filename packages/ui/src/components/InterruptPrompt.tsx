import { useState, type FormEvent } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconHandStop } from '@tabler/icons-react';
import type { InterruptResolution, RunInterrupt } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ITEM_TRANSITION, errorVariants } from '../lib/motion';
import { cn } from '../lib/utils';

/**
 * Human-in-the-loop gate. When the agent pauses a run for confirmation
 * (`run.status === 'interrupted'`), this renders the open interrupts above the
 * composer and resumes the run once every interrupt has been answered. Slides
 * in/out like the error bar; collapses instantly under reduced motion.
 */
export function InterruptPrompt() {
  const run = useChatStore((s) => s.run);
  const reduced = useReducedMotion() ?? false;
  const interrupts = run.status === 'interrupted' ? (run.interrupts ?? []) : [];

  return (
    <AnimatePresence>
      {interrupts.length > 0 && (
        <m.div
          key="interrupt"
          variants={errorVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={ITEM_TRANSITION}
          className="overflow-hidden"
        >
          <InterruptPanel interrupts={interrupts} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

function InterruptPanel({ interrupts }: { interrupts: RunInterrupt[] }) {
  const { t, store } = useChatContext();
  // Collect one answer per interrupt; resume only once all are addressed
  // (AG-UI requires every open interrupt to be resolved on resume).
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const answer = (id: string, value: unknown) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (interrupts.every((i) => i.id in next)) {
      const resolutions: InterruptResolution[] = interrupts.map((i) => ({
        id: i.id,
        value: next[i.id],
      }));
      void store.getState().resume(resolutions);
    }
  };

  return (
    <div
      role="group"
      aria-label={t('interrupt.title')}
      className="border-primary/30 bg-primary/5 mx-3 mb-2 flex flex-col gap-2 rounded-xl border p-3"
    >
      <div className="text-foreground flex items-center gap-2 text-sm font-medium">
        <IconHandStop className="text-primary size-4 shrink-0" aria-hidden="true" />
        <span>{t('interrupt.title')}</span>
      </div>
      {interrupts.map((interrupt) => (
        <InterruptItem
          key={interrupt.id}
          interrupt={interrupt}
          answered={interrupt.id in answers}
          onAnswer={(value) => answer(interrupt.id, value)}
        />
      ))}
    </div>
  );
}

function InterruptItem({
  interrupt,
  answered,
  onAnswer,
}: {
  interrupt: RunInterrupt;
  answered: boolean;
  onAnswer: (value: unknown) => void;
}) {
  const { t } = useChatContext();
  const [text, setText] = useState('');
  const message = interrupt.message ?? t('interrupt.defaultMessage');

  const submitInput = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || answered) return;
    onAnswer({ text: value });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground m-0 text-sm">{message}</p>
      {interrupt.value != null && (
        <pre className="bg-muted/60 text-muted-foreground m-0 max-h-32 overflow-auto rounded-lg p-2 text-xs whitespace-pre-wrap">
          {formatValue(interrupt.value)}
        </pre>
      )}

      {interrupt.kind === 'input' ? (
        <form className="flex items-center gap-2" onSubmit={submitInput}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={answered}
            placeholder={t('interrupt.inputPlaceholder')}
            aria-label={t('interrupt.inputPlaceholder')}
            className="bg-background h-9 flex-1 rounded-full text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={answered || text.trim().length === 0}
            aria-label={t('interrupt.submit')}
            style={{ backgroundImage: 'var(--lch-gradient)' }}
            className="text-on-gradient shrink-0 rounded-full shadow-[var(--lch-shadow)]"
          >
            {t('interrupt.submit')}
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={answered}
            onClick={() => onAnswer({ approved: true })}
            style={{ backgroundImage: 'var(--lch-gradient)' }}
            className={cn(
              'text-on-gradient flex-1 rounded-full shadow-[var(--lch-shadow)]',
              'transition-transform hover:enabled:scale-[1.02] active:enabled:scale-95',
            )}
          >
            {t('interrupt.approve')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={answered}
            onClick={() => onAnswer({ approved: false })}
            className="flex-1 rounded-full"
          >
            {t('interrupt.reject')}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
