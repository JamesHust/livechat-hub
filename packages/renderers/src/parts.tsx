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
import {
  IconAlertTriangle,
  IconCheck,
  IconClick,
  IconFile,
  IconLoader2,
  IconPuzzle,
  IconTool,
} from '@tabler/icons-react';
import { renderMarkdown } from './markdown';
import type { RendererProps } from './types';

// Renderers are styled via plain `lch-*` classes (Tailwind does not scan this
// package), so icons take an explicit pixel size and inherit `currentColor`.
const ICON_SIZE = 16;

/** `set_page_background` → `Set page background` — a readable label for a tool. */
function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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

/**
 * Tool-call card. Distinguishes a browser-side **frontend action** (labelled and
 * given a distinct icon) from a backend tool, and reflects lifecycle state as a
 * status icon — spinner while running, check when its result is in, alert on
 * error. Arguments live in a collapsed `<details>` instead of a raw dump so the
 * card reads as an action, not JSON.
 */
export function ToolCallRenderer({ part, context }: RendererProps<ToolCallPart>) {
  const isFrontend = context.frontendToolNames?.includes(part.toolName) ?? false;
  const running = part.state === 'partial' || part.state === 'input-available';
  const errored = part.state === 'error';
  const label = humanizeToolName(part.toolName);
  const args = typeof part.args === 'string' ? part.args : JSON.stringify(part.args, null, 2);
  const hasArgs = Boolean(args) && args !== '""' && args !== '{}' && args.trim() !== '';
  const kindLabel = context.t(isFrontend ? 'message.pageAction' : 'message.toolCall');

  return (
    <div
      className="lch-part lch-tool"
      data-error={errored ? 'true' : undefined}
      data-running={running ? 'true' : undefined}
    >
      <div className="lch-tool__head" title={kindLabel}>
        {errored ? (
          <IconAlertTriangle size={ICON_SIZE} aria-hidden="true" />
        ) : running ? (
          <IconLoader2 className="lch-spin" size={ICON_SIZE} aria-hidden="true" />
        ) : (
          <IconCheck size={ICON_SIZE} aria-hidden="true" />
        )}
        <span className="lch-tool__name">{label}</span>
        <span className="lch-tool__badge">
          {isFrontend ? <IconClick size={13} aria-hidden="true" /> : <IconTool size={13} aria-hidden="true" />}
          {kindLabel}
        </span>
      </div>
      {hasArgs && (
        <details className="lch-tool__args">
          <summary>{context.t('message.toolArgs')}</summary>
          <pre>{args}</pre>
        </details>
      )}
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
        <span className="lch-tool__name">{humanizeToolName(part.toolName)}</span>
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
 * Canvas / generative-UI renderer. Looks the part's `component` name up in the
 * host-registered generative component map (`context.components`) and renders
 * the match with the model-supplied props. Falls back to a labelled JSON view
 * when no component is registered for the name — so unknown components degrade
 * gracefully instead of vanishing.
 */
export function CanvasRenderer({ part, context }: RendererProps<CanvasPart>) {
  const Component = context.components?.[part.component];
  if (Component) {
    return (
      <div className="lch-part lch-canvas">
        <Component props={part.props} context={context} />
      </div>
    );
  }
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
