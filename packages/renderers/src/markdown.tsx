import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free markdown renderer. It builds React nodes directly
 * (never raw HTML) so there is no `dangerouslySetInnerHTML` and therefore no
 * injection surface. Supports the subset chat assistants emit most: fenced and
 * inline code, bold, italic, links, and paragraph / line breaks.
 */
export function renderMarkdown(source: string): ReactNode {
  const blocks = splitFencedCode(source);
  return blocks.map((block, i) => {
    if (block.type === 'code') {
      return (
        <pre key={i}>
          <code>{block.content}</code>
        </pre>
      );
    }
    return (
      <Fragment key={i}>
        {block.content
          .split(/\n{2,}/)
          .filter((p) => p.trim().length > 0)
          .map((para, j) => (
            <p key={j}>{renderInline(para)}</p>
          ))}
      </Fragment>
    );
  });
}

interface Block {
  type: 'code' | 'text';
  content: string;
}

function splitFencedCode(source: string): Block[] {
  const blocks: Block[] = [];
  const regex = /```[^\n]*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: source.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'code', content: match[1] ?? '' });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) {
    blocks.push({ type: 'text', content: source.slice(lastIndex) });
  }
  return blocks.length > 0 ? blocks : [{ type: 'text', content: source }];
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string): ReactNode {
  const segments = text.split(INLINE).filter((s) => s !== '');
  return segments.map((seg, i) => {
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return <code key={i}>{seg.slice(1, -1)}</code>;
    }
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return <strong key={i}>{seg.slice(2, -2)}</strong>;
    }
    if (seg.startsWith('*') && seg.endsWith('*')) {
      return <em key={i}>{seg.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(seg);
    if (link && isSafeHref(link[2]!)) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return withLineBreaks(seg, i);
  });
}

function withLineBreaks(text: string, key: number): ReactNode {
  const lines = text.split('\n');
  return (
    <Fragment key={key}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </Fragment>
  );
}

function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href);
}
