/**
 * GTFS-JP の ZIP ファイルを読み込み、PostgreSQL に取り込むスクリプト。
 *
 * 使い方:
 *   1. 事業者のサイトから GTFS ZIP をダウンロードして手元に保存
 *      （例: 公共交通オープンデータセンター https://api.gtfs-data.jp/v2/organizations/{組織}/feeds/{フィード}/files/feed.zip ）
 *   2. npx tsx src/import-gtfs.ts ./downloads/naruto.zip naruto
 *
 * 同じ agency_key を再取り込みすると、その事業者の既存データ（stops/routes/trips/stop_times/
 * calendar/calendar_dates/fare/shapes）を**すべて削除してから**入れ直す（置き換え）。
 * 「追加・更新」だけだと、新しいフィードで無くなった停留所・便・時刻が残り、service_idが
 * 再利用されている場合は古い時刻表が新しい有効期間で動いてしまうため。削除から取り込みまでは
 * 1つのトランザクションで行い、途中で失敗した場合は元のデータのまま何も変わらない。
 *
 * 安全確認: フィードの有効期間が今日より前に終わっている場合は、取り込まずに中止する
 * （期限切れのデータで、有効なデータを置き換えてしまわないため）。意図的に取り込むときだけ
 * --allow-expired を付ける。
 *
 * 必要パッケージ:
 *   npm install typeorm pg adm-zip csv-parse reflect-metadata
 *   npm install -D @types/adm-zip tsx typescript
 */

import 'reflect-metadata';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { AppDataSource } from './data-source';
import {
  GtfsStop,
  GtfsRoute,
  GtfsTrip,
  GtfsStopTime,
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsFareAttribute,
  GtfsFareRule,
  GtfsShapePoint,
} from './entities/gtfs.entities';
import { feedServiceRange, isCurrentlyValid, todayJst } from './gtfs-validity';

function readCsvFromZip(zip: AdmZip, fileName: string): Record<string, string>[] {
  const entry = zip.getEntry(fileName);
  if (!entry) {
    console.warn(`  ⚠ ${fileName} が見つかりません（このフィードには存在しない可能性）`);
    return [];
  }
  const content = entry.getData().toString('utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, bom: true });
}

// 同一キーを持つ行が複数ある場合、後勝ちで1件に間引く。
// (ON CONFLICT DO UPDATEは1つのINSERT文内で同じ行を2度更新できないため必須)
function dedupeByKey<T extends Record<string, any>>(rows: T[], keyFields: string[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyFields.map((f) => row[f]).join('␟');
    map.set(key, row); // 後から出てきた行で上書き
  }
  const deduped = Array.from(map.values());
  if (deduped.length !== rows.length) {
    console.warn(`  ⚠ 重複キーを ${rows.length - deduped.length}件 検出・除去しました（フィード側のデータ品質の問題の可能性）`);
  }
  return deduped;
}

// 大量データを一度に1つのINSERT文にしない（パラメータ上限対策・エラー切り分けのしやすさのため）
async function chunkedUpsert<T extends Record<string, any>>(
  repo: any,
  rows: T[],
  conflictPaths: string[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await repo.upsert(chunk, { conflictPaths });
  }
}

interface TableSpec {
  label: string;
  entity: any;
  keys: string[];
  rows: Record<string, any>[];
}

function buildTables(zip: AdmZip, agencyKey: string): TableSpec[] {
  const a = { agency_key: agencyKey };
  const read = (file: string) => readCsvFromZip(zip, file);
  return [
    {
      label: 'stops.txt',
      entity: GtfsStop,
      keys: ['agency_key', 'stop_id'],
      rows: read('stops.txt').map((s) => ({
        ...a,
        stop_id: s.stop_id,
        stop_name: s.stop_name,
        stop_lat: Number(s.stop_lat),
        stop_lon: Number(s.stop_lon),
      })),
    },
    {
      label: 'routes.txt',
      entity: GtfsRoute,
      keys: ['agency_key', 'route_id'],
      rows: read('routes.txt').map((r) => ({
        ...a,
        route_id: r.route_id,
        route_short_name: r.route_short_name,
        route_long_name: r.route_long_name,
      })),
    },
    {
      label: 'trips.txt',
      entity: GtfsTrip,
      keys: ['agency_key', 'trip_id'],
      rows: read('trips.txt').map((t) => ({
        ...a,
        trip_id: t.trip_id,
        route_id: t.route_id,
        service_id: t.service_id,
        shape_id: t.shape_id || null,
      })),
    },
    {
      label: 'stop_times.txt（データ量が多いので時間がかかります）',
      entity: GtfsStopTime,
      keys: ['agency_key', 'trip_id', 'stop_sequence'],
      rows: read('stop_times.txt').map((st) => ({
        ...a,
        trip_id: st.trip_id,
        stop_sequence: Number(st.stop_sequence),
        stop_id: st.stop_id,
        departure_time: st.departure_time,
        arrival_time: st.arrival_time,
      })),
    },
    {
      label: 'calendar.txt',
      entity: GtfsCalendar,
      keys: ['agency_key', 'service_id'],
      rows: read('calendar.txt').map((c) => ({
        ...a,
        service_id: c.service_id,
        monday: c.monday === '1',
        tuesday: c.tuesday === '1',
        wednesday: c.wednesday === '1',
        thursday: c.thursday === '1',
        friday: c.friday === '1',
        saturday: c.saturday === '1',
        sunday: c.sunday === '1',
        start_date: c.start_date,
        end_date: c.end_date,
      })),
    },
    {
      label: 'calendar_dates.txt（祝日・特例日。無いフィードもあります）',
      entity: GtfsCalendarDate,
      keys: ['agency_key', 'service_id', 'date'],
      rows: read('calendar_dates.txt').map((cd) => ({
        ...a,
        service_id: cd.service_id,
        date: cd.date,
        exception_type: Number(cd.exception_type),
      })),
    },
    {
      label: 'fare_attributes.txt（運賃データ。無いフィードもあります）',
      entity: GtfsFareAttribute,
      keys: ['agency_key', 'fare_id'],
      rows: read('fare_attributes.txt').map((f) => ({
        ...a,
        fare_id: f.fare_id,
        price: Number(f.price),
        currency_type: f.currency_type,
      })),
    },
    {
      label: 'fare_rules.txt（運賃と路線の対応表。無いフィードもあります）',
      entity: GtfsFareRule,
      keys: ['agency_key', 'fare_id', 'route_id'],
      rows: read('fare_rules.txt').map((f) => ({
        ...a,
        fare_id: f.fare_id,
        route_id: f.route_id ?? '',
      })),
    },
    {
      label: 'shapes.txt（実際の走行経路形状。データ量が多い場合があります）',
      entity: GtfsShapePoint,
      keys: ['agency_key', 'shape_id', 'shape_pt_sequence'],
      rows: read('shapes.txt').map((s) => ({
        ...a,
        shape_id: s.shape_id,
        shape_pt_sequence: Number(s.shape_pt_sequence),
        shape_pt_lat: Number(s.shape_pt_lat),
        shape_pt_lon: Number(s.shape_pt_lon),
      })),
    },
  ];
}

async function importGtfs(zipPath: string, agencyKey: string, allowExpired: boolean) {
  const zip = new AdmZip(zipPath);

  // DBへ触れる前に、フィード全体を読み込んで検証する。
  const tables = buildTables(zip, agencyKey).map((t) => ({ ...t, rows: dedupeByKey(t.rows, t.keys) }));
  const count = (label: string) => tables.find((t) => t.label.startsWith(label))!.rows.length;

  for (const required of ['stops.txt', 'trips.txt', 'stop_times.txt']) {
    if (count(required) === 0) {
      throw new Error(`[${agencyKey}] ${required} が空です。フィードが壊れている可能性があるため取り込みを中止します。`);
    }
  }

  const calendar = tables.find((t) => t.label.startsWith('calendar.txt'))!.rows as { start_date: string; end_date: string }[];
  const calendarDates = tables.find((t) => t.label.startsWith('calendar_dates.txt'))!.rows as {
    date: string;
    exception_type: number;
  }[];
  const range = feedServiceRange(calendar, calendarDates);
  const today = todayJst();
  console.log(`[${agencyKey}] フィードの運行期間: ${range.start ?? '-'} ～ ${range.end ?? '-'}（今日: ${today}）`);
  if (!isCurrentlyValid(range, today) && !allowExpired) {
    throw new Error(
      `[${agencyKey}] このフィードは期限切れです（最終運行日 ${range.end ?? '不明'}）。取り込みを中止します。` +
        `意図的に取り込む場合は --allow-expired を付けてください。`
    );
  }

  const ds = await AppDataSource.initialize();
  try {
    await ds.transaction(async (em) => {
      for (const t of tables) {
        const res = await em.getRepository(t.entity).delete({ agency_key: agencyKey });
        console.log(`[${agencyKey}] 既存の ${t.entity.name} を削除: ${res.affected ?? 0}件`);
      }
      for (const t of tables) {
        console.log(`[${agencyKey}] ${t.label} を取り込み中...`);
        if (t.rows.length) await chunkedUpsert(em.getRepository(t.entity), t.rows, t.keys);
        console.log(`  → ${t.rows.length}件`);
      }
    });
  } finally {
    await ds.destroy();
  }
  console.log(`[${agencyKey}] 取り込み完了（置き換え）`);
}

const args = process.argv.slice(2);
const allowExpired = args.includes('--allow-expired');
const [zipPath, agencyKey] = args.filter((a) => !a.startsWith('--'));
if (!zipPath || !agencyKey) {
  console.error('使い方: npx tsx src/import-gtfs.ts <zipファイルパス> <agency_key> [--allow-expired]');
  process.exit(1);
}
importGtfs(zipPath, agencyKey, allowExpired).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
