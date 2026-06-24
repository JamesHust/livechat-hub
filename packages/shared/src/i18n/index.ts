import type { Locale } from '../types/config';
import { en, type Dictionary, type StringKey } from './en';
import { vi } from './vi';
import { ja } from './ja';
import { zh } from './zh';
import { id } from './id';

export type { Dictionary, StringKey };
export { en, vi, ja, zh, id };

export const dictionaries: Record<Locale, Dictionary> = { en, vi, ja, zh, id };

/** Native display name for each locale, for language pickers. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  zh: '中文',
  id: 'Bahasa Indonesia',
};

/** Selectable locales in display order. */
export const availableLocales: Locale[] = ['en', 'vi', 'ja', 'zh', 'id'];

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
