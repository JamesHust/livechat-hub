import { useWidgetLayout } from './use-widget-layout';

/**
 * Responsive sizing for the widget's icon controls.
 *
 * Big chat apps (Messenger, WhatsApp, Telegram) grow their touch targets and
 * glyphs on phones — where fingers need ≥44px hit areas — and keep them compact
 * on desktop, which is mouse-driven. So we upsize for **touch (mobile)** only;
 * the desktop panel stays compact whether floating or full-screen (a large
 * canvas doesn't need bigger icons for a cursor). We key off the widget layout,
 * NOT a viewport media query, so a small floating panel on a wide desktop stays
 * compact (a `md:` breakpoint would wrongly upscale it).
 *
 * The default 16px icon in a 40px button reads undersized; these presets land
 * the glyph at ~50–60% of the button, matching the big players.
 */
export interface ControlSize {
  /** True on touch/phone layouts, where targets grow for fingers. */
  roomy: boolean;
  /** Composer action controls — the primary touch targets. */
  actionButton: string;
  actionIcon: string;
  /** Header / chrome controls — secondary. */
  chromeButton: string;
  chromeIcon: string;
}

export function useControlSize(): ControlSize {
  // Touch (phone) only — desktop stays compact even when full-screen, since a
  // cursor doesn't need the larger fingertip-sized targets.
  const { isMobile } = useWidgetLayout();
  const roomy = isMobile;
  return {
    roomy,
    actionButton: roomy ? 'size-11' : 'size-10',
    actionIcon: roomy ? 'size-6' : 'size-5',
    chromeButton: roomy ? 'size-9' : 'size-8',
    chromeIcon: roomy ? 'size-6' : 'size-5',
  };
}
