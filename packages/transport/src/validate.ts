import { AgUiEventType, type AgUiEvent } from './events';

const KNOWN_TYPES = new Set<string>(Object.values(AgUiEventType));

/**
 * Lightweight structural validation for inbound events. We avoid a heavy schema
 * dependency in the protocol layer; instead we assert the discriminant exists
 * and the minimum required fields for each variant are present.
 */
export function validateEvent(value: unknown): value is AgUiEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.type !== 'string' || !KNOWN_TYPES.has(e.type)) return false;

  switch (e.type as AgUiEvent['type']) {
    case AgUiEventType.RunStarted:
      return typeof e.runId === 'string';
    case AgUiEventType.RunFinished: {
      if (typeof e.runId !== 'string') return false;
      if (e.outcome === undefined) return true;
      if (typeof e.outcome !== 'object' || e.outcome === null) return false;
      const outcome = e.outcome as Record<string, unknown>;
      // An interrupt outcome must carry at least one interrupt with a string id.
      if (outcome.type === 'interrupt') {
        return (
          Array.isArray(outcome.interrupts) &&
          outcome.interrupts.length > 0 &&
          outcome.interrupts.every(
            (i) =>
              typeof i === 'object' &&
              i !== null &&
              typeof (i as Record<string, unknown>).id === 'string',
          )
        );
      }
      return true;
    }
    case AgUiEventType.RunError:
      return typeof e.message === 'string';
    case AgUiEventType.TextMessageStart:
    case AgUiEventType.TextMessageEnd:
    case AgUiEventType.ReasoningStart:
    case AgUiEventType.ReasoningEnd:
      return typeof e.messageId === 'string';
    case AgUiEventType.TextMessageContent:
    case AgUiEventType.ReasoningContent:
      return typeof e.messageId === 'string' && typeof e.delta === 'string';
    case AgUiEventType.ToolCallStart:
      return (
        typeof e.toolCallId === 'string' &&
        typeof e.toolName === 'string' &&
        typeof e.messageId === 'string'
      );
    case AgUiEventType.ToolCallArgs:
      return typeof e.toolCallId === 'string' && typeof e.delta === 'string';
    case AgUiEventType.ToolCallEnd:
      return typeof e.toolCallId === 'string';
    case AgUiEventType.ToolCallResult:
      return typeof e.toolCallId === 'string' && 'result' in e;
    case AgUiEventType.StateSnapshot:
      return typeof e.snapshot === 'object' && e.snapshot !== null;
    case AgUiEventType.StateDelta:
      return Array.isArray(e.delta);
    case AgUiEventType.ArtifactUpdate:
      return typeof e.artifactId === 'string' && typeof e.kind === 'string';
    case AgUiEventType.CustomUi:
      return typeof e.component === 'string';
    default:
      return false;
  }
}

/** Parse a JSON event payload, returning `null` if malformed or invalid. */
export function parseEvent(data: string): AgUiEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return validateEvent(parsed) ? parsed : null;
}
