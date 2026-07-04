import { useEffect, useState } from 'react';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { ErrorBar } from './ErrorBar';
import { InterruptPrompt } from './InterruptPrompt';
import { ActionConfirmPrompt } from './ActionConfirmPrompt';
import { ConversationList } from './ConversationList';
import { Composer } from './Composer';
import { WelcomeScreen } from './WelcomeScreen';
import { useChatStore } from '../context';
import { useWidgetLayout } from '../hooks/use-widget-layout';
import { cn } from '../lib/utils';
import { domAnimation, PANEL_TRANSITION, panelVariants } from '../lib/motion';

export interface ChatWindowProps {
  onClose?: () => void;
}

/**
 * The full chat panel: header, scrollable message list, error bar and composer.
 * Platform-agnostic — embedded as the widget panel, the extension popup body,
 * or a future side panel.
 *
 * Self-contained `LazyMotion` so the panel animates in standalone hosts (the
 * extension popup) and exits when a composition root wraps it in
 * `AnimatePresence` — presence context flows through `LazyMotion` to `m.div`.
 */
export function ChatWindow({ onClose }: ChatWindowProps) {
  const reduced = useReducedMotion() ?? false;
  const layout = useWidgetLayout();
  // Desktop-only affordance: phones already render the panel full-screen, so the
  // toggle is hidden there. When on, the panel fills the viewport.
  const [fullscreen, setFullscreen] = useState(false);
  const isFullscreen = fullscreen && !layout.isMobile;
  // Publish fullscreen to the shared layout so the floating launcher can hide —
  // otherwise its open/close bubble overlaps the edge-to-edge panel. Reset on
  // unmount (panel closed) so the launcher returns. No-op without a provider.
  const { setFullscreen: publishFullscreen } = layout;
  useEffect(() => {
    publishFullscreen(isFullscreen);
    return () => publishFullscreen(false);
  }, [isFullscreen, publishFullscreen]);
  // Guest onboarding gate: a guest (no host-supplied `userId`) must enter a
  // name on the welcome screen before reaching the chat. Returning guests have
  // a persisted `guestName`, so they skip straight in.
  const session = useChatStore((s) => s.session);
  const needsWelcome = !session.userId && !session.guestName;
  // In-conversation search is offered only once there's something to search.
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!hasMessages) setSearchOpen(false);
  }, [hasMessages]);
  // Multi-thread conversation list (sheet over the panel).
  const [conversationsOpen, setConversationsOpen] = useState(false);
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        role="dialog"
        aria-label="Live chat"
        variants={panelVariants(reduced, layout.isMobile)}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={PANEL_TRANSITION}
        // Animate the size/position change between floating and fullscreen;
        // skipped under reduced motion (the class swap then applies instantly).
        layout={!reduced}
        // `layout.panelStyle` anchors the panel to the (draggable) launcher and,
        // on phones, makes it full-screen pinned to the visual viewport so the
        // composer stays above the keyboard. When no layout provider is present
        // it degrades to just `transformOrigin` and the className anchor wins.
        // In desktop fullscreen we drop the anchor so the inset utilities win.
        // `data-fullscreen` lets the stylesheet add safe-area padding.
        style={isFullscreen ? undefined : layout.panelStyle}
        data-fullscreen={layout.isMobile || isFullscreen || undefined}
        // `lch-panel` is a styling hook (no styles here) so hosts like the
        // extension popup can re-anchor the panel via plain CSS that outranks
        // Tailwind's layered utilities.
        // Frosted glass: translucent `bg-background` + backdrop blur lets the
        // host page show through (the glassmorphism design language).
        className={cn(
          'lch-panel bg-background supports-[backdrop-filter]:bg-background fixed z-[2147483000] flex flex-col overflow-hidden border shadow-[var(--lch-shadow)] backdrop-blur-2xl',
          isFullscreen
            ? 'inset-0 h-full max-h-none w-full max-w-none rounded-none'
            : 'right-5 bottom-22 h-[600px] max-h-[calc(100vh-120px)] w-95 max-w-[calc(100vw-40px)]',
          !isFullscreen && (layout.isMobile ? 'rounded-none' : 'rounded-lg'),
        )}
      >
        <Header
          onClose={onClose}
          fullscreen={isFullscreen}
          onToggleFullscreen={layout.isMobile ? undefined : () => setFullscreen((value) => !value)}
          onToggleSearch={
            !needsWelcome && hasMessages ? () => setSearchOpen((value) => !value) : undefined
          }
          searchActive={searchOpen}
          onOpenConversations={!needsWelcome ? () => setConversationsOpen(true) : undefined}
        />
        {needsWelcome ? (
          <WelcomeScreen />
        ) : (
          <>
            <MessageList searchOpen={searchOpen} onCloseSearch={() => setSearchOpen(false)} />
            <ErrorBar />
            <InterruptPrompt />
            <ActionConfirmPrompt />
            <Composer />
            <ConversationList
              open={conversationsOpen}
              onClose={() => setConversationsOpen(false)}
            />
          </>
        )}
      </m.div>
    </LazyMotion>
  );
}
