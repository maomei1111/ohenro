import { describe, it, expect } from 'vitest';
import {
  TEMPLE_NAMES_EN,
  TEMPLE_NAMES_KO,
  TEMPLE_NAMES_ZH_CN,
  TEMPLE_NAMES_ZH_TW,
  templeNameForLang,
  templeNoPrefix,
  forecastAreaNameForLang,
} from '../src/public/js/constants.js';
import { I18N } from '../src/public/js/i18n.js';
import temples from '../src/data/temples_88.json';
import templeAreas from '../src/data/temple_jma_areas.json';

describe('temple names per language', () => {
  it('has a name for all 88 temples in every non-Japanese name table', () => {
    for (const table of [TEMPLE_NAMES_EN, TEMPLE_NAMES_KO, TEMPLE_NAMES_ZH_CN, TEMPLE_NAMES_ZH_TW]) {
      for (let no = 1; no <= 88; no++) expect(table[no], `temple ${no}`).toBeTruthy();
    }
  });

  it('writes Korean names in Hangul only', () => {
    for (let no = 1; no <= 88; no++) expect(TEMPLE_NAMES_KO[no]).toMatch(/^[가-힣]+$/);
  });

  it('returns the name for the display language, and the Japanese name for ja or unknown languages', () => {
    expect(templeNameForLang(1, '霊山寺', 'ja')).toBe('霊山寺');
    expect(templeNameForLang(1, '霊山寺', 'en')).toBe('Ryozenji');
    expect(templeNameForLang(1, '霊山寺', 'de')).toBe('Ryozenji');
    expect(templeNameForLang(1, '霊山寺', 'pt')).toBe('Ryozenji');
    expect(templeNameForLang(1, '霊山寺', 'ko')).toBe('료젠지');
    expect(templeNameForLang(1, '霊山寺', 'zh-CN')).toBe('灵山寺');
    expect(templeNameForLang(1, '霊山寺', 'zh-TW')).toBe('靈山寺');
    expect(templeNameForLang(1, '霊山寺', 'xx')).toBe('霊山寺');
  });

  it('keeps the long-vowel + vowel reading of 香園寺 (こうおんじ) intact in Korean', () => {
    expect(TEMPLE_NAMES_KO[61]).toBe('고온지');
  });

  it('prefixes the temple number in the style of each language', () => {
    expect(templeNoPrefix(1, 'ja')).toBe('1番 ');
    expect(templeNoPrefix(1, 'zh-TW')).toBe('1番 ');
    expect(templeNoPrefix(1, 'ko')).toBe('1번 ');
    expect(templeNoPrefix(1, 'en')).toBe('1. ');
    expect(templeNoPrefix(1, 'de')).toBe('1. ');
  });

  it('does not leave Japanese-only kanji forms in the Chinese names of temples that differ', () => {
    const ja = Object.fromEntries((temples as { no: number; name: string }[]).map((t) => [t.no, t.name]));
    expect(TEMPLE_NAMES_ZH_TW[2]).not.toBe(ja[2]); // 極楽寺 → 極樂寺
    expect(TEMPLE_NAMES_ZH_CN[2]).not.toBe(ja[2]); // 極楽寺 → 极乐寺
    expect(TEMPLE_NAMES_ZH_TW[17]).toBe('井戶寺');
    expect(TEMPLE_NAMES_ZH_CN[78]).toBe('乡照寺');
  });
});

describe('forecast area names per language', () => {
  const LANGS = ['en', 'ko', 'zh-CN', 'zh-TW', 'de', 'pt'];
  const PREF: Record<string, string> = { '360000': '徳島県', '370000': '香川県', '380000': '愛媛県', '390000': '高知県' };

  it('translates every area name the server can return (sub-areas and whole prefectures)', () => {
    const areas = Object.values(templeAreas as Record<string, { forecastOfficeCode: string; forecastAreaName: string }>);
    const names = new Set<string>();
    for (const a of areas) {
      const pref = PREF[a.forecastOfficeCode];
      names.add(pref); // 週間予報は県名で返る
      names.add(a.forecastAreaName.startsWith(pref) ? a.forecastAreaName : pref + a.forecastAreaName);
    }
    for (const name of names) {
      for (const lang of LANGS) {
        const out = forecastAreaNameForLang(name, lang);
        expect(out, `${name} in ${lang}`).toBeTruthy();
        expect(out, `${name} in ${lang}`).not.toBe(name);
      }
    }
  });

  it('returns the Japanese name unchanged for ja and for unknown areas', () => {
    expect(forecastAreaNameForLang('徳島県北部', 'ja')).toBe('徳島県北部');
    expect(forecastAreaNameForLang('どこか', 'en')).toBe('どこか');
  });
});

describe('goshuin progress labels', () => {
  it('are defined in every language (no English fallback for other languages)', () => {
    for (const lang of Object.keys(I18N)) {
      expect(typeof I18N[lang].zukan_progress_heading).toBe('string');
      expect(I18N[lang].zukan_visited_count(12)).toContain('12');
      expect(I18N[lang].zukan_unvisited_count(76)).toContain('76');
    }
    expect(I18N.pt.zukan_visited_count(12)).not.toContain('visited');
    expect(I18N.ko.zukan_unvisited_count(76)).not.toContain('remaining');
  });
});
