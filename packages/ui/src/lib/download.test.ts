import { describe, expect, it } from 'vitest';
import type { UIMessage } from '@livechat-hub/shared';
import { downloadItems } from './download';

describe('downloadItems', () => {
  it('collects every downloadable attachment in order, skipping text', () => {
    const message: UIMessage = {
      id: 'm1',
      role: 'user',
      parts: [
        { type: 'text', text: 'here are the files' },
        { type: 'image', url: 'blob:img', alt: 'chart.png' },
        { type: 'file', url: 'blob:doc', name: 'report.pdf' },
        { type: 'audio', url: 'blob:aud', name: 'note.webm' },
        { type: 'video', url: 'blob:vid' },
      ],
    };
    expect(downloadItems(message)).toEqual([
      { url: 'blob:img', name: 'chart.png' },
      { url: 'blob:doc', name: 'report.pdf' },
      { url: 'blob:aud', name: 'note.webm' },
      { url: 'blob:vid', name: undefined },
    ]);
  });

  it('returns nothing for a text-only message', () => {
    const message: UIMessage = {
      id: 'm2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'no attachments' }],
    };
    expect(downloadItems(message)).toEqual([]);
  });
});
