import type { UIMessage } from '@livechat-hub/shared';
import { m, useReducedMotion } from 'framer-motion';
import { PartView } from '@livechat-hub/renderers';
import { useChatContext } from '../context';
import { cn } from '../lib/utils';
import { ITEM_TRANSITION, bubbleVariants } from '../lib/motion';
import { AgentAvatar } from './AgentAvatar';

export interface MessageBubbleProps {
  message: UIMessage;
  isStreaming: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const { renderers, components, t } = useChatContext();
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
        <div
          // User bubble carries the accent gradient (token-driven, cheap to
          // paint); assistant stays frosted glass with a hairline edge.
          style={isUser ? { backgroundImage: 'var(--lch-gradient)' } : undefined}
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm [overflow-wrap:anywhere]',
            isUser
              ? 'text-user-bubble-foreground rounded-br-md'
              : 'bg-assistant-bubble text-assistant-bubble-foreground rounded-bl-md border',
          )}
        >
          {message.parts.map((part, index) => (
            <PartView
              key={index}
              part={part}
              context={{ message, isStreaming, t, components }}
              renderers={renderers}
            />
          ))}
        </div>
      </div>
    </m.div>
  );
}
