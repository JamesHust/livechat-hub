/**
 * AG-UI compatible event protocol.
 *
 * These event names and shapes mirror the AG-UI specification so the frontend
 * can speak to any compliant backend regardless of which agent framework
 * powers it. Do not invent proprietary event names here — extend the union
 * with AG-UI-aligned concepts only.
 */

export const AgUiEventType = {
  RunStarted: 'RUN_STARTED',
  RunFinished: 'RUN_FINISHED',
  RunError: 'RUN_ERROR',

  TextMessageStart: 'TEXT_MESSAGE_START',
  TextMessageContent: 'TEXT_MESSAGE_CONTENT',
  TextMessageEnd: 'TEXT_MESSAGE_END',

  ReasoningStart: 'REASONING_START',
  ReasoningContent: 'REASONING_CONTENT',
  ReasoningEnd: 'REASONING_END',

  ToolCallStart: 'TOOL_CALL_START',
  ToolCallArgs: 'TOOL_CALL_ARGS',
  ToolCallEnd: 'TOOL_CALL_END',
  ToolCallResult: 'TOOL_CALL_RESULT',

  StateSnapshot: 'STATE_SNAPSHOT',
  StateDelta: 'STATE_DELTA',

  ArtifactUpdate: 'ARTIFACT_UPDATE',
  CustomUi: 'CUSTOM_UI',
} as const;

export type AgUiEventType = (typeof AgUiEventType)[keyof typeof AgUiEventType];

interface BaseEvent<T extends AgUiEventType> {
  type: T;
  /** Server timestamp (epoch ms), if provided. */
  timestamp?: number;
}

export interface RunStartedEvent extends BaseEvent<typeof AgUiEventType.RunStarted> {
  runId: string;
  threadId?: string;
}

export interface RunFinishedEvent extends BaseEvent<typeof AgUiEventType.RunFinished> {
  runId: string;
}

export interface RunErrorEvent extends BaseEvent<typeof AgUiEventType.RunError> {
  runId?: string;
  code?: string;
  message: string;
}

export interface TextMessageStartEvent extends BaseEvent<typeof AgUiEventType.TextMessageStart> {
  messageId: string;
  role?: 'assistant' | 'system' | 'tool';
}

export interface TextMessageContentEvent extends BaseEvent<
  typeof AgUiEventType.TextMessageContent
> {
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseEvent<typeof AgUiEventType.TextMessageEnd> {
  messageId: string;
}

export interface ReasoningStartEvent extends BaseEvent<typeof AgUiEventType.ReasoningStart> {
  messageId: string;
}

export interface ReasoningContentEvent extends BaseEvent<typeof AgUiEventType.ReasoningContent> {
  messageId: string;
  delta: string;
}

export interface ReasoningEndEvent extends BaseEvent<typeof AgUiEventType.ReasoningEnd> {
  messageId: string;
}

export interface ToolCallStartEvent extends BaseEvent<typeof AgUiEventType.ToolCallStart> {
  messageId: string;
  toolCallId: string;
  toolName: string;
}

export interface ToolCallArgsEvent extends BaseEvent<typeof AgUiEventType.ToolCallArgs> {
  toolCallId: string;
  /** Streamed JSON fragment of the tool arguments. */
  delta: string;
}

export interface ToolCallEndEvent extends BaseEvent<typeof AgUiEventType.ToolCallEnd> {
  toolCallId: string;
}

export interface ToolCallResultEvent extends BaseEvent<typeof AgUiEventType.ToolCallResult> {
  messageId: string;
  toolCallId: string;
  toolName?: string;
  result: unknown;
  isError?: boolean;
}

export interface StateSnapshotEvent extends BaseEvent<typeof AgUiEventType.StateSnapshot> {
  snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent extends BaseEvent<typeof AgUiEventType.StateDelta> {
  /** JSON Patch (RFC 6902) operations describing the state mutation. */
  delta: JsonPatchOperation[];
}

export interface ArtifactUpdateEvent extends BaseEvent<typeof AgUiEventType.ArtifactUpdate> {
  artifactId: string;
  kind: string;
  payload: unknown;
}

export interface CustomUiEvent extends BaseEvent<typeof AgUiEventType.CustomUi> {
  messageId?: string;
  component: string;
  props: Record<string, unknown>;
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ReasoningStartEvent
  | ReasoningContentEvent
  | ReasoningEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | ArtifactUpdateEvent
  | CustomUiEvent;
