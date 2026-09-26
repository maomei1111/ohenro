/**
 * 取り込み済みGTFSの、事業者ごとの有効期間を一覧表示する読み取り専用スクリプト。
 * 期限切れ・まもなく期限切れの事業者を把握し、再取り込みが必要か判断するために使う
 * (docs/GTFS_REFRESH.md)。DBは変更しない。
 *
 * 使い方: npx tsx src/check-gtfs-validity.ts [--days=30]
 *   --days: この日数以内に期限が切れる事業者を「まもなく期限切れ」として表示する(既定30)
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { partitionAgenciesByValidity, todayJst } from './gtfs-validity';

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function run() {
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Number(daysArg.split('=')[1]) : 30;
  const ds = await AppDataSource.initialize();
  try {
    const rows: { agency_key: string; end_date: string }[] = await ds.query(
      `SELECT agency_key, MAX(end_date) AS end_date FROM (
         SELECT agency_key, end_date FROM gtfs_calendar
         UNION ALL
         SELECT agency_key, date AS end_date FROM gtfs_calendar_dates WHERE exception_type = 1
       ) t GROUP BY agency_key ORDER BY 2, 1`
    );
    const today = todayJst();
    const { valid, expired } = partitionAgenciesByValidity(rows, today);
    const soonLimit = addDays(today, days);
    const soon = rows.filter((r) => r.end_date >= today && r.end_date <= soonLimit).map((r) => r.agency_key);

    console.log(`今日: ${today} ／ 事業者 ${rows.length}社（有効 ${valid.length} / 期限切れ ${expired.length}）`);
    const line = (r: { agency_key: string; end_date: string }) => `  ${r.agency_key.padEnd(24)} 最終運行日 ${r.end_date}`;
    console.log(`\n■ 期限切れ ${expired.length}社`);
    rows.filter((r) => expired.includes(r.agency_key)).forEach((r) => console.log(line(r)));
    console.log(`\n■ ${days}日以内に期限切れ ${soon.length}社`);
    rows.filter((r) => soon.includes(r.agency_key)).forEach((r) => console.log(line(r)));
  } finally {
    await ds.destroy();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
