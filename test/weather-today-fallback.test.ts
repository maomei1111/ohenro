import { describe, it, expect } from 'vitest';
import { selectShortTermForecast, type ParsedAreaReport } from '../src/jma-weather';

// 夕方(17時)発表の短期予報には、当日日中の期間が含まれない。今日の日付で朝の出発時刻のまま検索しても
// 当日の全区間が「取得できません」にならないよう、同じ日の残りの期間のうち最初のものを使う。
function eveningReport(): ParsedAreaReport {
  return {
    publishingOffice: '松山地方気象台',
    publishedAt: '2026-10-03T17:00:00+09:00',
    weatherByArea: new Map([
      [
        '380010',
        [
          { dateTime: '2026-10-03T17:00:00+09:00', durationHours: 7, name: '今夜', weatherCode: '100', weatherText: '晴れ' },
          { dateTime: '2026-10-04T00:00:00+09:00', durationHours: 24, name: '明日', weatherCode: '213', weatherText: 'くもり後時々雨' },
        ],
      ],
    ]),
    popByArea: new Map([
      [
        '380010',
        [
          { dateTime: '2026-10-03T18:00:00+09:00', durationHours: 6, name: null, probability: 0 },
          { dateTime: '2026-10-04T00:00:00+09:00', durationHours: 6, name: null, probability: 10 },
          { dateTime: '2026-10-04T06:00:00+09:00', durationHours: 6, name: null, probability: 40 },
        ],
      ],
    ]),
    tempByStation: new Map(),
  };
}
const select = (iso: string) =>
  selectShortTermForecast(eveningReport(), '380000', '380010', '中予', '73166', new Date(iso));

describe('selectShortTermForecast for a time of today that the latest report no longer covers', () => {
  it('uses the first remaining period of the same day instead of returning available:false', () => {
    const r = select('2026-10-03T07:30:00+09:00');
    expect(r.available).toBe(true);
    expect(r.weatherText).toBe('晴れ'); // 今夜の期間
    expect(r.precipitationProbability).toBe(0);
    expect(r.precipitationPeriod).toBe('18:00-00:00'); // どの時間帯の予報かを明示する
  });

  it('still prefers the period that actually contains the target time', () => {
    const r = select('2026-10-04T07:30:00+09:00');
    expect(r.weatherText).toBe('くもり後時々雨');
    expect(r.precipitationProbability).toBe(40);
    expect(r.precipitationPeriod).toBe('06:00-12:00');
  });

  it('does not borrow a period from another day', () => {
    // 前日の日時には、同じ日に始まる期間が1つも無い → 従来どおり取得不可
    expect(select('2026-10-02T07:30:00+09:00').available).toBe(false);
    // 予報の最後の期間より後の日時も、翌日以降の期間を流用しない
    expect(select('2026-10-05T07:30:00+09:00').available).toBe(false);
  });
});
