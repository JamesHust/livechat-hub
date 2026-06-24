import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * Widget layout: where the launcher sits, how it is dragged, and how the panel
 * anchors to it across desktop, tablet and phone (including the on-screen
 * keyboard). All of this is presentation/interaction state, so it lives in `ui`
 * and never touches `core`.
 *
 * Two hard problems the big players (Messenger, Intercom, Crisp) solve and we
 * mirror here:
 *   1. The launcher is free-dragged then **snaps to the nearest side**, keeping
 *      its vertical position; the panel opens on whichever side it landed.
 *   2. On mobile the panel goes **full-screen and tracks `visualViewport`** so
 *      the composer sits right above the keyboard instead of being covered or
 *      pushed off-screen by iOS Safari's fixed-position quirks.
 */

const STORAGE_KEY = 'livechat-hub:launcher-position';
const MARGIN = 20; // gap from the viewport edge, matches the old `*-5` spacing
const LAUNCHER = 56; // size-14 launcher diameter
const GAP = 14; // gap between launcher and the opened panel
const PANEL_W = 380; // w-95 floating panel width
const PANEL_H = 600; // h-[600px] floating panel height
const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag
const HOLD_MS = 250; // press-and-hold duration that starts a drag on touch
const MOBILE_QUERY = '(max-width: 480px)'; // phone → full-screen panel

type Side = 'left' | 'right';

interface Viewport {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface StoredPosition {
  side: Side;
  /** Vertical position as a fraction of the available travel, resize-resilient. */
  frac: number;
}

export interface WidgetLayout {
  /** Phone-sized viewport → the panel renders full-screen. */
  isMobile: boolean;
  /** The panel is expanded to fill the viewport (desktop fullscreen toggle). */
  isFullscreen: boolean;
  /** Set by the panel; lets siblings (the launcher) react to fullscreen. */
  setFullscreen: (value: boolean) => void;
  /** A drag is in progress (suppresses hover micro-interactions). */
  isDragging: boolean;
  /** Inline style positioning the launcher (overrides the className anchor). */
  launcherStyle: CSSProperties;
  /** Pointer handlers wiring drag onto the launcher button. */
  launcherHandlers: {
    onPointerDown?: (e: ReactPointerEvent) => void;
    onPointerMove?: (e: ReactPointerEvent) => void;
    onPointerUp?: (e: ReactPointerEvent) => void;
    onPointerCancel?: (e: ReactPointerEvent) => void;
  };
  /** Inline style positioning + sizing the panel relative to the launcher. */
  panelStyle: CSSProperties;
  /**
   * Call from the launcher's `onClick`: returns `true` when the click is the
   * tail of a drag and should be swallowed (don't toggle the panel).
   */
  consumeDragClick: () => boolean;
}

// Default (no provider): keep the legacy behaviour — className anchors the
// launcher bottom-right, the panel scales from that corner, nothing drags. The
// extension popup relies on this so its own CSS keeps full control.
const DEFAULT_LAYOUT: WidgetLayout = {
  isMobile: false,
  isFullscreen: false,
  setFullscreen: () => {},
  isDragging: false,
  launcherStyle: {},
  launcherHandlers: {},
  panelStyle: { transformOrigin: 'bottom right' },
  consumeDragClick: () => false,
};

const WidgetLayoutContext = createContext<WidgetLayout>(DEFAULT_LAYOUT);

export function useWidgetLayout(): WidgetLayout {
  return useContext(WidgetLayoutContext);
}

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), max);

function readViewport(): Viewport {
  if (typeof window === 'undefined') return { top: 0, left: 0, width: 360, height: 640 };
  const vv = window.visualViewport;
  if (vv) return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
  return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
}

function readStored(): StoredPosition | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPosition>;
    if ((parsed.side === 'left' || parsed.side === 'right') && typeof parsed.frac === 'number') {
      return { side: parsed.side, frac: clamp(parsed.frac, 0, 1) };
    }
  } catch {
    // Corrupt/unavailable storage — fall back to the default placement.
  }
  return null;
}

function writeStored(pos: StoredPosition): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Storage may be unavailable (private mode, sandboxed iframe) — ignore.
  }
}

export interface WidgetLayoutProviderProps {
  /** Allow the user to drag the launcher (default true). */
  draggable?: boolean;
  children: ReactNode;
}

export function WidgetLayoutProvider({ draggable = true, children }: WidgetLayoutProviderProps) {
  const [vp, setVp] = useState<Viewport>(() => readViewport());
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setFullscreen] = useState(false);
  const stored = readStored();
  const [side, setSide] = useState<Side>(stored?.side ?? 'right');
  // `frac` of 1 places the launcher at the bottom (the historical position).
  const [frac, setFrac] = useState<number>(stored?.frac ?? 1);
  // Free pixel position while a drag is live; null when resting/snapped.
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);

  // Track the viewport, including the visual viewport shrinking when the
  // on-screen keyboard opens (the crux of keeping the composer reachable).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setVp(readViewport());
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    update();
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Resolved resting position of the launcher (top-left corner, viewport px).
  const travel = Math.max(0, vp.height - LAUNCHER - 2 * MARGIN);
  const restTop = vp.top + MARGIN + clamp(frac, 0, 1) * travel;
  const restLeft = side === 'right' ? vp.left + vp.width - MARGIN - LAUNCHER : vp.left + MARGIN;

  // ---- Drag gesture (pointer events unify mouse + touch). ----
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
    active: boolean;
    holdTimer: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const activate = useCallback(() => {
    const d = dragRef.current;
    if (!d || d.active) return;
    d.active = true;
    window.clearTimeout(d.holdTimer);
    setDrag({ left: d.lastX - d.grabX, top: d.lastY - d.grabY });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!draggable) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail if the pointer is already released — ignore.
      }
      const holdTimer = e.pointerType === 'mouse' ? 0 : window.setTimeout(activate, HOLD_MS);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        holdTimer,
      };
    },
    [draggable, activate],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
          activate();
        } else {
          return;
        }
      }
      // Owning the gesture: stop the page from scrolling/zooming under the drag.
      e.preventDefault();
      setDrag({ left: e.clientX - d.grabX, top: e.clientY - d.grabY });
    },
    [activate],
  );

  const finishDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      window.clearTimeout(d.holdTimer);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId);
      } catch {
        // ignore
      }
      if (d.active) {
        const left = d.lastX - d.grabX;
        const top = d.lastY - d.grabY;
        const center = left + LAUNCHER / 2;
        const nextSide: Side = center < vp.left + vp.width / 2 ? 'left' : 'right';
        const span = Math.max(1, vp.height - LAUNCHER - 2 * MARGIN);
        const nextFrac = clamp((top - vp.top - MARGIN) / span, 0, 1);
        setSide(nextSide);
        setFrac(nextFrac);
        writeStored({ side: nextSide, frac: nextFrac });
        setDrag(null);
        // The click that fires after this pointerup must not toggle the panel.
        suppressClick.current = true;
      }
      dragRef.current = null;
    },
    [vp],
  );

  const onPointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (d) window.clearTimeout(d.holdTimer);
    dragRef.current = null;
    setDrag(null);
  }, []);

  const consumeDragClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }
    return false;
  }, []);

  // ---- Computed styles. ----
  const launcherStyle = useMemo<CSSProperties>(() => {
    const base: CSSProperties = {
      position: 'fixed',
      right: 'auto',
      bottom: 'auto',
      touchAction: draggable ? 'none' : undefined,
    };
    if (drag) {
      return { ...base, left: drag.left, top: drag.top, cursor: 'grabbing', transition: 'none' };
    }
    return {
      ...base,
      left: restLeft,
      top: restTop,
      cursor: draggable ? 'grab' : 'pointer',
    };
  }, [drag, restLeft, restTop, draggable]);

  const panelStyle = useMemo<CSSProperties>(() => {
    if (isMobile) {
      // Full-screen, locked to the visual viewport so the composer rides just
      // above the keyboard and the layout never scrolls out from under itself.
      return {
        position: 'fixed',
        top: vp.top,
        left: vp.left,
        width: vp.width,
        height: vp.height,
        maxWidth: 'none',
        maxHeight: 'none',
        borderRadius: 0,
        transformOrigin: 'center',
      };
    }
    const panelW = Math.min(PANEL_W, vp.width - 2 * MARGIN);
    // The launcher splits the column into the gap above it and the gap below it.
    // Keep the panel wholly within ONE of those gaps so it can never sit on top
    // of the bubble — wherever the bubble is dragged. The panel shrinks to the
    // chosen gap when the full height won't fit (e.g. bubble near mid-screen).
    const spaceAbove = restTop - GAP - (vp.top + MARGIN);
    const spaceBelow = vp.top + vp.height - MARGIN - (restTop + LAUNCHER + GAP);
    // Prefer the side that fits the full panel; if neither does, take the roomier
    // one. Above wins ties (matches the bottom-anchored open animation).
    const openAbove =
      spaceAbove >= PANEL_H ? true : spaceBelow >= PANEL_H ? false : spaceAbove >= spaceBelow;
    const space = openAbove ? spaceAbove : spaceBelow;
    const panelH = clamp(Math.min(PANEL_H, space), 0, PANEL_H);
    const top = openAbove ? restTop - GAP - panelH : restTop + LAUNCHER + GAP;
    const left = side === 'right' ? vp.left + vp.width - MARGIN - panelW : vp.left + MARGIN;
    return {
      position: 'fixed',
      top,
      left,
      right: 'auto',
      bottom: 'auto',
      width: panelW,
      height: panelH,
      maxWidth: 'none',
      maxHeight: 'none',
      transformOrigin: `${openAbove ? 'bottom' : 'top'} ${side}`,
    };
  }, [isMobile, vp, restTop, side]);

  const value = useMemo<WidgetLayout>(
    () => ({
      isMobile,
      isFullscreen,
      setFullscreen,
      isDragging: drag !== null,
      launcherStyle,
      launcherHandlers: draggable
        ? { onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel }
        : {},
      panelStyle,
      consumeDragClick,
    }),
    [
      isMobile,
      isFullscreen,
      drag,
      launcherStyle,
      draggable,
      onPointerDown,
      onPointerMove,
      finishDrag,
      onPointerCancel,
      panelStyle,
      consumeDragClick,
    ],
  );

  return <WidgetLayoutContext.Provider value={value}>{children}</WidgetLayoutContext.Provider>;
}
