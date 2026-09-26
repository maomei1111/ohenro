import { describe, it, expect } from 'vitest';
import { todayJst, feedServiceRange, isCurrentlyValid, partitionAgenciesByValidity } from '../src/gtfs-validity';

describe('todayJst', () => {
  it('uses the Japan date, not the UTC date', () => {
    // UTC 2026-09-25 16:00 は日本時間で 2026-09-26 01:00
    expect(todayJst(new Date('2026-09-25T16:00:00Z'))).toBe('20260926');
    expect(todayJst(new Date('2026-09-25T14:59:00Z'))).toBe('20260925');
  });
});

describe('feedServiceRange', () => {
  it('spans the earliest start to the latest end of calendar.txt', () => {
    const r = feedServiceRange(
      [
        { start_date: '20260401', end_date: '20270331' },
        { start_date: '20260301', end_date: '20260930' },
      ],
      []
    );
    expect(r).toEqual({ start: '20260301', end: '20270331' });
  });

  it('counts added service days (exception_type=1) but ignores cancellations (2)', () => {
    const r = feedServiceRange(
      [{ start_date: '20260401', end_date: '20260930' }],
      [
        { date: '20261231', exception_type: 1 },
        { date: '20270105', exception_type: 2 },
      ]
    );
    expect(r.end).toBe('20261231');
  });

  it('works for feeds defined only by calendar_dates.txt', () => {
    const r = feedServiceRange([], [{ date: '20261001', exception_type: 1 }, { date: '20261015', exception_type: 1 }]);
    expect(r).toEqual({ start: '20261001', end: '20261015' });
  });

  it('returns nulls for an empty feed', () => {
    expect(feedServiceRange([], [])).toEqual({ start: null, end: null });
  });
});

describe('isCurrentlyValid', () => {
  it('is valid through the last service day (inclusive)', () => {
    expect(isCurrentlyValid({ start: '20260401', end: '20260926' }, '20260926')).toBe(true);
  });
  it('is expired the day after the last service day', () => {
    expect(isCurrentlyValid({ start: '20260401', end: '20260925' }, '20260926')).toBe(false);
  });
  it('is not valid without any service days', () => {
    expect(isCurrentlyValid({ start: null, end: null }, '20260926')).toBe(false);
  });
});

describe('partitionAgenciesByValidity', () => {
  it('splits agencies into valid and expired (sorted)', () => {
    const r = partitionAgenciesByValidity(
      [
        { agency_key: 'b', end_date: '20270331' },
        { agency_key: 'a', end_date: '20260831' },
        { agency_key: 'c', end_date: '20260926' },
        { agency_key: 'd', end_date: null },
      ],
      '20260926'
    );
    expect(r.valid).toEqual(['b', 'c']);
    expect(r.expired).toEqual(['a', 'd']);
  });
});
