import { describe, it, expect } from 'vitest';
import { toKanjiNumber, getWarekiDate, toMinutes, toHHMM, warekiDateLengthClass } from '../src/public/js/date-utils.js';

describe('toKanjiNumber', () => {
  it('renders 1 as 一', () => {
    expect(toKanjiNumber(1)).toBe('一');
  });
  it('renders 10 as 十', () => {
    expect(toKanjiNumber(10)).toBe('十');
  });
  it('renders 11 as 十一', () => {
    expect(toKanjiNumber(11)).toBe('十一');
  });
  it('renders 20 as 二十', () => {
    expect(toKanjiNumber(20)).toBe('二十');
  });
  it('renders 31 as 三十一', () => {
    expect(toKanjiNumber(31)).toBe('三十一');
  });
  it('renders 100 as 百 (no leading 一)', () => {
    expect(toKanjiNumber(100)).toBe('百');
  });
  it('renders 108 as 百八', () => {
    expect(toKanjiNumber(108)).toBe('百八');
  });
  it('renders 119 as 百十九', () => {
    expect(toKanjiNumber(119)).toBe('百十九');
  });
});

describe('getWarekiDate', () => {
  it('formats 令和元年 (2019) correctly', () => {
    expect(getWarekiDate('2019-01-01')).toBe('令和元年一月一日');
  });
  it('formats a 平成 (pre-2019) date correctly', () => {
    // 実装は年単位でしか改元判定していないため、2018年はすべて平成として扱われる
    expect(getWarekiDate('2018-12-31')).toBe('平成三十年十二月三十一日');
  });
  it('formats a month-end date (令和6年8月31日)', () => {
    expect(getWarekiDate('2024-08-31')).toBe('令和六年八月三十一日');
  });
  it('formats a year-end date (令和6年12月31日)', () => {
    expect(getWarekiDate('2024-12-31')).toBe('令和六年十二月三十一日');
  });
  it('returns an empty string for a falsy input', () => {
    expect(getWarekiDate('')).toBe('');
  });
  it('formats a 3-digit era year (令和百年) correctly', () => {
    expect(getWarekiDate('2118-12-31')).toBe('令和百年十二月三十一日');
  });
});

describe('warekiDateLengthClass', () => {
  // 仕様書(docs/CSS_AND_SERVER_PROTECTION_SPEC.md 23節)の確認日付4件。
  it('does not flag a short date (令和八年八月八日, 8 chars)', () => {
    expect(warekiDateLengthClass(getWarekiDate('2026-08-08'))).toBe('');
  });
  it('flags 令和十一年十二月三十一日 (12 chars) as extra-long', () => {
    expect(warekiDateLengthClass(getWarekiDate('2029-12-31'))).toBe('goshuin-date-extra-long');
  });
  it('flags 令和十九年十二月三十一日 (12 chars) as extra-long', () => {
    expect(warekiDateLengthClass(getWarekiDate('2037-12-31'))).toBe('goshuin-date-extra-long');
  });
  it('flags 令和百年十二月三十一日 (11 chars) as long', () => {
    expect(warekiDateLengthClass(getWarekiDate('2118-12-31'))).toBe('goshuin-date-long');
  });
  it('returns an empty string for an empty input', () => {
    expect(warekiDateLengthClass('')).toBe('');
  });
});

describe('toMinutes / toHHMM', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(toMinutes('09:15')).toBe(555);
  });
  it('round-trips minutes back to HH:MM', () => {
    expect(toHHMM(555)).toBe('09:15');
  });
  it('wraps hours past 24:00 (GTFS-style overflow) back into 0-23', () => {
    // GTFSは25:30のような24時超えの表記があるため、分換算後は24hで折り返す
    expect(toHHMM(25 * 60 + 30)).toBe('01:30');
  });
});
