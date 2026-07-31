/**
 * 隣接する札所(no と no-1)間の実際の徒歩ルート距離・所要時間を
 * Google Directions APIで取得し、temples_88.json に書き加える。
 *
 * これまでは「直線距離 ÷ 時速4km」で徒歩時間を概算していたが、
 * 実際の遍路道は直線ではないため、山間部などで大きく過小評価されていた。
 * このスクリプトを一度実行しておけば、以降はアプリ起動のたびに
 * APIを叩く必要がなく、キャッシュされた実測値を使えるようになる。
 *
 * 使い方:
 *   $env:GOOGLE_MAPS_API_KEY="（リファラー制限なしのキー。Directions APIを許可したもの）"
 *   npx tsx src/precompute-walk-times.ts
 *
 * 注意:
 *   - 87区間 × 1リクエストなので、Directions APIの無料枠(月10,000件)に余裕で収まる。
 *   - APIキーはHTTPリファラー制限のないものを使うこと(cross-check-temples.tsで
 *     作った一時キーを流用可能。ただしそのキーにDirections APIの許可も追加する必要がある)。
 *   - 徒歩ルートが存在しない区間(離島など)はエラーとして記録し、
 *     直線距離ベースの概算にフォールバックする。
 */
import fs from 'fs';
import path from 'path';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWalkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  apiKey: string
): Promise<{ distanceKm: number; durationMin: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=walking&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.routes || !data.routes.length) {
    console.warn(`  ⚠ Directions取得失敗: ${data.status} ${data.error_message ?? ''}`);
    return null;
  }
  const leg = data.routes[0].legs[0];
  return {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMin: Math.round(leg.duration.value / 60),
  };
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

  for (let i = 1; i < temples.length; i++) {
    const prev = temples[i - 1];
    const curr = temples[i];
    process.stdout.write(`[${prev.no}→${curr.no}] 徒歩ルートを取得中... `);
    try {
      const result = await fetchWalkingRoute(
        { lat: prev.lat, lng: prev.lng },
        { lat: curr.lat, lng: curr.lng },
        apiKey
      );
      if (result) {
        curr.walkDistanceKm = result.distanceKm;
        curr.walkDurationMin = result.durationMin;
        console.log(`→ ${result.distanceKm}km / ${result.durationMin}分`);
      } else {
        console.log('→ 取得失敗（直線距離ベースの概算にフォールバック）');
      }
    } catch (e) {
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(150);
  }

  fs.writeFileSync(templesPath, JSON.stringify(temples, null, 2), 'utf-8');
  console.log('\n完了: temples_88.json に実測の徒歩距離・時間を追記しました。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
