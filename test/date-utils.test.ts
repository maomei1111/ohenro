import { describe, it, expect } from 'vitest';
import { toKanjiNumber, getWarekiDate, toMinutes, toHHMM } from '../src/public/js/date-utils.js';

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
