import { useChatContext } from '../context';
import { AgentAvatar } from './AgentAvatar';

export function TypingIndicator() {
  const { t } = useChatContext();
  return (
    <div className="flex w-full justify-start" aria-live="polite">
      <div className="flex max-w-[85%] items-end gap-2">
        <AgentAvatar size="sm" />
        <div
          className="bg-assistant-bubble inline-flex gap-1 rounded-2xl rounded-bl-md border px-3.5 py-3 shadow-sm"
          aria-label={t('message.assistantTyping')}
        >
          {[0, 0.15, 0.3].map((delay) => (
            <span
              key={delay}
              className="bg-muted-foreground size-1.5 animate-bounce rounded-full"
              style={{ animationDelay: `${delay}s`, animationDuration: '1.2s' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
