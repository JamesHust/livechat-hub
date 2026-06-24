import { useEffect, useRef } from 'react';
import { useChatStore } from '../context';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { EmptyState } from './EmptyState';

// `overscroll-contain` keeps a scroll that reaches the list's top/bottom from
// chaining out to the host page (important on mobile, where the panel is
// full-screen over the partner site).
const LIST_CLASS =
  'bg-background flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4';

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.run.status);
  const endRef = useRef<HTMLDivElement>(null);

  const lastMessage = messages[messages.length - 1];
  const isStreaming = status === 'running';
  // Show the standalone typing indicator only before the assistant message exists.
  const showTyping = isStreaming && lastMessage?.role === 'user';

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  if (messages.length === 0) {
    return (
      <div className={LIST_CLASS} data-slot="message-list">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={LIST_CLASS} data-slot="message-list">
      {messages.map((message, i) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={isStreaming && i === messages.length - 1}
        />
      ))}
      {showTyping && <TypingIndicator />}
      <div ref={endRef} />
    </div>
  );
}
