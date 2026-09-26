import { describe, it, expect, vi, beforeEach } from 'vitest';

// AppDataSource をモックし、findNextBus が発行するSQLとパラメータを検証する。
// 停留所IDは事業者ごとに独立した名前空間のため、stop_idだけで照合すると、別の事業者の
// 停留所と偶然IDが一致した(札所の近くではない)停留所を誤ってバス停として扱ってしまう。
// (実際に本番で、期限切れ事業者のリンクのstop_idが別事業者の停留所と一致し、遠い停留所への
//  バスが「札所に着く」として案内された。)
const query = vi.fn();
const find = vi.fn();

vi.mock('../src/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    query: (...args: any[]) => query(...args),
    getRepository: () => ({ find: (...args: any[]) => find(...args) }),
  },
}));

import { findNextBus, stopPairParams } from '../src/query-next-bus';

describe('stopPairParams', () => {
  it('returns parallel agency_key / stop_id arrays (same index = one link)', () => {
    expect(
      stopPairParams([
        { agency_key: 'A', stop_id: '10' },
        { agency_key: 'B', stop_id: '10' },
        { agency_key: 'A', stop_id: '5' },
      ])
    ).toEqual([
      ['A', 'B', 'A'],
      ['10', '10', '5'],
    ]);
  });

  it('keeps duplicate stop_ids of different agencies as separate pairs', () => {
    const [agencies, stops] = stopPairParams([
      { agency_key: 'A', stop_id: '1' },
      { agency_key: 'B', stop_id: '1' },
    ]);
    expect(agencies).toHaveLength(2);
    expect(stops).toEqual(['1', '1']);
  });

  it('handles an empty list', () => {
    expect(stopPairParams([])).toEqual([[], []]);
  });
});

describe('findNextBus stop matching', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    find.mockReset();
  });

  function setLinks(from: any[], to: any[]) {
    find.mockImplementation(async ({ where }: any) => (where.temple_no === 1 ? from : to));
  }

  it('matches stops by (agency_key, stop_id) pairs in both the direct and the transfer queries', async () => {
    setLinks(
      [{ temple_no: 1, agency_key: 'A', stop_id: '10', distance_m: 100 }, { temple_no: 1, agency_key: 'B', stop_id: '20', distance_m: 200 }],
      [{ temple_no: 2, agency_key: 'B', stop_id: '5', distance_m: 100 }]
    );
    await findNextBus(1, 2, 9 * 60, 1, '20260928');

    const bus = query.mock.calls.filter(([sql]) => String(sql).includes('gtfs_stop_times'));
    expect(bus.length).toBeGreaterThanOrEqual(2); // 直通と乗り換えの2本
    for (const [sql, params] of bus) {
      expect(sql).toContain('unnest($1::text[], $2::text[])');
      expect(sql).toContain('unnest($3::text[], $4::text[])');
      expect(sql).not.toMatch(/stop_id\s*=\s*ANY\(\$\d\)/); // stop_idだけの照合に戻っていない
      expect(params).toEqual([['A', 'B'], ['10', '20'], ['B'], ['5'], '20260928']);
    }
  });

  it('uses the date parameter ($5) in the service-day conditions', async () => {
    setLinks(
      [{ temple_no: 1, agency_key: 'A', stop_id: '10', distance_m: 100 }],
      [{ temple_no: 2, agency_key: 'A', stop_id: '5', distance_m: 100 }]
    );
    await findNextBus(1, 2, 9 * 60, 1, '20260928');
    const bus = query.mock.calls.find(([sql]) => String(sql).includes('gtfs_stop_times'))!;
    expect(bus[0]).toContain('cal.start_date <= $5');
    expect(bus[0]).not.toContain('$DATE');
  });
});
