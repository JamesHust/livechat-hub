import { m, useReducedMotion } from 'framer-motion';
import { IconFile, IconMicrophone, IconVideo, IconX } from '@tabler/icons-react';
import { useChatContext } from '../context';
import { ITEM_TRANSITION } from '../lib/motion';
import type { PendingAttachment } from '../hooks/useAttachments';

export interface AttachmentPreviewProps {
  attachment: PendingAttachment;
  onRemove: (id: string) => void;
}

/**
 * A single queued-attachment chip in the composer's preview strip: a thumbnail
 * for images, an icon chip for video/audio/file. Enters/exits with a spring so
 * adding or removing a file reads clearly; instant under reduced motion.
 */
export function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const { t } = useChatContext();
  const reduced = useReducedMotion() ?? false;
  const { id, kind, previewUrl, file } = attachment;

  return (
    <m.div
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      transition={ITEM_TRANSITION}
      className="bg-secondary relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
    >
      {kind === 'image' ? (
        <img src={previewUrl} alt={file.name} className="size-full object-cover" />
      ) : (
        <div className="text-muted-foreground flex flex-col items-center gap-1 px-1 text-center">
          {kind === 'video' ? (
            <IconVideo className="size-5" aria-hidden="true" />
          ) : kind === 'audio' ? (
            <IconMicrophone className="size-5" aria-hidden="true" />
          ) : (
            <IconFile className="size-5" aria-hidden="true" />
          )}
          <span className="line-clamp-2 w-full text-[10px] leading-tight break-all">
            {/* Voice clips have a synthetic filename, so show the localized
             * "Voice message" label instead — matches the AudioRenderer caption. */}
            {kind === 'audio' ? t('message.voiceMessage') : file.name}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={t('composer.removeAttachment')}
        className="bg-background/80 text-foreground hover:bg-background absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full shadow-sm backdrop-blur-sm"
      >
        <IconX className="size-3.5" aria-hidden="true" />
      </button>
    </m.div>
  );
}
