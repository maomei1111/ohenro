/**
 * 四国全域を格子状のブロックに分割し、それぞれについてOverpass APIに
 * 一度だけ問い合わせて、周辺施設データを cached_landmarks テーブルに保存する。
 *
 * これにより、アプリ実行時は自前DBへの検索だけで完結し、
 * Overpassの公開サーバーの混雑・タイムアウトに影響されなくなる。
 *
 * 使い方: npx tsx src/precompute-landmarks.ts
 *
 * 注意:
 *  - 一度取り込んだ後にOSM側でデータが更新されても、再実行するまでは反映されない。
 *    月1回程度、このスクリプトを再実行する運用を想定。
 *  - Overpassへの負荷軽減のため、ブロックごとに間隔を空けてリクエストする。
 *  - 四国全域の範囲は少し余裕を持たせている（瀬戸内海の一部小島などは対象外）。
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { CachedLandmark } from './entities/landmark.entities';

// 四国全域を大まかにカバーする範囲（南西端・北東端）
const BOUNDS = { south: 32.65, west: 132.0, north: 34.55, east: 134.85 };
const CELL_SIZE = 0.3; // 度。小さいほどOverpassへの1回あたりの負荷は下がるがリクエスト数は増える

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQuery(bbox: string): string {
  return `[out:json][timeout:60];(
    node["name"]["amenity"~"place_of_worship|cafe|restaurant|fuel"](${bbox});
    node["name"]["shop"~"convenience|supermarket"](${bbox});
    node["name"]["tourism"~"attraction|viewpoint|museum"](${bbox});
    node["name"]["historic"](${bbox});
    node["name"]["railway"~"station"](${bbox});
    node["name"]["highway"="bus_stop"](${bbox});
    node["amenity"="toilets"](${bbox});
    node["tourism"~"hotel|guest_house|motel|hostel|ryokan"](${bbox});
    node["name"~"道の駅"](${bbox});
    node["amenity"="public_bath"](${bbox});
    node["natural"="hot_spring"](${bbox});
    node["name"~"温泉"](${bbox});
    node["amenity"="vending_machine"](${bbox});
  );out body;`;
}

async function fetchCell(bbox: string, retryCount = 0): Promise<any[]> {
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'ohenro-route-planner-precompute/1.0 (contact: dev)',
      },
      body: buildQuery(bbox),
    });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    const data = await res.json();
    return data.elements ?? [];
  } catch (e) {
    if (retryCount < 3) {
      const waitSec = 5 * (retryCount + 1); // 5秒→10秒→15秒と間隔を広げながら再試行
      console.log(`  ⚠ 失敗(${(e as Error).message})。${waitSec}秒待って再試行(${retryCount + 1}/3)...`);
      await sleep(waitSec * 1000);
      return fetchCell(bbox, retryCount + 1);
    }
    throw e;
  }
}

async function main() {
  const ds = await AppDataSource.initialize();
  const repo = ds.getRepository(CachedLandmark);

  const cells: string[] = [];
  for (let lat = BOUNDS.south; lat < BOUNDS.north; lat += CELL_SIZE) {
    for (let lng = BOUNDS.west; lng < BOUNDS.east; lng += CELL_SIZE) {
      const south = lat;
      const north = Math.min(lat + CELL_SIZE, BOUNDS.north);
      const west = lng;
      const east = Math.min(lng + CELL_SIZE, BOUNDS.east);
      cells.push(`${south},${west},${north},${east}`);
    }
  }
  console.log(`${cells.length}ブロックに分割して取得します。`);

  let totalSaved = 0;
  const seen = new Set<string>(); // 同じ地点が隣接ブロックで重複ヒットするのを防ぐ

  for (let i = 0; i < cells.length; i++) {
    const bbox = cells[i];
    process.stdout.write(`[${i + 1}/${cells.length}] bbox=${bbox} 取得中... `);
    try {
      const elements = await fetchCell(bbox);
      const rows = elements
        .filter((el) => el.tags && el.lat != null && el.lon != null)
        .filter((el) => !seen.has(String(el.id)))
        .map((el) => {
          seen.add(String(el.id));
          return {
            osm_id: String(el.id),
            lat: el.lat,
            lng: el.lon,
            name: el.tags.name ?? '',
            tags: el.tags,
          };
        });

      if (rows.length) {
        // 大量件数を1回のINSERTに詰め込みすぎないようチャンク分割
        for (let j = 0; j < rows.length; j += 300) {
          await repo.upsert(rows.slice(j, j + 300), { conflictPaths: ['osm_id'] });
        }
      }
      totalSaved += rows.length;
      console.log(`→ ${rows.length}件`);
    } catch (e) {
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(3000); // Overpassへの負荷軽減のため3秒間隔（429対策で少し広めに）
  }

  console.log(`\n完了: 合計${totalSaved}件を cached_landmarks に保存しました。`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});