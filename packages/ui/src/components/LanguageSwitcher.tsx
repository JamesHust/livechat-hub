import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { availableLocales, localeNames } from '@livechat-hub/shared';
import { useChatContext } from '../context';
import { cn } from '../lib/utils';
import { LocaleFlag } from './LocaleFlag';

/**
 * Runtime UI-locale picker. Rendered as a styled WAI-ARIA radiogroup (flag +
 * native name + checkmark on the active one) rather than a native `<select>`:
 * the OS dropdown can't be themed, escapes the frosted-glass look, and on some
 * platforms paints opaque outside the Shadow DOM. Roving `tabIndex` + arrow
 * keys keep it as keyboard- and screen-reader-friendly as the `<select>` was.
 */
export function LanguageSwitcher() {
  const { t, locale, setLocale } = useChatContext();
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move focus and selection together (standard radiogroup behavior).
  const selectAt = (index: number) => {
    const count = availableLocales.length;
    const next = ((index % count) + count) % count;
    const target = availableLocales[next];
    if (!target) return;
    setLocale(target);
    itemsRef.current[next]?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        selectAt(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        selectAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        selectAt(0);
        break;
      case 'End':
        e.preventDefault();
        selectAt(availableLocales.length - 1);
        break;
    }
  };

  return (
    <div role="radiogroup" aria-label={t('settings.language')} className="grid gap-0.5">
      {availableLocales.map((l, i) => {
        const active = l === locale;
        return (
          <button
            key={l}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setLocale(l)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors outline-none',
              'focus-visible:ring-ring/60 focus-visible:ring-2',
              active
                ? 'bg-primary/10 text-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <LocaleFlag locale={l} />
            <span className="min-w-0 flex-1 truncate">{localeNames[l]}</span>
            {active && <IconCheck className="text-primary size-4 shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
