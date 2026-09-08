import { describe, expect, it } from 'vitest';
import { en } from './en';
import {
  availableLocales,
  createTranslator,
  dictionaries,
  getDictionary,
  isRtlLocale,
  localeNames,
} from './index';

describe('i18n', () => {
  it('falls back to English for unknown locales', () => {
    // @ts-expect-error intentional bad locale
    expect(getDictionary('xx')['composer.send']).toBe('Send');
  });

  it('returns localized strings', () => {
    const t = createTranslator('vi');
    expect(t('composer.send')).toBe('Gửi');
  });

  it('honours per-instance overrides', () => {
    const t = createTranslator('en', { 'header.title': 'Acme Support' });
    expect(t('header.title')).toBe('Acme Support');
  });

  it('localizes the newly added locales', () => {
    expect(createTranslator('ja')('composer.send')).toBe('送信');
    expect(createTranslator('zh')('composer.send')).toBe('发送');
    expect(createTranslator('id')('composer.send')).toBe('Kirim');
    expect(createTranslator('ar')('composer.send')).toBe('إرسال');
    expect(createTranslator('he')('composer.send')).toBe('שליחה');
  });

  it('marks Arabic and Hebrew as right-to-left, others left-to-right', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('he')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('ja')).toBe(false);
  });

  it('exposes a native display name for every available locale', () => {
    for (const locale of availableLocales) {
      expect(localeNames[locale]).toBeTruthy();
    }
  });

  it('keeps every dictionary in sync with the English key set', () => {
    const expectedKeys = Object.keys(en).sort();
    for (const locale of availableLocales) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(expectedKeys);
    }
  });
});
