/**
 * 各札所の緯度経度と、取り込み済みのGTFS停留所(gtfs_stops)を突き合わせ、
 * 最寄りの停留所を temple_stop_links テーブルに保存する。
 *
 * 使い方: ts-node src/match-temple-stops.ts
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { GtfsStop, TempleStopLink } from './entities/gtfs.entities';

// 前回のプロトタイプで使った概算座標。実装時は正式なジオコーディングに置き換え推奨。
const temples = [
  { no: 1, lat: 34.1665, lng: 134.5203 },
  { no: 2, lat: 34.1660, lng: 134.5065 },
  { no: 3, lat: 34.1590, lng: 134.4870 },
  { no: 4, lat: 34.1466, lng: 134.4550 },
  { no: 5, lat: 34.1520, lng: 134.4460 },
  { no: 6, lat: 34.1270, lng: 134.4110 },
  { no: 7, lat: 34.1290, lng: 134.4020 },
  { no: 8, lat: 34.1150, lng: 134.3700 },
  { no: 9, lat: 34.1030, lng: 134.3660 },
  { no: 10, lat: 34.0920, lng: 134.3480 },
];

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function run() {
  const ds = await AppDataSource.initialize();
  const allStops = await ds.getRepository(GtfsStop).find();

  for (const temple of temples) {
    // 直線距離1.5km以内の停留所を候補にする（実際に歩ける距離感でフィルタ）
    const candidates = allStops
      .map((s) => ({ ...s, dist: metersBetween(temple.lat, temple.lng, s.stop_lat, s.stop_lon) }))
      .filter((s) => s.dist <= 1500)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3); // 上位3件を候補として保存（複数系統アクセスできる場合があるため）

    if (candidates.length === 0) {
      // 診断用：足切り(1.5km)を無視した場合の本当の最寄り停留所を表示
      const nearestAny = allStops
        .map((s) => ({ ...s, dist: metersBetween(temple.lat, temple.lng, s.stop_lat, s.stop_lon) }))
        .sort((a, b) => a.dist - b.dist)[0];
      if (nearestAny) {
        console.warn(
          `${temple.no}番: 1.5km以内に停留所が見つかりませんでした（参考: 実際の最寄りは「${nearestAny.stop_name}」 ${Math.round(nearestAny.dist)}m）`
        );
      } else {
        console.warn(`${temple.no}番: 停留所データが1件も無い状態です`);
      }
      continue;
    }

    for (const c of candidates) {
      await ds.getRepository(TempleStopLink).upsert(
        {
          temple_no: temple.no,
          agency_key: c.agency_key,
          stop_id: c.stop_id,
          distance_m: c.dist,
        },
        { conflictPaths: ['temple_no', 'agency_key', 'stop_id'] }
      );
    }
    console.log(`${temple.no}番 → 最寄り: ${candidates[0].stop_name} (${Math.round(candidates[0].dist)}m)`);
  }

  await ds.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
