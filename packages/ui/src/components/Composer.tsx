import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
  IconLoader2,
  IconMicrophone,
  IconPaperclip,
  IconPlayerStopFilled,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import type { MessagePart } from '@livechat-hub/shared';
import { useChatContext, useChatStore } from '../context';
import { fileToPart } from '../lib/attachments';
import { useAttachments } from '../hooks/useAttachments';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useControlSize } from '../hooks/use-control-size';
import { ITEM_TRANSITION } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { AttachmentPreview } from './AttachmentPreview';
import { EmojiPicker } from './EmojiPicker';

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function Composer() {
  const { t, store, uploadFile } = useChatContext();
  const status = useChatStore((s) => s.run.status);
  // A pending frontend-action confirmation also locks input until answered.
  const awaitingConfirmation = useChatStore((s) => s.actionConfirmations.length > 0);
  // Seed from the persisted draft so a half-typed message survives reload /
  // closing the widget. Written back on every edit; cleared once sent.
  const [value, setValue] = useState(() => store.getState().loadDraft());
  const [preparing, setPreparing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion() ?? false;

  // Update the local value and persist it as the draft in one step.
  const updateDraft = (next: string) => {
    setValue(next);
    store.getState().saveDraft(next);
  };

  const { attachments, add, remove, clear } = useAttachments();
  const recorder = useVoiceRecorder();
  const { roomy, actionButton, actionIcon } = useControlSize();

  const isRunning = status === 'running';
  // A paused (interrupted) turn or a pending action confirmation locks input
  // until the user answers the prompt.
  const isBusy = isRunning || preparing || status === 'interrupted' || awaitingConfirmation;
  const canSend = !isBusy && (value.trim().length > 0 || attachments.length > 0);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (isBusy || (!text && attachments.length === 0)) return;

    setPreparing(true);
    let parts: MessagePart[];
    try {
      parts = await Promise.all(
        attachments.map((a) => fileToPart(a.file, { uploadFile, durationMs: a.durationMs })),
      );
    } catch {
      setPreparing(false);
      return;
    }

    updateDraft('');
    clear();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setPreparing(false);
    void store.getState().sendMessage(text, parts);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  // Drop a picked glyph in at the caret (replacing any selection), then refocus
  // the textarea and re-fit its auto-grown height — mirroring the onChange path.
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    updateDraft(value.slice(0, start) + emoji + value.slice(end));
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const caret = start + emoji.length;
      node.setSelectionRange(caret, caret);
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
    });
  };

  // When the on-screen keyboard opens (mobile), the panel shrinks to the visual
  // viewport; pin the latest message to the bottom so it stays visible above
  // the keyboard. Scoped to the panel's own scroller — never the host page.
  const onFocus = () => {
    const list = textareaRef.current
      ?.closest('[role="dialog"]')
      ?.querySelector<HTMLElement>('[data-slot="message-list"]');
    if (!list) return;
    // Wait out the keyboard/viewport animation before measuring.
    setTimeout(() => {
      list.scrollTop = list.scrollHeight;
    }, 300);
  };

  const onFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) add(e.target.files);
    e.target.value = ''; // allow re-picking the same file
  };

  const stopRecording = async () => {
    const clip = await recorder.stop();
    if (clip) add([clip.file], { durationMs: clip.durationMs });
  };

  return (
    <div className="bg-card relative z-10 flex flex-col gap-2 p-3 shadow-[var(--lch-shadow-sm)]">
      <AnimatePresence initial={false}>
        {attachments.length > 0 && (
          <m.div
            layout={!reduced}
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={ITEM_TRANSITION}
            className="flex flex-wrap gap-2 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {attachments.map((a) => (
                <AttachmentPreview key={a.id} attachment={a} onRemove={remove} />
              ))}
            </AnimatePresence>
          </m.div>
        )}
      </AnimatePresence>

      {recorder.error === 'permission' && (
        <p className="text-destructive m-0 px-1 text-xs">{t('error.micPermission')}</p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {recorder.isRecording ? (
          <m.div
            key="recording"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={ITEM_TRANSITION}
            className="flex items-center gap-3 px-1"
          >
            <span
              className="bg-destructive size-2.5 animate-pulse rounded-full"
              aria-hidden="true"
            />
            <span className="text-foreground flex-1 text-sm tabular-nums" aria-live="polite">
              {t('composer.recording')} · {formatDuration(recorder.elapsedMs)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={recorder.cancel}
              aria-label={t('composer.recordCancel')}
              className={cn('text-muted-foreground', actionButton)}
            >
              <IconTrash className={actionIcon} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={() => void stopRecording()}
              aria-label={t('composer.recordStop')}
              style={{ backgroundImage: 'var(--lch-gradient)' }}
              className={cn(
                'text-on-gradient rounded-full shadow-[var(--lch-shadow)]',
                actionButton,
              )}
            >
              <IconPlayerStopFilled className={actionIcon} aria-hidden="true" />
            </Button>
          </m.div>
        ) : (
          <form key="composer" className="flex items-end gap-2" onSubmit={(e) => void submit(e)}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,*/*"
              onChange={onFilesPicked}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              aria-label={t('composer.attach')}
              className={cn('text-muted-foreground shrink-0', actionButton)}
            >
              <IconPaperclip className={actionIcon} aria-hidden="true" />
            </Button>
            {recorder.supported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void recorder.start()}
                disabled={isBusy}
                aria-label={t('composer.recordStart')}
                className={cn('text-muted-foreground shrink-0', actionButton)}
              >
                <IconMicrophone className={actionIcon} aria-hidden="true" />
              </Button>
            )}
            <Textarea
              ref={textareaRef}
              placeholder={t('composer.placeholder')}
              rows={1}
              value={value}
              onChange={(e) => {
                updateDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              aria-label={t('composer.placeholder')}
              // Floor the textarea at the action-button height so they bottom-align.
              className={cn(
                'bg-background max-h-30 flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm',
                roomy ? 'min-h-11' : 'min-h-10',
              )}
            />
            <EmojiPicker onSelect={insertEmoji} disabled={isBusy} />
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label={t('composer.send')}
              // Gradient round send button to echo the launcher/avatar accent.
              style={{ backgroundImage: 'var(--lch-gradient)' }}
              className={cn(
                'text-on-gradient shrink-0 rounded-full shadow-[var(--lch-shadow)] transition-transform hover:enabled:scale-105 active:enabled:scale-95',
                actionButton,
              )}
            >
              {preparing ? (
                <IconLoader2 className={cn('animate-spin', actionIcon)} aria-hidden="true" />
              ) : (
                <IconSend className={actionIcon} aria-hidden="true" />
              )}
            </Button>
          </form>
        )}
      </AnimatePresence>
    </div>
  );
}
