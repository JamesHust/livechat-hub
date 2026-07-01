/**
 * Locale-aware formatting for message timestamps and day dividers. All output
 * flows through `Intl`, so switching the widget locale re-formats live. Every
 * formatter degrades to an empty string rather than throwing on an exotic
 * locale/runtime.
 */

const DAY_MS = 86_400_000;

/** Short time-of-day, e.g. `3:04 PM` (en) or `15:04` (24-hour locales). */
export function formatTime(locale: string, epochMs: number): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(epochMs);
  } catch {
    return '';
  }
}

/** Local calendar-day bucket (midnight epoch ms) used to group messages by day. */
export function dayBucket(epochMs: number): number {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Day-divider label: localized "Today" / "Yesterday" for the two most recent
 * days, otherwise a locale-formatted date (year shown only when it differs from
 * the current year). Callers pass the already-translated relative labels so this
 * stays free of the i18n layer.
 */
export function formatDayLabel(
  locale: string,
  epochMs: number,
  labels: { today: string; yesterday: string },
): string {
  const today = dayBucket(Date.now());
  const bucket = dayBucket(epochMs);
  if (bucket === today) return labels.today;
  if (bucket === today - DAY_MS) return labels.yesterday;
  try {
    const sameYear = new Date(epochMs).getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(epochMs);
  } catch {
    return '';
  }
}
