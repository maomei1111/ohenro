import { describe, it, expect, vi, beforeEach } from 'vitest';

// 運賃は「その路線の運賃が1種類(均一運賃)」のときだけ表示する。
// 区間によって運賃が変わる路線は、乗車区間の運賃を特定できないため表示しない
// (以前は路線の運賃から1つを選んで表示し、4分の乗車に¥1,000と出ることがあった)。
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

const direct = {
  from_departure: '09:30:00', to_arrival: '09:50:00', trip_id: 't1', agency_key: 'A',
  from_stop_id: '10', from_stop_name: 'X', from_stop_lat: 34, from_stop_lon: 134,
  to_stop_id: '5', to_stop_name: 'Y', to_stop_lat: 34.1, to_stop_lon: 134.1, fare_id: 'ignored',
};
const transfer = {
  agency_key: 'A', from_stop_id: '10', from_stop_name: 'X', trip1: 't1', from_departure: '09:00:00',
  mid_stop_id: 'm', mid_stop_name: 'M', mid_arrival: '09:10:00', fare_id1: 'ignored',
  trip2: 't2', mid_departure: '09:20:00', to_stop_id: '5', to_stop_name: 'Y', to_stop_lat: 34.1, to_stop_lon: 134.1,
  to_arrival: '09:40:00', fare_id2: 'ignored',
};

function setup(opts: { direct?: any[]; transfer?: any[]; fareRows: any[] }) {
  find.mockReset().mockImplementation(async ({ where }: any) => [
    { temple_no: where.temple_no, agency_key: 'A', stop_id: where.temple_no === 1 ? '10' : '5', distance_m: 100 },
  ]);
  query.mockReset().mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('count(DISTINCT fa.price)')) return opts.fareRows;
    if (s.includes('WITH leg1')) return opts.transfer ?? [];
    if (s.includes('st_from')) return opts.direct ?? [];
    return [];
  });
}
const fareQuery = () => query.mock.calls.find(([sql]) => String(sql).includes('count(DISTINCT fa.price)'));

describe('fare is shown only for flat-fare routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the fare when the route has a single price', async () => {
    setup({ direct: [direct], fareRows: [{ trip_id: 't1', prices: '1', price: 200, currency_type: 'JPY' }] });
    const r: any = await findNextBus(1, 2, 9 * 60, 1, '20261007');
    expect(r.farePrice).toBe(200);
    expect(r.fareCurrency).toBe('JPY');
    expect(fareQuery()![1]).toEqual(['A', ['t1']]);
  });

  it('shows no fare when the route has several prices (distance-based fares)', async () => {
    setup({ direct: [direct], fareRows: [{ trip_id: 't1', prices: '151', price: 160, currency_type: 'JPY' }] });
    const r: any = await findNextBus(1, 2, 9 * 60, 1, '20261007');
    expect(r).not.toBeNull();
    expect(r.farePrice).toBeUndefined();
  });

  it('shows no fare when the feed has no fare data for the trip', async () => {
    setup({ direct: [direct], fareRows: [] });
    const r: any = await findNextBus(1, 2, 9 * 60, 1, '20261007');
    expect(r.farePrice).toBeUndefined();
  });

  it('sums both legs of a transfer when both are flat-fare', async () => {
    setup({
      transfer: [transfer],
      fareRows: [
        { trip_id: 't1', prices: '1', price: 100, currency_type: 'JPY' },
        { trip_id: 't2', prices: '1', price: 150, currency_type: 'JPY' },
      ],
    });
    const r: any = await findNextBus(1, 2, 8 * 60, 1, '20261007');
    expect(r.transfers).toBe(1);
    expect(r.farePrice).toBe(250);
    expect(fareQuery()![1]).toEqual(['A', ['t1', 't2']]);
  });

  it('shows no fare for a transfer when either leg is not flat-fare (never a partial amount)', async () => {
    setup({
      transfer: [transfer],
      fareRows: [
        { trip_id: 't1', prices: '1', price: 100, currency_type: 'JPY' },
        { trip_id: 't2', prices: '40', price: 160, currency_type: 'JPY' },
      ],
    });
    const r: any = await findNextBus(1, 2, 8 * 60, 1, '20261007');
    expect(r.transfers).toBe(1);
    expect(r.farePrice).toBeUndefined();
  });
});
