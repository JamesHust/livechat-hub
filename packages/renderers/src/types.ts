import type { ComponentType } from 'react';
import type { MessagePart, MessagePartType, StringKey, UIMessage } from '@livechat-hub/shared';

/**
 * Props a generative-UI component receives. `props` is the model-supplied
 * payload from the `canvas` part; `context` gives access to the translator and
 * surrounding message. Mirrors the `RendererProps` shape so authoring a
 * generative component feels the same as a part renderer.
 */
export interface GenerativeComponentProps {
  props: Record<string, unknown>;
  context: RendererContext;
}

/** A React component the agent can render by name (generative UI). */
export type GenerativeComponent = ComponentType<GenerativeComponentProps>;

/** Registry of generative components, keyed by the name the agent references. */
export type GenerativeComponentMap = Record<string, GenerativeComponent>;

/** Context every renderer receives alongside its part. */
export interface RendererContext {
  message: UIMessage;
  /** True while this message is the active streaming target. */
  isStreaming: boolean;
  /** Locale-aware translator so renderers can localize their chrome. */
  t: (key: StringKey) => string;
  /**
   * Generative components registered by the host, keyed by name. The canvas
   * renderer looks a `canvas` part's `component` up here. Empty by default.
   */
  components?: GenerativeComponentMap;
  /**
   * Names of registered frontend tools (browser-side actions). The tool
   * renderer uses this to label a call as a page action vs. a backend tool.
   */
  frontendToolNames?: readonly string[];
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
