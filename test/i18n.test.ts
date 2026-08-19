import { describe, it, expect } from 'vitest';
import { I18N, createTranslator } from '../src/public/js/i18n.js';

const LANGS = Object.keys(I18N);

describe('I18N dictionary', () => {
  it('defines the 7 supported languages', () => {
    expect(LANGS.sort()).toEqual(['de', 'en', 'ja', 'ko', 'pt', 'zh-CN', 'zh-TW'].sort());
  });

  const jaKeys = new Set(Object.keys(I18N.ja));

  for (const lang of LANGS) {
    if (lang === 'ja') continue;
    it(`has every ja key present in ${lang} (no missing translations)`, () => {
      const langKeys = new Set(Object.keys(I18N[lang]));
      const missing = [...jaKeys].filter((k) => !langKeys.has(k));
      expect(missing).toEqual([]);
    });
  }
});

describe('createTranslator', () => {
  it('looks up a string key for the current language', () => {
    const t = createTranslator(() => 'en');
    expect(t('btn_run')).toBe(I18N.en.btn_run);
  });

  it('re-evaluates the language getter on every call (language switching)', () => {
    let lang = 'ja';
    const t = createTranslator(() => lang);
    expect(t('btn_run')).toBe(I18N.ja.btn_run);
    lang = 'en';
    expect(t('btn_run')).toBe(I18N.en.btn_run);
  });

  it('resolves a function-valued entry by calling it with the given args', () => {
    const t = createTranslator(() => 'ja');
    expect(t('nokyo_countdown', 5)).toBe(I18N.ja.nokyo_countdown(5));
  });

  it('falls back to the ja entry when the current language is missing a key, never showing a raw key name', () => {
    const t = createTranslator(() => 'en');
    // I18N.enに存在しない架空のキーは無いはずなので、実在するキーで
    // 「未翻訳キーがそのまま表示されない」ことを保証するfallback経路自体を検証する:
    // I18N[lang][key] が undefined の場合に I18N.ja[key] へ落ちること。
    const original = I18N.en.btn_run;
    delete (I18N.en as Record<string, unknown>).btn_run;
    try {
      expect(t('btn_run')).toBe(I18N.ja.btn_run);
      expect(t('btn_run')).not.toBe('btn_run');
    } finally {
      (I18N.en as Record<string, unknown>).btn_run = original;
    }
  });
});
