import type {
  CanvasPart,
  MessagePart,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@livechat-hub/shared';
import { AgUiEventType, type AgUiEvent } from '@livechat-hub/transport';

/**
 * Pure reducer that folds an AG-UI event into the message list. Streaming
 * deltas mutate the relevant part of the target message immutably so React
 * (or any subscriber) sees a new array reference on every change.
 *
 * Run-level events (RUN_STARTED/FINISHED/ERROR, STATE_*) are handled by the
 * orchestrator and intentionally ignored here.
 */
export function applyEventToMessages(messages: UIMessage[], event: AgUiEvent): UIMessage[] {
  switch (event.type) {
    case AgUiEventType.TextMessageStart:
      return ensureMessage(messages, event.messageId, event.role ?? 'assistant');

    case AgUiEventType.TextMessageContent:
      return appendToTextLike(messages, event.messageId, 'text', event.delta);

    case AgUiEventType.ReasoningStart:
      return ensureMessage(messages, event.messageId, 'assistant');

    case AgUiEventType.ReasoningContent:
      return appendToTextLike(messages, event.messageId, 'reasoning', event.delta);

    case AgUiEventType.ToolCallStart:
      return updateMessage(messages, event.messageId, 'assistant', (parts) => [
        ...parts,
        {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: '',
          state: 'partial',
        } satisfies ToolCallPart,
      ]);

    case AgUiEventType.ToolCallArgs:
      return mapToolCall(messages, event.toolCallId, (part) => ({
        ...part,
        args: typeof part.args === 'string' ? part.args + event.delta : event.delta,
      }));

    case AgUiEventType.ToolCallEnd:
      return mapToolCall(messages, event.toolCallId, (part) => ({
        ...part,
        args: tryParseJson(part.args),
        state: 'input-available',
      }));

    case AgUiEventType.ToolCallResult:
      return updateMessage(messages, event.messageId, 'assistant', (parts) => [
        ...markToolCallOutputAvailable(parts, event.toolCallId),
        {
          type: 'tool-result',
          toolCallId: event.toolCallId,
          toolName: event.toolName ?? findToolName(parts, event.toolCallId),
          result: event.result,
          isError: event.isError,
        } satisfies ToolResultPart,
      ]);

    case AgUiEventType.CustomUi:
      return updateMessage(messages, event.messageId ?? 'assistant', 'assistant', (parts) => [
        ...parts,
        { type: 'canvas', component: event.component, props: event.props } satisfies CanvasPart,
      ]);

    default:
      return messages;
  }
}

function ensureMessage(messages: UIMessage[], id: string, role: UIMessage['role']): UIMessage[] {
  if (messages.some((m) => m.id === id)) return messages;
  return [...messages, { id, role, parts: [] }];
}

function updateMessage(
  messages: UIMessage[],
  id: string,
  role: UIMessage['role'],
  update: (parts: MessagePart[]) => MessagePart[],
): UIMessage[] {
  const exists = messages.some((m) => m.id === id);
  const base = exists ? messages : [...messages, { id, role, parts: [] }];
  return base.map((m) => (m.id === id ? { ...m, parts: update(m.parts) } : m));
}

/** Append a delta to the trailing text/reasoning part, creating one if needed. */
function appendToTextLike(
  messages: UIMessage[],
  id: string,
  kind: 'text' | 'reasoning',
  delta: string,
): UIMessage[] {
  return updateMessage(messages, id, 'assistant', (parts) => {
    const last = parts[parts.length - 1];
    if (last && last.type === kind) {
      const updated = { ...last, text: last.text + delta } as TextPart | ReasoningPart;
      return [...parts.slice(0, -1), updated];
    }
    const fresh = { type: kind, text: delta } as TextPart | ReasoningPart;
    return [...parts, fresh];
  });
}

function mapToolCall(
  messages: UIMessage[],
  toolCallId: string,
  update: (part: ToolCallPart) => ToolCallPart,
): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'tool-call' && p.toolCallId === toolCallId ? update(p) : p,
    ),
  }));
}

function markToolCallOutputAvailable(parts: MessagePart[], toolCallId: string): MessagePart[] {
  return parts.map((p) =>
    p.type === 'tool-call' && p.toolCallId === toolCallId
      ? ({ ...p, state: 'output-available' } satisfies ToolCallPart)
      : p,
  );
}

function findToolName(parts: MessagePart[], toolCallId: string): string {
  const call = parts.find(
    (p): p is ToolCallPart => p.type === 'tool-call' && p.toolCallId === toolCallId,
  );
  return call?.toolName ?? 'tool';
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
