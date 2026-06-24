import type {
  AudioPart,
  CanvasPart,
  CitationPart,
  FilePart,
  ImagePart,
  ReasoningPart,
  ReferencePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  VideoPart,
} from '@livechat-hub/shared';
import { IconAlertTriangle, IconCheck, IconFile, IconPuzzle, IconTool } from '@tabler/icons-react';
import { renderMarkdown } from './markdown';
import type { RendererProps } from './types';

// Renderers are styled via plain `lch-*` classes (Tailwind does not scan this
// package), so icons take an explicit pixel size and inherit `currentColor`.
const ICON_SIZE = 16;

export function TextRenderer({ part }: RendererProps<TextPart>) {
  return <div className="lch-part lch-markdown">{renderMarkdown(part.text)}</div>;
}

export function ReasoningRenderer({ part, context }: RendererProps<ReasoningPart>) {
  return (
    <details className="lch-part lch-reasoning" open>
      <summary>{context.t('message.reasoning')}</summary>
      {part.text}
    </details>
  );
}

export function ToolCallRenderer({ part, context }: RendererProps<ToolCallPart>) {
  const args = typeof part.args === 'string' ? part.args : JSON.stringify(part.args, null, 2);
  return (
    <div className="lch-part lch-tool">
      <div className="lch-tool__head" title={context.t('message.toolCall')}>
        <IconTool size={ICON_SIZE} aria-hidden="true" />
        <span>{part.toolName}</span>
        <span>· {part.state}</span>
      </div>
      {args && args !== '""' && <pre>{args}</pre>}
    </div>
  );
}

export function ToolResultRenderer({ part, context }: RendererProps<ToolResultPart>) {
  const result =
    typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2);
  return (
    <div className="lch-part lch-tool" data-error={part.isError ? 'true' : undefined}>
      <div className="lch-tool__head" title={context.t('message.toolResult')}>
        {part.isError ? (
          <IconAlertTriangle size={ICON_SIZE} aria-hidden="true" />
        ) : (
          <IconCheck size={ICON_SIZE} aria-hidden="true" />
        )}
        <span>{part.toolName}</span>
      </div>
      <pre>{result}</pre>
    </div>
  );
}

export function ImageRenderer({ part }: RendererProps<ImagePart>) {
  return (
    <img
      className="lch-part lch-media"
      src={part.url}
      alt={part.alt ?? ''}
      width={part.width}
      height={part.height}
      loading="lazy"
    />
  );
}

export function VideoRenderer({ part }: RendererProps<VideoPart>) {
  return (
    <video className="lch-part lch-media" src={part.url} poster={part.poster} controls>
      <track kind="captions" />
    </video>
  );
}

export function AudioRenderer({ part, context }: RendererProps<AudioPart>) {
  return (
    <figure className="lch-part lch-audio">
      <figcaption>{part.name ?? context.t('message.voiceMessage')}</figcaption>
      <audio src={part.url} controls preload="metadata" />
    </figure>
  );
}

export function FileRenderer({ part }: RendererProps<FilePart>) {
  return (
    <a
      className="lch-part lch-file"
      href={part.url}
      target="_blank"
      rel="noopener noreferrer"
      download={part.name}
    >
      <IconFile size={ICON_SIZE} aria-hidden="true" />
      <span>{part.name}</span>
      {typeof part.size === 'number' && <span>({formatBytes(part.size)})</span>}
    </a>
  );
}

export function CitationRenderer({ part }: RendererProps<CitationPart>) {
  return (
    <span className="lch-part lch-sources">
      {part.url ? (
        <a href={part.url} target="_blank" rel="noopener noreferrer">
          [{part.title ?? part.citationId}]
        </a>
      ) : (
        <span>[{part.title ?? part.citationId}]</span>
      )}
    </span>
  );
}

export function ReferenceRenderer({ part }: RendererProps<ReferencePart>) {
  return (
    <div className="lch-part lch-sources">
      {part.url ? (
        <a href={part.url} target="_blank" rel="noopener noreferrer">
          {part.title}
        </a>
      ) : (
        <strong>{part.title}</strong>
      )}
      {part.description && <div>{part.description}</div>}
    </div>
  );
}

/**
 * Fallback canvas / generative-UI renderer. Real apps override this via the
 * renderer map to mount their own components keyed by `part.component`.
 */
export function CanvasRenderer({ part }: RendererProps<CanvasPart>) {
  return (
    <div className="lch-part lch-canvas">
      <div className="lch-tool__head">
        <IconPuzzle size={ICON_SIZE} aria-hidden="true" />
        <span>{part.component}</span>
      </div>
      <pre>{JSON.stringify(part.props, null, 2)}</pre>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
