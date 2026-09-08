import { type ReactNode } from 'react';
import type { Locale } from '@livechat-hub/shared';
import { cn } from '../lib/utils';

/**
 * Tiny national-flag chips for the language switcher.
 *
 * National flags are fixed heraldic symbols whose colors are defined by
 * convention, not a theming variable — so the hex values below are the sole,
 * deliberate exception to this repo's `--lch-*`-only color rule (the same
 * reasoning the Icons rule applies to brand assets). Everything around the art
 * stays themed: the chip is clipped to a rounded square and ringed with the
 * `border` token so it reads cleanly on the frosted-glass panel in both light
 * and dark.
 *
 * Authored inline as SVG, never emoji: flag emoji don't render at all on
 * Windows and vary wildly across platforms — a non-starter in a Shadow-DOM
 * widget. The geometry is simplified to stay legible at ~20px.
 */

// Upright five-point star (used by the Vietnam and PRC flags). Computed once at
// module load — cheap, and keeps the JSX below declarative.
function star(cx: number, cy: number, r: number): string {
  const inner = r * 0.382;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const a = ((-90 + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)} ${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const VN_STAR = star(12, 12, 6.6);
// Star of David (two overlapping triangles) for the Israeli flag.
const IL_STAR = 'M12 8L15.46 14L8.54 14Z M12 16L15.46 10L8.54 10Z';
const CN_BIG = star(6, 7, 3.6);
const CN_SMALL = [
  star(11.6, 3.2, 1.5),
  star(13.9, 5.6, 1.5),
  star(13.9, 9.1, 1.5),
  star(11.6, 11.4, 1.5),
].join('');

const FLAGS: Record<Locale, ReactNode> = {
  // United Kingdom (Union Jack) — simplified, centered crosses read at chip size.
  en: (
    <>
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 24 24M24 0 0 24" fill="none" stroke="#fff" strokeWidth="5" />
      <path d="M0 0 24 24M24 0 0 24" fill="none" stroke="#c8102e" strokeWidth="2.5" />
      <path d="M12 0V24M0 12H24" fill="none" stroke="#fff" strokeWidth="7" />
      <path d="M12 0V24M0 12H24" fill="none" stroke="#c8102e" strokeWidth="4" />
    </>
  ),
  // Vietnam — yellow star on a red field.
  vi: (
    <>
      <rect width="24" height="24" fill="#da251d" />
      <path d={VN_STAR} fill="#ff0" />
    </>
  ),
  // Japan — red disc on white.
  ja: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <circle cx="12" cy="12" r="6" fill="#bc002d" />
    </>
  ),
  // China — large star plus the four-star cluster in the canton.
  zh: (
    <>
      <rect width="24" height="24" fill="#de2910" />
      <path d={CN_BIG} fill="#ffde00" />
      <path d={CN_SMALL} fill="#ffde00" />
    </>
  ),
  // Indonesia — red over white horizontal bands.
  id: (
    <>
      <rect width="24" height="12" fill="#ce1126" />
      <rect y="12" width="24" height="12" fill="#fff" />
    </>
  ),
  // Arabic — Saudi Arabia's green field (simplified; a language, shown by a
  // representative national flag like the rest of the set).
  ar: (
    <>
      <rect width="24" height="24" fill="#006c35" />
      <rect x="4" y="16" width="16" height="1.6" rx="0.8" fill="#fff" />
    </>
  ),
  // Hebrew — Israel: white field, two blue stripes, Star of David.
  he: (
    <>
      <rect width="24" height="24" fill="#fff" />
      <rect y="4" width="24" height="2.4" fill="#0038b8" />
      <rect y="17.6" width="24" height="2.4" fill="#0038b8" />
      <path d={IL_STAR} fill="none" stroke="#0038b8" strokeWidth="1.1" />
    </>
  ),
};

export interface LocaleFlagProps {
  locale: Locale;
  className?: string;
}

export function LocaleFlag({ locale, className }: LocaleFlagProps) {
  return (
    <span
      className={cn(
        'ring-border/70 inline-flex size-5 shrink-0 overflow-hidden rounded-[5px] ring-1',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-full" aria-hidden="true" focusable="false">
        {FLAGS[locale]}
      </svg>
    </span>
  );
}
