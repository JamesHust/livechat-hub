import type { MessagePart, UploadFn } from '@livechat-hub/shared';

/** Broad attachment category derived from a file's MIME type. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

/** Classify a file into the message-part kind it maps to. */
export function kindForFile(file: { type: string }): AttachmentKind {
  const mime = file.type;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Read a File/Blob as a `data:` URL — the no-backend default for `uploadFile`. */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Probe an image data/object URL for its intrinsic pixel dimensions. */
function imageSize(url: string): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
  });
}

/**
 * Convert a user-attached file into the appropriate canonical {@link MessagePart}.
 * Resolves the file to a URL via `uploadFile` when provided, otherwise inlines it
 * as a `data:` URL. `durationMs` carries through for recorded voice clips.
 */
export async function fileToPart(
  file: File,
  options?: { uploadFile?: UploadFn; durationMs?: number },
): Promise<MessagePart> {
  const kind = kindForFile(file);
  const uploaded = options?.uploadFile
    ? await options.uploadFile(file)
    : { url: await readAsDataUrl(file) };
  const url = uploaded.url;
  const mimeType = uploaded.mimeType ?? (file.type || undefined);

  switch (kind) {
    case 'image': {
      const { width, height } = await imageSize(url);
      return { type: 'image', url, alt: file.name, mimeType, width, height };
    }
    case 'video':
      return { type: 'video', url, mimeType };
    case 'audio':
      return {
        type: 'audio',
        url,
        mimeType,
        durationMs: options?.durationMs,
        // A bare recording has a synthetic name; keep it off so the renderer
        // falls back to the localized "Voice message" caption.
        name: file.name && !file.name.startsWith('voice-message') ? file.name : undefined,
      };
    case 'file':
    default:
      return { type: 'file', url, name: file.name, mimeType, size: file.size };
  }
}
