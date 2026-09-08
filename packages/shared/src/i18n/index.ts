import type { Locale } from '../types/config';
import { en, type Dictionary, type StringKey } from './en';
import { vi } from './vi';
import { ja } from './ja';
import { zh } from './zh';
import { id } from './id';
import { ar } from './ar';
import { he } from './he';

export type { Dictionary, StringKey };
export { en, vi, ja, zh, id, ar, he };

export const dictionaries: Record<Locale, Dictionary> = { en, vi, ja, zh, id, ar, he };

/** Native display name for each locale, for language pickers. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  zh: '中文',
  id: 'Bahasa Indonesia',
  ar: 'العربية',
  he: 'עברית',
};

/** Selectable locales in display order. */
export const availableLocales: Locale[] = ['en', 'vi', 'ja', 'zh', 'id', 'ar', 'he'];

/** Right-to-left locales — the widget flips `dir` for these. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar', 'he']);

/** Whether a locale is written right-to-left (drives `dir="rtl"` on the root). */
export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

/** Resolve a string key for a locale, with optional per-instance overrides. */
export function createTranslator(
  locale: Locale,
  overrides?: Partial<Record<string, string>>,
): (key: StringKey) => string {
  const dict = getDictionary(locale);
  return (key) => overrides?.[key] ?? dict[key] ?? key;
}
