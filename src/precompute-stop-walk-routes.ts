/**
 * temple_stop_links に登録済みの「札所⇔最寄りバス停」の組み合わせすべてについて、
 * 実際の徒歩ルート座標を事前計算し、walk_route カラムに保存する。
 *
 * これにより、地図モーダルで「徒歩→バス→徒歩」の3区間表示をする際、
 * 札所⇔バス停間の徒歩ルートについてはDirections APIを毎回呼ばずに済む
 * （バスの乗車区間だけは、乗る便によって停留所の組み合わせが毎回変わるため、
 *   引き続きその場でDirections APIを呼ぶ）。
 *
 * 使い方:
 *   $env:DATABASE_URL="postgresql://..."
 *   $env:GOOGLE_MAPS_API_KEY="（リファラー制限なしのキー。Directions APIを許可したもの）"
 *   npx tsx src/precompute-stop-walk-routes.ts
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { TempleStopLink, GtfsStop } from './entities/gtfs.entities';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWalkingRouteCoords(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  apiKey: string
): Promise<[number, number][] | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=walking&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.routes || !data.routes.length) {
    console.warn(`  ⚠ Directions取得失敗: ${data.status} ${data.error_message ?? ''}`);
    return null;
  }
  // overview_pathがJS APIと違い、REST APIではlat/lngペアの配列そのものではなく
  // stepsごとのpolylineなので、シンプルにstart/endの直線ではなくoverview_polylineを
  // 手動でデコードする必要がある。ここではdecode不要な簡易版として、
  // legs[].steps[].start_location / end_locationを繋いだ折れ線を使う。
  const leg = data.routes[0].legs[0];
  const coords: [number, number][] = [[leg.start_location.lat, leg.start_location.lng]];
  for (const step of leg.steps) {
    coords.push([step.end_location.lat, step.end_location.lng]);
  }
  return coords;
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('環境変数 GOOGLE_MAPS_API_KEY が設定されていません。');
    process.exit(1);
  }

  const ds = await AppDataSource.initialize();
  const linkRepo = ds.getRepository(TempleStopLink);
  const stopRepo = ds.getRepository(GtfsStop);

  const links = await linkRepo.find();
  console.log(`${links.length}件の 札所⇔バス停 の組み合わせを処理します。`);

  // 88ヶ所のマスタデータ(座標)を読み込む
  const fs = await import('fs');
  const path = await import('path');
  const temples: any[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'temples_88.json'), 'utf-8'));
  const templeByNo = new Map(temples.map((t) => [t.no, t]));

  let successCount = 0;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    process.stdout.write(`[${i + 1}/${links.length}] ${link.temple_no}番 ⇔ ${link.agency_key}:${link.stop_id} を取得中... `);

    const temple = templeByNo.get(link.temple_no);
    const stop = await stopRepo.findOne({ where: { agency_key: link.agency_key, stop_id: link.stop_id } });
    if (!temple || !stop) {
      console.log('→ 札所またはバス停の座標が見つかりません（スキップ）');
      continue;
    }

    try {
      const coords = await fetchWalkingRouteCoords(
        { lat: temple.lat, lng: temple.lng },
        { lat: Number(stop.stop_lat), lng: Number(stop.stop_lon) },
        apiKey
      );
      if (coords) {
        link.walk_route = coords;
        await linkRepo.save(link);
        successCount++;
        console.log(`→ ${coords.length}点`);
      } else {
        console.log('→ 失敗（スキップ）');
      }
    } catch (e) {
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  console.log(`\n完了: ${successCount}/${links.length}件の徒歩ルートを保存しました。`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
