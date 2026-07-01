import { useChatContext } from '../context';
import { formatDayLabel } from '../lib/format';

/**
 * A centered day label ("Today" / "Yesterday" / a date) separating message
 * groups by calendar day. The label re-formats when the locale changes.
 */
export function DayDivider({ timestamp }: { timestamp: number }) {
  const { t, locale } = useChatContext();
  const label = formatDayLabel(locale, timestamp, {
    today: t('message.today'),
    yesterday: t('message.yesterday'),
  });
  if (!label) return null;

  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={label}>
      <span className="bg-border h-px flex-1" aria-hidden="true" />
      <span className="text-muted-foreground text-[11px] font-medium">{label}</span>
      <span className="bg-border h-px flex-1" aria-hidden="true" />
    </div>
  );
}
