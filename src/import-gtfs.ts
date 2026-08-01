/**
 * GTFS-JP の ZIP ファイルを読み込み、PostgreSQL に取り込むスクリプト。
 *
 * 使い方:
 *   1. 事業者のサイトから GTFS ZIP をダウンロードして手元に保存
 *      （例: 徳島市交通局 https://opendata.pref.tokushima.lg.jp/dataset/2649.html ）
 *   2. npx tsx src/import-gtfs.ts ./downloads/tokushima_city.zip tokushima_city
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
} from './entities/gtfs.entities';

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

async function importGtfs(zipPath: string, agencyKey: string) {
  const zip = new AdmZip(zipPath);
  const ds = await AppDataSource.initialize();

  console.log(`[${agencyKey}] stops.txt を取り込み中...`);
  let stops = readCsvFromZip(zip, 'stops.txt').map((s) => ({
    agency_key: agencyKey,
    stop_id: s.stop_id,
    stop_name: s.stop_name,
    stop_lat: Number(s.stop_lat),
    stop_lon: Number(s.stop_lon),
  }));
  stops = dedupeByKey(stops, ['agency_key', 'stop_id']);
  if (stops.length) await chunkedUpsert(ds.getRepository(GtfsStop), stops, ['agency_key', 'stop_id']);
  console.log(`  → ${stops.length}件`);

  console.log(`[${agencyKey}] routes.txt を取り込み中...`);
  let routes = readCsvFromZip(zip, 'routes.txt').map((r) => ({
    agency_key: agencyKey,
    route_id: r.route_id,
    route_short_name: r.route_short_name,
    route_long_name: r.route_long_name,
  }));
  routes = dedupeByKey(routes, ['agency_key', 'route_id']);
  if (routes.length) await chunkedUpsert(ds.getRepository(GtfsRoute), routes, ['agency_key', 'route_id']);
  console.log(`  → ${routes.length}件`);

  console.log(`[${agencyKey}] trips.txt を取り込み中...`);
  let trips = readCsvFromZip(zip, 'trips.txt').map((t) => ({
    agency_key: agencyKey,
    trip_id: t.trip_id,
    route_id: t.route_id,
    service_id: t.service_id,
  }));
  trips = dedupeByKey(trips, ['agency_key', 'trip_id']);
  if (trips.length) await chunkedUpsert(ds.getRepository(GtfsTrip), trips, ['agency_key', 'trip_id']);
  console.log(`  → ${trips.length}件`);

  console.log(`[${agencyKey}] stop_times.txt を取り込み中（データ量が多いので時間がかかります）...`);
  let stopTimes = readCsvFromZip(zip, 'stop_times.txt').map((st) => ({
    agency_key: agencyKey,
    trip_id: st.trip_id,
    stop_sequence: Number(st.stop_sequence),
    stop_id: st.stop_id,
    departure_time: st.departure_time,
    arrival_time: st.arrival_time,
  }));
  stopTimes = dedupeByKey(stopTimes, ['agency_key', 'trip_id', 'stop_sequence']);
  if (stopTimes.length)
    await chunkedUpsert(ds.getRepository(GtfsStopTime), stopTimes, ['agency_key', 'trip_id', 'stop_sequence']);
  console.log(`  → ${stopTimes.length}件`);

  console.log(`[${agencyKey}] calendar.txt を取り込み中...`);
  let calendar = readCsvFromZip(zip, 'calendar.txt').map((c) => ({
    agency_key: agencyKey,
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
  }));
  calendar = dedupeByKey(calendar, ['agency_key', 'service_id']);
  if (calendar.length) await chunkedUpsert(ds.getRepository(GtfsCalendar), calendar, ['agency_key', 'service_id']);
  console.log(`  → ${calendar.length}件`);

  console.log(`[${agencyKey}] calendar_dates.txt を取り込み中（祝日・特例日。無いフィードもあります）...`);
  let calendarDates = readCsvFromZip(zip, 'calendar_dates.txt').map((cd) => ({
    agency_key: agencyKey,
    service_id: cd.service_id,
    date: cd.date,
    exception_type: Number(cd.exception_type),
  }));
  calendarDates = dedupeByKey(calendarDates, ['agency_key', 'service_id', 'date']);
  if (calendarDates.length)
    await chunkedUpsert(ds.getRepository(GtfsCalendarDate), calendarDates, ['agency_key', 'service_id', 'date']);
  console.log(`  → ${calendarDates.length}件`);

  console.log(`[${agencyKey}] fare_attributes.txt を取り込み中（運賃データ。無いフィードもあります）...`);
  let fareAttributes = readCsvFromZip(zip, 'fare_attributes.txt').map((f) => ({
    agency_key: agencyKey,
    fare_id: f.fare_id,
    price: Number(f.price),
    currency_type: f.currency_type,
  }));
  fareAttributes = dedupeByKey(fareAttributes, ['agency_key', 'fare_id']);
  if (fareAttributes.length)
    await chunkedUpsert(ds.getRepository(GtfsFareAttribute), fareAttributes, ['agency_key', 'fare_id']);
  console.log(`  → ${fareAttributes.length}件`);

  console.log(`[${agencyKey}] fare_rules.txt を取り込み中（運賃と路線の対応表。無いフィードもあります）...`);
  let fareRules = readCsvFromZip(zip, 'fare_rules.txt').map((f) => ({
    agency_key: agencyKey,
    fare_id: f.fare_id,
    route_id: f.route_id ?? '',
  }));
  fareRules = dedupeByKey(fareRules, ['agency_key', 'fare_id', 'route_id']);
  if (fareRules.length) await chunkedUpsert(ds.getRepository(GtfsFareRule), fareRules, ['agency_key', 'fare_id', 'route_id']);
  console.log(`  → ${fareRules.length}件`);

  await ds.destroy();
  console.log(`[${agencyKey}] 取り込み完了`);
}

const [, , zipPath, agencyKey] = process.argv;
if (!zipPath || !agencyKey) {
  console.error('使い方: npx tsx src/import-gtfs.ts <zipファイルパス> <agency_key>');
  process.exit(1);
}
importGtfs(zipPath, agencyKey).catch((e) => {
  console.error(e);
  process.exit(1);
});
