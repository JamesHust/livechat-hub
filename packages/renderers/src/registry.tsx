import type { MessagePart } from '@livechat-hub/shared';
import {
  AudioRenderer,
  CanvasRenderer,
  CitationRenderer,
  FileRenderer,
  ImageRenderer,
  ReasoningRenderer,
  ReferenceRenderer,
  TextRenderer,
  ToolCallRenderer,
  ToolResultRenderer,
  VideoRenderer,
} from './parts';
import type { PartRenderer, RendererContext, RendererMap } from './types';

/** Built-in renderer for every canonical part type. */
export const defaultRenderers: Required<RendererMap> = {
  text: TextRenderer,
  reasoning: ReasoningRenderer,
  'tool-call': ToolCallRenderer,
  'tool-result': ToolResultRenderer,
  image: ImageRenderer,
  video: VideoRenderer,
  audio: AudioRenderer,
  file: FileRenderer,
  citation: CitationRenderer,
  reference: ReferenceRenderer,
  canvas: CanvasRenderer,
};

/** Merge user overrides over the defaults to produce a complete map. */
export function resolveRenderers(overrides?: RendererMap): Required<RendererMap> {
  if (!overrides) return defaultRenderers;
  return { ...defaultRenderers, ...overrides } as Required<RendererMap>;
}

export interface PartViewProps {
  part: MessagePart;
  context: RendererContext;
  renderers: Required<RendererMap>;
}

/** Render a single part using the resolved renderer for its type. */
export function PartView({ part, context, renderers }: PartViewProps) {
  const Renderer = renderers[part.type] as PartRenderer | undefined;
  if (!Renderer) return null;
  return <Renderer part={part} context={context} />;
}
