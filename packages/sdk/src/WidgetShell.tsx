import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChatWindow, Launcher, WidgetLayoutProvider } from '@livechat-hub/ui';

export interface WidgetShellProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenStateChange?: (open: boolean) => void;
  /** Allow dragging the launcher to either side of the screen (default true). */
  draggable?: boolean;
}

/**
 * Controlled widget composition used by the SDK so `open()` / `close()` can be
 * driven imperatively from the public API while still rendering the shared UI.
 *
 * `WidgetLayoutProvider` shares the launcher's (draggable) position with the
 * panel and drives the mobile full-screen + on-screen-keyboard handling.
 */
export function WidgetShell({
  open,
  onToggle,
  onClose,
  onOpenStateChange,
  draggable = true,
}: WidgetShellProps) {
  useEffect(() => {
    onOpenStateChange?.(open);
  }, [open, onOpenStateChange]);

  return (
    <WidgetLayoutProvider draggable={draggable}>
      <AnimatePresence>{open && <ChatWindow key="panel" onClose={onClose} />}</AnimatePresence>
      <Launcher open={open} onToggle={onToggle} />
    </WidgetLayoutProvider>
  );
}
