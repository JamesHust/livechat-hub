import type { UIMessage } from '@livechat-hub/shared';
import { m, useReducedMotion } from 'framer-motion';
import { PartView } from '@livechat-hub/renderers';
import { useChatContext, useChatStore } from '../context';
import { cn } from '../lib/utils';
import { ITEM_TRANSITION, bubbleVariants } from '../lib/motion';
import { AgentAvatar } from './AgentAvatar';
import { MessageMeta } from './MessageMeta';

export interface MessageBubbleProps {
  message: UIMessage;
  isStreaming: boolean;
  /** Whether this is the last message in the list (enables regenerate). */
  isLast?: boolean;
  /** Ring the bubble as the active search match. */
  highlight?: boolean;
}

export function MessageBubble({
  message,
  isStreaming,
  isLast = false,
  highlight = false,
}: MessageBubbleProps) {
  const { renderers, components, t } = useChatContext();
  const frontendToolNames = useChatStore((s) => s.frontendTools);
  const reduced = useReducedMotion() ?? false;
  if (message.parts.length === 0 && !isStreaming) return null;

  const isUser = message.role === 'user';

  return (
    <m.div
      data-message-id={message.id}
      // Entrance only — `initial`/`animate` fire once on mount, so streaming
      // token updates re-render the body without re-triggering the slide-in.
      variants={bubbleVariants(reduced)}
      initial="hidden"
      animate="visible"
      transition={ITEM_TRANSITION}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('flex max-w-[85%] items-end gap-2', isUser && 'flex-row-reverse')}>
        {/* Agent identity beside assistant turns; user turns need no avatar. */}
        {!isUser && <AgentAvatar size="sm" />}
        {/* Bubble + its footer stack, aligned to the sender's edge. `min-w-0`
            lets long content wrap instead of overflowing the flex row. */}
        <div className={cn('flex min-w-0 flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
          <div
            data-search-match={highlight || undefined}
            // User bubble carries the accent gradient (token-driven, cheap to
            // paint); assistant stays frosted glass with a hairline edge.
            style={isUser ? { backgroundImage: 'var(--lch-gradient)' } : undefined}
            className={cn(
              'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm [overflow-wrap:anywhere]',
              'transition-shadow',
              isUser
                ? 'text-user-bubble-foreground rounded-br-md'
                : 'bg-assistant-bubble text-assistant-bubble-foreground rounded-bl-md border',
              // Active search match ring — reads on both the gradient user
              // bubble and the frosted assistant bubble.
              highlight && 'ring-primary/70 ring-2 ring-offset-1 ring-offset-[var(--lch-surface)]',
            )}
          >
            {message.parts.map((part, index) => (
              <PartView
                key={index}
                part={part}
                context={{ message, isStreaming, t, components, frontendToolNames }}
                renderers={renderers}
              />
            ))}
          </div>
          <MessageMeta
            message={message}
            isUser={isUser}
            isLast={isLast}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </m.div>
  );
}
