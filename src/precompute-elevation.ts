/**
 * 隣接する札所(no と no-1)間の徒歩ルートについて、標高プロファイルを事前計算し、
 * temples_88.json に追記する。
 *
 * 仕組み:
 *   1. Directions API (walking) でルートを取得し、経路を表す符号化ポリライン
 *      (overview_polyline.points) を得る。
 *   2. そのポリラインをそのまま Elevation API の path パラメータに渡し
 *      (path=enc:{polyline})、60点をサンプリングして標高を取得する。
 *   これにより、地図を開くたびにElevation APIを呼ぶ必要が無くなる
 *   （区間は固定なので、標高も一度計算すれば変わらないため）。
 *
 * 使い方:
 *   $env:GOOGLE_MAPS_API_KEY="（リファラー制限なしのキー。Directions・Elevation両方を許可）"
 *   npx tsx src/precompute-elevation.ts
 */
import fs from 'fs';
import path from 'path';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPolyline(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  apiKey: string
): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=walking&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.routes || !data.routes.length) {
    console.warn(`  ⚠ Directions取得失敗: ${data.status} ${data.error_message ?? ''}`);
    return null;
  }
  return data.routes[0].overview_polyline.points as string;
}

async function fetchElevationForPolyline(polyline: string, apiKey: string, retryCount = 0): Promise<number[] | null> {
  const url = `https://maps.googleapis.com/maps/api/elevation/json?path=enc:${encodeURIComponent(polyline)}&samples=60&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results) {
    if (retryCount < 3) {
      const waitSec = 5 * (retryCount + 1);
      console.log(`  ⚠ ${data.status}。${waitSec}秒待って再試行(${retryCount + 1}/3)...`);
      await sleep(waitSec * 1000);
      return fetchElevationForPolyline(polyline, apiKey, retryCount + 1);
    }
    console.warn(`  ⚠ Elevation取得失敗（リトライ上限）: ${data.status} ${data.error_message ?? ''}`);
    return null;
  }
  return data.results.map((r: any) => r.elevation);
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('環境変数 GOOGLE_MAPS_API_KEY が設定されていません。');
    process.exit(1);
  }

  const templesPath = path.join(__dirname, 'data', 'temples_88.json');
  const temples: any[] = JSON.parse(fs.readFileSync(templesPath, 'utf-8'));
  temples.sort((a, b) => a.no - b.no);

  let successCount = 0, skippedCount = 0;

  for (let i = 1; i < temples.length; i++) {
    const prev = temples[i - 1];
    const curr = temples[i];

    // 既に取得済みならAPIを呼ばずスキップする（再実行時の無駄なAPI消費を防ぐ）
    if (curr.elevations && curr.elevations.length) {
      skippedCount++;
      continue;
    }

    process.stdout.write(`[${prev.no}→${curr.no}] 標高プロファイルを取得中... `);
    try {
      const polyline = await fetchPolyline({ lat: prev.lat, lng: prev.lng }, { lat: curr.lat, lng: curr.lng }, apiKey);
      if (!polyline) {
        console.log('→ ルート取得失敗（スキップ）');
        await sleep(150);
        continue;
      }
      const elevations = await fetchElevationForPolyline(polyline, apiKey);
      if (!elevations) {
        console.log('→ 標高取得失敗（スキップ）');
        await sleep(150);
        continue;
      }
      curr.elevations = elevations.map((e) => Math.round(e * 10) / 10);
      successCount++;
      console.log(`→ ${elevations.length}点 取得（${Math.round(Math.min(...elevations))}m〜${Math.round(Math.max(...elevations))}m）`);
    } catch (e) {
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  fs.writeFileSync(templesPath, JSON.stringify(temples, null, 2), 'utf-8');
  const totalDone = temples.filter((t) => t.elevations && t.elevations.length).length;
  console.log(`\n今回新規取得: ${successCount}件／スキップ(取得済み): ${skippedCount}件`);
  console.log(`合計: ${totalDone}/87区間 が temples_88.json に保存済みです。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});