import type { UIMessage } from '@livechat-hub/shared';

export interface DownloadItem {
  url: string;
  name?: string;
}

/**
 * Every downloadable attachment on a message (files + media), in order — used to
 * offer a "download all" action when a message carries several. Pure so it can
 * be unit-tested without a DOM.
 */
export function downloadItems(message: UIMessage): DownloadItem[] {
  const items: DownloadItem[] = [];
  for (const part of message.parts) {
    if (part.type === 'file') items.push({ url: part.url, name: part.name });
    else if (part.type === 'image') items.push({ url: part.url, name: part.alt });
    else if (part.type === 'video') items.push({ url: part.url });
    else if (part.type === 'audio') items.push({ url: part.url, name: part.name });
  }
  return items;
}

/**
 * Trigger a browser download for each item. Downloads are staggered because
 * browsers throttle / block a burst of programmatic downloads fired at once.
 * (Client-side batch — no zipping, which would need a heavy dependency.)
 */
export function triggerDownloads(items: DownloadItem[]): void {
  if (typeof document === 'undefined') return;
  items.forEach((item, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = item.url;
      if (item.name) a.download = item.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 150);
  });
}
