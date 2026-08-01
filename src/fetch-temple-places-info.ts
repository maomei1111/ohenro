/**
 * 88札所それぞれについて、Google Places API (Places API New) から
 *   - place_id
 *   - 写真参照(name) 1枚分
 *   - editorial summary（Google側が用意した簡潔な紹介文。無い場所も多い）
 * を取得し、temples_88_places.json に保存する。
 *
 * 著作権上の位置づけ:
 *   四国八十八ヶ所霊場会の公式サイト等、第三者サイトの文章・写真を複製するのではなく、
 *   Google Maps Platform契約の一部として提供される情報(写真・紹介文)を、
 *   Googleが定める帰属表示ルールに従って表示する。これはGoogle Maps Platform利用規約上、
 *   通常の利用形態として想定されている使い方。
 *
 * 使い方:
 *   $env:GOOGLE_MAPS_API_KEY="（Places API (New) を許可した、リファラー制限なしのキー）"
 *   npx tsx src/fetch-temple-places-info.ts
 */
import fs from 'fs';
import path from 'path';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function searchPlace(query: string, apiKey: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos,places.photos.authorAttributions,places.editorialSummary',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'ja', regionCode: 'JP' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error (status ${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.places || !data.places.length) return null;
  return data.places[0];
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('環境変数 GOOGLE_MAPS_API_KEY が設定されていません。');
    process.exit(1);
  }

  const templesPath = path.join(__dirname, 'data', 'temples_88.json');
  const temples: any[] = JSON.parse(fs.readFileSync(templesPath, 'utf-8'));

  const results: Record<number, any> = {};
  let photoCount = 0,
    summaryCount = 0;

  for (const t of temples) {
    const query = `${t.name} ${t.city} ${t.pref}`;
    process.stdout.write(`[${t.no}番] ${query} を検索中... `);
    try {
      const place = await searchPlace(query, apiKey);
      if (!place) {
        console.log('→ 見つかりませんでした');
        continue;
      }
      const photoName = place.photos && place.photos.length ? place.photos[0].name : null;
      const photoAttribution =
        place.photos && place.photos.length && place.photos[0].authorAttributions?.length
          ? place.photos[0].authorAttributions[0].displayName
          : null;
      const summary = place.editorialSummary?.text ?? null;
      results[t.no] = {
        placeId: place.id,
        photoName,
        photoAttribution,
        summary,
      };
      if (photoName) photoCount++;
      if (summary) summaryCount++;
      console.log(`→ 写真:${photoName ? 'あり' : 'なし'} / 紹介文:${summary ? 'あり' : 'なし'}`);
    } catch (e) {
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(150);
  }

  const outPath = path.join(__dirname, 'data', 'temples_88_places.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完了: 写真${photoCount}件 / 紹介文${summaryCount}件`);
  console.log(`→ ${outPath} に保存しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
