import { useCallback, useEffect, useRef, useState } from 'react';
import { kindForFile, type AttachmentKind } from '../lib/attachments';

export interface PendingAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** Object URL for in-composer preview (revoked on remove/clear/unmount). */
  previewUrl: string;
  /** Recording length for voice clips, carried through to the audio part. */
  durationMs?: number;
}

export interface AttachmentMeta {
  durationMs?: number;
}

export interface AttachmentsApi {
  attachments: PendingAttachment[];
  add: (files: Iterable<File>, meta?: AttachmentMeta) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * Holds the files queued in the composer before send. Each gets a local object
 * URL for preview; URLs are revoked when the attachment is removed, cleared, or
 * the composer unmounts so we never leak blob handles.
 */
export function useAttachments(): AttachmentsApi {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const counter = useRef(0);
  // Mirror of live URLs so the unmount cleanup sees the latest set.
  const urlsRef = useRef<Set<string>>(new Set());

  const add = useCallback((files: Iterable<File>, meta?: AttachmentMeta) => {
    const next: PendingAttachment[] = [];
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      urlsRef.current.add(previewUrl);
      counter.current += 1;
      next.push({
        id: `att-${counter.current}`,
        file,
        kind: kindForFile(file),
        previewUrl,
        durationMs: meta?.durationMs,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  }, []);

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        urlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => {
        URL.revokeObjectURL(a.previewUrl);
        urlsRef.current.delete(a.previewUrl);
      });
      return [];
    });
  }, []);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current.clear();
    },
    [],
  );

  return { attachments, add, remove, clear };
}
