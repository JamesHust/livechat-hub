import type { ComponentType } from 'react';
import type { MessagePart, MessagePartType, StringKey, UIMessage } from '@livechat-hub/shared';

/** Context every renderer receives alongside its part. */
export interface RendererContext {
  message: UIMessage;
  /** True while this message is the active streaming target. */
  isStreaming: boolean;
  /** Locale-aware translator so renderers can localize their chrome. */
  t: (key: StringKey) => string;
}

export interface RendererProps<P extends MessagePart = MessagePart> {
  part: P;
  context: RendererContext;
}

export type PartRenderer<P extends MessagePart = MessagePart> = ComponentType<RendererProps<P>>;

/** Map of part type -> renderer component. Consumers may override any entry. */
export type RendererMap = {
  [K in MessagePartType]?: PartRenderer<Extract<MessagePart, { type: K }>>;
};
