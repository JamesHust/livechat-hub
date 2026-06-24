import { useState, type FormEvent } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { IconArrowRight } from '@tabler/icons-react';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';
import { AgentAvatar } from './AgentAvatar';
import { Button } from './ui/button';
import { Input } from './ui/input';

/**
 * Guest onboarding step shown before the chat: collects a display name and
 * hands it to the store (`setGuestName`), which persists it so returning guests
 * skip straight to the conversation. Color flows only through `--lch-*` tokens.
 */
export function WelcomeScreen() {
  const { t, store } = useChatContext();
  const reduced = useReducedMotion() ?? false;
  const [name, setName] = useState('');

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    store.getState().setGuestName(trimmed);
  };

  return (
    <m.div
      className="bg-background flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={ITEM_TRANSITION}
    >
      <AgentAvatar size="lg" animated />
      <div className="space-y-1">
        <h2 className="text-foreground m-0 text-lg font-semibold tracking-tight">
          {t('welcome.title')}
        </h2>
        <p className="text-muted-foreground m-0 max-w-[16rem] text-sm leading-relaxed">
          {t('welcome.subtitle')}
        </p>
      </div>
      <form className="mt-2 flex w-full max-w-[18rem] flex-col gap-2" onSubmit={submit}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('welcome.namePlaceholder')}
          aria-label={t('welcome.namePlaceholder')}
          autoFocus
          autoComplete="name"
          enterKeyHint="go"
        />
        <Button
          type="submit"
          disabled={name.trim().length === 0}
          style={{ backgroundImage: 'var(--lch-gradient)' }}
          className="text-on-gradient h-10 w-full rounded-2xl shadow-[var(--lch-shadow)]"
        >
          {t('welcome.start')}
          <IconArrowRight aria-hidden="true" />
        </Button>
      </form>
    </m.div>
  );
}
