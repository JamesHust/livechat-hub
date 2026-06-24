import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Launcher } from './Launcher';
import { ChatWindow } from './ChatWindow';
import { WidgetLayoutProvider } from '../hooks/use-widget-layout';

export interface ChatWidgetProps {
  defaultOpen?: boolean;
  /** Allow dragging the launcher to either side of the screen (default true). */
  draggable?: boolean;
}

/**
 * Launcher + floating panel. This is the embeddable composition used by the
 * widget and (optionally) the extension. The surrounding host provides the
 * `<ChatProvider>` and the themed root element.
 *
 * `WidgetLayoutProvider` shares the launcher's (draggable) position with the
 * panel so both anchor to the same side, and drives the mobile full-screen +
 * keyboard handling.
 */
export function ChatWidget({ defaultOpen = false, draggable = true }: ChatWidgetProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <WidgetLayoutProvider draggable={draggable}>
      {/* AnimatePresence keeps the panel mounted long enough to play its exit. */}
      <AnimatePresence>
        {open && <ChatWindow key="panel" onClose={() => setOpen(false)} />}
      </AnimatePresence>
      <Launcher open={open} onToggle={() => setOpen((o) => !o)} />
    </WidgetLayoutProvider>
  );
}
