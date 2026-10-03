import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDaysYmd, classifyFreshness, sameWeekdayDatesUpTo, STALE_GRACE_DAYS } from '../src/gtfs-validity';

// 期限切れ(猶予内)の事業者を「時刻表が古い」注意付きで案内する仕組みのテスト。
// 公開元がGTFSを更新していないだけで、バス自体は走り続けている事業者が多いため。

describe('classifyFreshness', () => {
  it('is valid through the last service day (inclusive)', () => {
    expect(classifyFreshness('20261003', '20261003')).toBe('valid');
    expect(classifyFreshness('20270331', '20261003')).toBe('valid');
  });
  it('is stale from the day after the last service day, within the grace period', () => {
    expect(classifyFreshness('20261002', '20261003')).toBe('stale');
    expect(classifyFreshness('20250331', '20261003')).toBe('stale'); // 約1年半前
  });
  it('is stale on the last day of the grace period and expired the day after', () => {
    const end = '20240101';
    expect(classifyFreshness(end, addDaysYmd(end, STALE_GRACE_DAYS))).toBe('stale');
    expect(classifyFreshness(end, addDaysYmd(end, STALE_GRACE_DAYS + 1))).toBe('expired');
  });
  it('is expired for data several years old, or without any service day', () => {
    expect(classifyFreshness('20210831', '20261003')).toBe('expired');
    expect(classifyFreshness(null, '20261003')).toBe('expired');
  });
});

describe('sameWeekdayDatesUpTo', () => {
  it('returns the latest dates on the given weekday at or before the end date (newest first)', () => {
    // 2026-08-31 は月曜(1)
    expect(sameWeekdayDatesUpTo('20260831', 1, 3)).toEqual(['20260831', '20260824', '20260817']);
    // 日曜(0)は前日の 2026-08-30 から
    expect(sameWeekdayDatesUpTo('20260831', 0, 2)).toEqual(['20260830', '20260823']);
    // 火曜(2)は 6日前の 2026-08-25 から
    expect(sameWeekdayDatesUpTo('20260831', 2, 1)).toEqual(['20260825']);
  });
  it('crosses month and year boundaries', () => {
    // 2026-01-02 は金曜(5)。木曜(4)は 2026-01-01、その前は 2025-12-25
    expect(sameWeekdayDatesUpTo('20260102', 4, 2)).toEqual(['20260101', '20251225']);
  });
});

const query = vi.fn();
const find = vi.fn();

vi.mock('../src/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: (...args: any[]) => query(...args),
    getRepository: () => ({ find: (...args: any[]) => find(...args) }),
  },
}));

import { findNextBus } from '../src/query-next-bus';

// 直通便の検索結果1行（09:30発→09:50着）
function directRow(agency: string) {
  return {
    from_departure: '09:30:00',
    to_arrival: '09:50:00',
    trip_id: 't1',
    agency_key: agency,
    from_stop_id: '10',
    from_stop_name: 'A',
    from_stop_lat: 34,
    from_stop_lon: 134,
    to_stop_id: '5',
    to_stop_name: 'B',
    to_stop_lat: 34.1,
    to_stop_lon: 134.1,
    fare_id: null,
  };
}

// テストごとに別の事業者キーを使う（最終運行日はモジュール内で短時間キャッシュされるため）。
let seq = 0;
function setup(opts: {
  ends: Record<string, string>; // 事業者ごとの最終運行日
  tripsOnRefDate?: Record<string, number>; // 代表日候補ごとの運行便数
  directFor: (agencies: string[], date: string) => any[]; // 直通検索の結果
}) {
  query.mockReset().mockImplementation(async (sql: string, params: any[]) => {
    const s = String(sql);
    if (s.includes('MAX(end_date)')) {
      return (params[0] as string[]).filter((k) => opts.ends[k]).map((k) => ({ agency_key: k, end_date: opts.ends[k] }));
    }
    if (s.includes('refd(d)')) {
      return (params[1] as string[]).map((d) => ({ d, n: String(opts.tripsOnRefDate?.[d] ?? 1) }));
    }
    if (s.includes('WITH leg1')) return [];
    if (s.includes('st_from')) return opts.directFor(params[0] as string[], params[4] as string);
    return [];
  });
}
function links(from: string[], to: string[]) {
  find.mockReset().mockImplementation(async ({ where }: any) =>
    (where.temple_no === 1 ? from : to).map((agency_key) => ({ temple_no: where.temple_no, agency_key, stop_id: where.temple_no === 1 ? '10' : '5', distance_m: 100 }))
  );
}
const busCalls = () => query.mock.calls.filter(([sql]) => String(sql).includes('st_from'));

describe('findNextBus with stale (expired within grace) timetables', () => {
  beforeEach(() => { seq++; });

  it('searches a stale agency on a reference date of the same weekday and flags the result', async () => {
    const K = `stale${seq}`;
    links([K], [K]);
    // 最終運行日 2026-08-31(月)。検索日 2026-10-06 は火曜(2) → 代表日は 2026-08-25(火)
    setup({ ends: { [K]: '20260831' }, directFor: (_a, date) => (date === '20260825' ? [directRow(K)] : []) });

    const r: any = await findNextBus(1, 2, 9 * 60, 2, '20261006');
    expect(r).not.toBeNull();
    expect(r.stale).toBe(true);
    expect(r.stale_as_of).toBe('20260831');
    expect(r.from_departure).toBe('09:30:00');
    // 期限切れの事業者を、検索日そのもの(期間外)では検索していない
    expect(busCalls().map(([, p]) => p[4])).toEqual(['20260825']);
  });

  it('picks the reference date with the most running trips (skips a no-service last week)', async () => {
    const K = `stale${seq}`;
    links([K], [K]);
    // 最終運行日 2026-03-20(金・祝)。直近の金曜は運休で、その前の週(03-13)が通常ダイヤ
    setup({
      ends: { [K]: '20260320' },
      tripsOnRefDate: { '20260320': 0, '20260313': 12, '20260306': 12, '20260227': 12 },
      directFor: (_a, date) => (date === '20260313' ? [directRow(K)] : []),
    });

    const r: any = await findNextBus(1, 2, 9 * 60, 5, '20261009');
    expect(r?.stale).toBe(true);
    expect(busCalls().map(([, p]) => p[4])).toEqual(['20260313']);
  });

  it('prefers a valid agency and does not flag its result', async () => {
    const V = `valid${seq}`;
    const S = `stale${seq}`;
    links([V, S], [V, S]);
    setup({ ends: { [V]: '20270331', [S]: '20260831' }, directFor: (agencies) => (agencies.includes(V) ? [directRow(V)] : [directRow(S)]) });

    const r: any = await findNextBus(1, 2, 9 * 60, 2, '20261006');
    expect(r.agency_key).toBe(V);
    expect(r.stale).toBeUndefined();
    // 有効な事業者で便が見つかったので、期限切れの事業者は検索していない
    expect(busCalls()).toHaveLength(1);
    expect(busCalls()[0][1][0]).toEqual([V]);
    expect(busCalls()[0][1][4]).toBe('20261006');
  });

  it('falls back to a stale agency only when valid agencies have no bus', async () => {
    const V = `valid${seq}`;
    const S = `stale${seq}`;
    links([V, S], [V, S]);
    setup({ ends: { [V]: '20270331', [S]: '20260831' }, directFor: (agencies) => (agencies.includes(S) ? [directRow(S)] : []) });

    const r: any = await findNextBus(1, 2, 9 * 60, 2, '20261006');
    expect(r.agency_key).toBe(S);
    expect(r.stale).toBe(true);
  });

  it('never searches an agency whose data is older than the grace period', async () => {
    const K = `old${seq}`;
    links([K], [K]);
    setup({ ends: { [K]: '20210831' }, directFor: () => [directRow(K)] });

    const r = await findNextBus(1, 2, 9 * 60, 2, '20261006');
    expect(r).toBeNull();
    expect(busCalls()).toHaveLength(0);
  });

  it('treats a valid feed as stale for a planned date after its last service day', async () => {
    const K = `future${seq}`;
    links([K], [K]);
    // 今は有効(2026-10-31まで)でも、2026-11-10(火)の計画では期限切れ → 注意付きで案内
    setup({ ends: { [K]: '20261031' }, directFor: (_a, date) => (date === '20261027' ? [directRow(K)] : []) });

    const r: any = await findNextBus(1, 2, 9 * 60, 2, '20261110');
    expect(r?.stale).toBe(true);
    expect(r.stale_as_of).toBe('20261031');
  });
});
