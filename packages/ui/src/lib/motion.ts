import { domAnimation, type Transition, type Variants } from 'framer-motion';

// Re-export the lazy feature bundle so every animated component pulls the same
// `domAnimation` set through `LazyMotion` — keeps the widget bundle lean.
export { domAnimation };

// Short, natural easing. Motion should clarify what changed, never make the UI
// feel slower — durations stay in the 150–250ms range (see CLAUDE.md "Animation").
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const PANEL_TRANSITION: Transition = { duration: 0.24, ease: EASE_OUT };
export const ITEM_TRANSITION: Transition = { duration: 0.2, ease: EASE_OUT };

/**
 * Chat panel open/close. On desktop/tablet it scales up from the launcher
 * corner; full-screen on mobile it slides up from the bottom edge (scaling a
 * full-viewport sheet from a corner reads as a glitch). Under reduced motion
 * both degrade to a plain opacity fade with no transform.
 */
export function panelVariants(reduced: boolean, mobile = false): Variants {
  if (mobile) {
    const hidden = reduced ? { opacity: 0 } : { opacity: 0, y: 28 };
    return { hidden, visible: { opacity: 1, y: 0 }, exit: hidden };
  }
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 };
  return {
    hidden,
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: hidden,
  };
}

/** New message bubbles fade/slide in once on mount (never on streaming updates). */
export function bubbleVariants(reduced: boolean): Variants {
  return {
    hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  };
}

/** Error bar slides down on failure and collapses away on recovery/retry. */
export function errorVariants(reduced: boolean): Variants {
  return {
    hidden: reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 },
    visible: { opacity: 1, height: 'auto', y: 0 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 },
  };
}
