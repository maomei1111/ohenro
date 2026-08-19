import { describe, it, expect } from 'vitest';
import {
  gtfsTimeToMinutes,
  pickBestCandidate,
  walkMinutesForMeters,
  serviceRunsOnDateClause,
} from '../src/query-next-bus';

describe('gtfsTimeToMinutes', () => {
  it('parses a normal time within a single day', () => {
    expect(gtfsTimeToMinutes('09:15:00')).toBe(9 * 60 + 15);
  });
  it('parses a day-crossing GTFS time (e.g. 25:30:00 for a late-night bus)', () => {
    // GTFSは24時を超える表記で深夜便を表す。分に正規化する際はそのまま24h超の値になる。
    expect(gtfsTimeToMinutes('25:30:00')).toBe(25 * 60 + 30);
  });
});

describe('walkMinutesForMeters', () => {
  it('converts meters to minutes at the assumed 4km/h walking speed', () => {
    // 1000m / 4km/h * 60 = 15分
    expect(walkMinutesForMeters(1000)).toBeCloseTo(15, 5);
  });
});

describe('pickBestCandidate (tie-break within NEGLIGIBLE_DIFF_MIN=3分)', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickBestCandidate([])).toBeNull();
  });

  it('picks the single earliest-arriving candidate when arrival times differ by more than 3 minutes', () => {
    const candidates = [
      { arrivalMin: 100, walkToStopMin: 1, walkFromStopMin: 1 },
      { arrivalMin: 110, walkToStopMin: 0, walkFromStopMin: 0 },
    ];
    expect(pickBestCandidate(candidates)).toBe(candidates[0]);
  });

  it('prefers the candidate with less total walking among nearly-simultaneous arrivals (within 3 min)', () => {
    const candidates = [
      { arrivalMin: 100, walkToStopMin: 10, walkFromStopMin: 10 }, // 到着は最速だが徒歩が長い
      { arrivalMin: 102, walkToStopMin: 2, walkFromStopMin: 2 }, // 2分遅いが徒歩が短い(差3分以内)
    ];
    expect(pickBestCandidate(candidates)).toBe(candidates[1]);
  });

  it('does not apply the walking tie-break when the arrival gap exceeds 3 minutes', () => {
    const candidates = [
      { arrivalMin: 100, walkToStopMin: 10, walkFromStopMin: 10 },
      { arrivalMin: 104, walkToStopMin: 0, walkFromStopMin: 0 }, // 4分遅い→tie-break対象外
    ];
    expect(pickBestCandidate(candidates)).toBe(candidates[0]);
  });
});

// calendar_dates(運休/臨時運行)の判定は現状SQL文字列として構築されており、
// このテスト環境には接続可能なDBが無いため、生成されるSQLの形(exception_typeの
// 使い分け)を検証する構造テストに留める。実データでの検証はDB接続可能な環境での
// 手動確認/インテグレーションテストが必要。
describe('serviceRunsOnDateClause (SQL文字列の構造テスト)', () => {
  const clause = serviceRunsOnDateClause('trip', 'monday');

  it('excludes a service when calendar_dates marks it as 運休 (exception_type = 2)', () => {
    expect(clause).toMatch(/AND NOT EXISTS[\s\S]*exception_type = 2/);
  });
  it('includes a service when calendar_dates marks it as 臨時運行 (exception_type = 1)', () => {
    expect(clause).toMatch(/OR EXISTS[\s\S]*exception_type = 1/);
  });
  it('filters the base weekly schedule by the requested weekday column', () => {
    expect(clause).toContain('cal."monday" = true');
  });
});
