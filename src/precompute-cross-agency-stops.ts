/**
 * 全事業者の停留所について、「別事業者かつ徒歩圏内（500m以内）」のペアを洗い出し、
 * cross_agency_stop_links に保存する。事業者をまたぐ乗り換えの実現に使う。
 *
 * 全停留所同士の総当たり(数千件×数千件)は重いため、緯度経度を粗いグリッド
 * (約0.01度=約1km四方)で区切り、同じ・隣接グリッドの停留所同士だけを
 * 精密に距離計算する（実質的な絞り込みで計算量を大幅に削減）。
 *
 * 使い方:
 *   $env:DATABASE_URL="postgresql://..."
 *   npx tsx src/precompute-cross-agency-stops.ts
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { GtfsStop, CrossAgencyStopLink } from './entities/gtfs.entities';

const THRESHOLD_M = 500; // これ以内なら「歩いて乗り換え可能」とみなす
const GRID_SIZE = 0.01; // 約1km四方

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_SIZE)}:${Math.floor(lng / GRID_SIZE)}`;
}

async function main() {
  const ds = await AppDataSource.initialize();
  const stopRepo = ds.getRepository(GtfsStop);
  const linkRepo = ds.getRepository(CrossAgencyStopLink);

  const stops = await stopRepo.find();
  console.log(`${stops.length}件の停留所を対象に、事業者をまたぐ近接ペアを探索します。`);

  // グリッドごとに停留所をバケット分けしておく
  const grid = new Map<string, typeof stops>();
  for (const s of stops) {
    const key = gridKey(Number(s.stop_lat), Number(s.stop_lon));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(s);
  }

  const pairsToSave: any[] = [];
  const seen = new Set<string>();

  for (const s of stops) {
    const [gx, gy] = gridKey(Number(s.stop_lat), Number(s.stop_lon)).split(':').map(Number);
    // 自分のグリッドと、隣接8方向のグリッドだけを候補にする
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbors = grid.get(`${gx + dx}:${gy + dy}`);
        if (!neighbors) continue;
        for (const other of neighbors) {
          if (other.agency_key === s.agency_key) continue; // 同一事業者は対象外(既存の仕組みで十分)
          // a<b の順に正規化して重複を避ける
          const [a, b] =
            s.agency_key < other.agency_key || (s.agency_key === other.agency_key && s.stop_id < other.stop_id)
              ? [s, other]
              : [other, s];
          const key = `${a.agency_key}:${a.stop_id}:${b.agency_key}:${b.stop_id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const dist = metersBetween(Number(a.stop_lat), Number(a.stop_lon), Number(b.stop_lat), Number(b.stop_lon));
          if (dist <= THRESHOLD_M) {
            pairsToSave.push({
              agency_key_a: a.agency_key,
              stop_id_a: a.stop_id,
              agency_key_b: b.agency_key,
              stop_id_b: b.stop_id,
              distance_m: dist,
            });
          }
        }
      }
    }
  }

  console.log(`${pairsToSave.length}件のペアが見つかりました。保存します...`);
  for (let i = 0; i < pairsToSave.length; i += 300) {
    await linkRepo.upsert(pairsToSave.slice(i, i + 300), {
      conflictPaths: ['agency_key_a', 'stop_id_a', 'agency_key_b', 'stop_id_b'],
    });
  }

  console.log(`完了: ${pairsToSave.length}件を cross_agency_stop_links に保存しました。`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
