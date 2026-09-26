/**
 * 各札所の緯度経度と、取り込み済みのGTFS停留所(gtfs_stops)を突き合わせ、
 * 最寄りの停留所を temple_stop_links テーブルに保存する。
 *
 * 使い方: npx tsx src/match-temple-stops.ts [--include-expired]
 *
 * 期限切れ(最終運行日が今日より前)の事業者の停留所は、既定では紐付け対象から外す。
 * 期限切れの停留所が「近い順に上位3件」の枠を占めてしまうと、同じ札所の近くにある
 * 有効な事業者の停留所が候補から漏れ、検索でバスが使えなくなるため。
 * 期限切れも含めたい場合だけ --include-expired を付ける。
 */
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { AppDataSource } from './data-source';
import { GtfsStop, TempleStopLink } from './entities/gtfs.entities';
import { partitionAgenciesByValidity, todayJst } from './gtfs-validity';

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
  const includeExpired = process.argv.includes('--include-expired');
  let allStops = await ds.getRepository(GtfsStop).find();

  // 事業者ごとの最終運行日 = calendar.txtの最終end_date と、calendar_datesの「追加運行」の最終日のうち遅い方
  const calRows: { agency_key: string; end_date: string }[] = await ds.query(
    `SELECT agency_key, MAX(end_date) AS end_date FROM gtfs_calendar GROUP BY agency_key`
  );
  const addRows: { agency_key: string; end_date: string }[] = await ds.query(
    `SELECT agency_key, MAX(date) AS end_date FROM gtfs_calendar_dates WHERE exception_type = 1 GROUP BY agency_key`
  );
  const lastServiceDay = new Map<string, string>();
  for (const r of [...calRows, ...addRows]) {
    const prev = lastServiceDay.get(r.agency_key);
    if (!prev || r.end_date > prev) lastServiceDay.set(r.agency_key, r.end_date);
  }
  const { valid, expired } = partitionAgenciesByValidity(
    [...lastServiceDay.entries()].map(([agency_key, end_date]) => ({ agency_key, end_date })),
    todayJst()
  );
  console.log(`有効な事業者 ${valid.length}社 / 期限切れ ${expired.length}社${includeExpired ? '（期限切れも紐付け対象に含めます）' : '（期限切れは紐付け対象から除外します）'}`);
  if (expired.length) console.log(`  期限切れ: ${expired.join(', ')}`);
  if (!includeExpired) {
    const validSet = new Set(valid);
    allStops = allStops.filter((s) => validSet.has(s.agency_key));
  }

  for (const temple of temples) {
    // 直線距離1.5km以内の停留所を候補にする（実際に歩ける距離感でフィルタ）
    const candidates = allStops
      .map((s) => ({ ...s, dist: metersBetween(temple.lat, temple.lng, s.stop_lat, s.stop_lon) }))
      .filter((s) => s.dist <= 1500)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3); // 上位3件を候補として保存（複数系統アクセスできる場合があるため）

    if (candidates.length === 0) {
      // 有効な停留所が近くに無い場合も、古い(期限切れ事業者などの)リンクを残さないよう削除する。
      await ds.getRepository(TempleStopLink).delete({ temple_no: temple.no });
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

    // 再実行のたびに古い候補が蓄積してしまうバグがあったため、挿入前にこの札所の既存リンクを
    // 一度すべて削除してからやり直す。削除と挿入は1つのトランザクションで行い、稼働中の
    // アプリの検索に「リンクが一瞬なくなった状態」が見えないようにする。
    await ds.transaction(async (em) => {
      await em.getRepository(TempleStopLink).delete({ temple_no: temple.no });
      for (const c of candidates) {
        await em.getRepository(TempleStopLink).upsert(
          {
            temple_no: temple.no,
            agency_key: c.agency_key,
            stop_id: c.stop_id,
            distance_m: c.dist,
          },
          { conflictPaths: ['temple_no', 'agency_key', 'stop_id'] }
        );
      }
    });
    console.log(`${temple.no}番 → 最寄り: ${candidates[0].stop_name} (${Math.round(candidates[0].dist)}m)`);
  }

  await ds.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});