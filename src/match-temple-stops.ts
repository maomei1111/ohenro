/**
 * 各札所の緯度経度と、取り込み済みのGTFS停留所(gtfs_stops)を突き合わせ、
 * 最寄りの停留所を temple_stop_links テーブルに保存する。
 *
 * 使い方: npx tsx src/match-temple-stops.ts
 */
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from './data-source';
import { GtfsStop, TempleStopLink } from './entities/gtfs.entities';

// 88札所のマスタデータ（geocode-temples.ts で生成したものを src/data/temples_88.json に配置）
const templesPath = path.join(__dirname, 'data', 'temples_88.json');
const temples: { no: number; lat: number; lng: number }[] = JSON.parse(
  fs.readFileSync(templesPath, 'utf-8')
);

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
    // 再実行のたびに古い候補が蓄積してしまうバグがあったため、
    // 挿入前にこの札所の既存リンクを一度すべて削除してからやり直す。
    await ds.getRepository(TempleStopLink).delete({ temple_no: temple.no });

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