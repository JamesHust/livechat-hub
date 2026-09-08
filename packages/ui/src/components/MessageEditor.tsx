import { useEffect, useRef, useState } from 'react';
import { useChatContext } from '../context';
import { cn } from '../lib/utils';

export interface MessageEditorProps {
  initialValue: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/**
 * Inline editor shown in place of a bubble while editing a message. Cmd/Ctrl+Enter
 * saves, Escape cancels. Human-chat editing — no re-run; the store just rewrites
 * the text and flags it `edited`.
 */
export function MessageEditor({ initialValue, onSave, onCancel }: MessageEditorProps) {
  const { t } = useChatContext();
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <div className="flex w-full min-w-[13rem] flex-col gap-1.5">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value);
        }}
        rows={2}
        aria-label={t('message.edit')}
        className="bg-background text-foreground focus-visible:ring-ring/60 min-h-[2.75rem] w-full resize-none rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2"
        >
          {t('message.editCancel')}
        </button>
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={!value.trim()}
          style={{ backgroundImage: 'var(--lch-gradient)' }}
          className={cn(
            'text-on-gradient focus-visible:ring-ring/60 rounded-full px-3 py-1 text-xs font-semibold outline-none transition-transform focus-visible:ring-2',
            'hover:enabled:scale-[1.03] active:enabled:scale-[0.97] disabled:opacity-50',
          )}
        >
          {t('message.editSave')}
        </button>
      </div>
    </div>
  );
}
