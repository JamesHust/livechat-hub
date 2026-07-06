import { useEffect, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { IconX } from '@tabler/icons-react';
import type { Artifact } from '@livechat-hub/shared';
import { renderMarkdown } from '@livechat-hub/renderers';
import { useChatContext, useChatStore } from '../context';
import { useControlSize } from '../hooks/use-control-size';
import { ITEM_TRANSITION, PANEL_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export interface ArtifactPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Artifact panel — a side-panel document/preview viewer rendered as a sheet over
 * the chat. Surfaces the agent-authored artifacts the store collects out-of-band
 * from `ARTIFACT_UPDATE`, updating live as new payloads stream in. Slides in from
 * the right; fades under reduced motion. Escape closes it.
 */
export function ArtifactPanel({ open, onClose }: ArtifactPanelProps) {
  return <AnimatePresence>{open && <ArtifactSheet onClose={onClose} />}</AnimatePresence>;
}

function ArtifactSheet({ onClose }: { onClose: () => void }) {
  const { t } = useChatContext();
  const { chromeButton, chromeIcon } = useControlSize();
  const artifacts = useChatStore((s) => s.artifacts);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Most-recently-updated first.
  const ordered = Object.values(artifacts).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to (and follow) the freshest artifact until the user picks one that
  // still exists.
  const selected = ordered.find((a) => a.id === selectedId) ?? ordered[0] ?? null;

  return (
    <m.div
      role="dialog"
      aria-label={t('artifact.title')}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      transition={PANEL_TRANSITION}
      className="bg-background absolute inset-0 z-20 flex flex-col"
    >
      <header className="bg-card flex items-center gap-2 px-4 py-3 shadow-[var(--lch-shadow-sm)]">
        <p className="m-0 flex-1 truncate font-semibold tracking-tight">{t('artifact.title')}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('artifact.close')}
          className={cn('text-muted-foreground', chromeButton)}
        >
          <IconX className={chromeIcon} aria-hidden="true" />
        </Button>
      </header>

      {ordered.length === 0 ? (
        <ArtifactEmpty title={t('artifact.empty')} body={t('artifact.emptyBody')} />
      ) : (
        <>
          {ordered.length > 1 && (
            <div
              role="tablist"
              aria-label={t('artifact.title')}
              className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2"
            >
              {ordered.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  role="tab"
                  aria-selected={artifact.id === selected?.id}
                  onClick={() => setSelectedId(artifact.id)}
                  className={cn(
                    'focus-visible:ring-ring/60 shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2',
                    artifact.id === selected?.id
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {artifactLabel(artifact)}
                </button>
              ))}
            </div>
          )}
          {selected && <ArtifactContent artifact={selected} />}
        </>
      )}
    </m.div>
  );
}

/** A stable, human-readable label for an artifact tab. */
function artifactLabel(artifact: Artifact): string {
  return artifact.title ?? artifact.id;
}

function ArtifactContent({ artifact }: { artifact: Artifact }) {
  const reduced = useReducedMotion() ?? false;
  const isMarkdown =
    artifact.kind === 'markdown' || artifact.kind === 'text' || artifact.kind === 'md';
  const text =
    typeof artifact.payload === 'string'
      ? artifact.payload
      : JSON.stringify(artifact.payload, null, 2);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain p-4">
      {artifact.title && <h2 className="mt-0 mb-3 text-base font-semibold">{artifact.title}</h2>}
      {/* Re-key on the payload so a live ARTIFACT_UPDATE gently re-animates the
       * refreshed content instead of snapping. */}
      <m.div
        key={typeof artifact.payload === 'string' ? artifact.payload.length : artifact.updatedAt}
        initial={reduced ? false : { opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={ITEM_TRANSITION}
      >
        {isMarkdown ? (
          <div className="lch-markdown">{renderMarkdown(text)}</div>
        ) : (
          <pre className="bg-muted/50 overflow-x-auto rounded-lg p-3 text-xs">{text}</pre>
        )}
      </m.div>
    </div>
  );
}

/** Empty-state spot illustration — hand-authored in the Tabler house style. */
function ArtifactEmpty({ title, body }: { title: string; body: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={PANEL_TRANSITION}
      className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
    >
      <svg
        viewBox="0 0 96 96"
        className="text-primary size-20"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="26" y="18" width="44" height="60" rx="6" className="fill-primary/10" />
        <path d="M36 34h24M36 46h24M36 58h16" />
        <path d="M62 12l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" className="fill-primary/20" />
      </svg>
      <p className="text-foreground m-0 font-semibold">{title}</p>
      <p className="m-0 max-w-[15rem] text-sm">{body}</p>
    </m.div>
  );
}
