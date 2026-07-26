/**
 * 「札所Aから札所Bへ、指定時刻以降で最初に乗れる便」を検索するクエリ。
 *
 * 実務上の注意:
 *  - GTFSの時刻は "25:30:00" のように24時を超える表記がある（深夜便対応のため）。
 *    単純な文字列比較ではなく、分に正規化してから比較する。
 *  - 曜日（平日/土日祝）は calendar.txt の service_id で絞り込む。
 *    祝日の特例は calendar_dates.txt（今回は未実装）で上書きされるので、
 *    本格運用では calendar_dates.txt も取り込むこと。
 */
import { AppDataSource } from './data-source';
import { TempleStopLink } from './entities/gtfs.entities';

function gtfsTimeToMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
}

const WEEKDAY_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export async function findNextBus(
  fromTempleNo: number,
  toTempleNo: number,
  afterMinutes: number, // 0:00からの経過分。例: 9:15 -> 555
  weekday: number // 0=日曜 ... 6=土曜 (Date.getDay()の値をそのまま渡せる)
) {
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();

  const fromLinks = await ds.getRepository(TempleStopLink).find({ where: { temple_no: fromTempleNo } });
  const toLinks = await ds.getRepository(TempleStopLink).find({ where: { temple_no: toTempleNo } });
  if (!fromLinks.length || !toLinks.length) return null;

  const dayColumn = WEEKDAY_COLUMNS[weekday];

  // 出発側の停留所候補 × 到着側の停留所候補、それぞれの組み合わせで
  // 同じtrip上に両方の停留所があり、出発→到着の順で通過する便を探す。
  const rows = await ds.query(
    `
    SELECT
      st_from.departure_time AS from_departure,
      st_to.arrival_time     AS to_arrival,
      st_from.trip_id,
      st_from.agency_key
    FROM gtfs_stop_times st_from
    JOIN gtfs_stop_times st_to
      ON st_from.agency_key = st_to.agency_key
     AND st_from.trip_id    = st_to.trip_id
     AND st_to.stop_sequence > st_from.stop_sequence
    JOIN gtfs_trips trip
      ON trip.agency_key = st_from.agency_key
     AND trip.trip_id    = st_from.trip_id
    JOIN gtfs_calendar cal
      ON cal.agency_key = trip.agency_key
     AND cal.service_id = trip.service_id
     AND cal."${dayColumn}" = true
    WHERE st_from.agency_key = ANY($1)
      AND st_from.stop_id = ANY($2)
      AND st_to.stop_id   = ANY($3)
    ORDER BY st_from.departure_time ASC
    `,
    [
      Array.from(new Set(fromLinks.map((l) => l.agency_key))),
      fromLinks.map((l) => l.stop_id),
      toLinks.map((l) => l.stop_id),
    ]
  );

  // afterMinutes以降で最も早い便を選ぶ（GTFSの25:xx:xx表記もgtfsTimeToMinutesで正しく分換算される）
  const candidates = rows
    .map((r: any) => ({
      ...r,
      departureMin: gtfsTimeToMinutes(r.from_departure),
      arrivalMin: gtfsTimeToMinutes(r.to_arrival),
    }))
    .filter((r: any) => r.departureMin >= afterMinutes)
    .sort((a: any, b: any) => a.departureMin - b.departureMin);

  return candidates[0] ?? null;
}

// CLIから直接実行された場合のみ動作確認用に実行
if (require.main === module) {
  const [, , fromNo, toNo, afterHHMM] = process.argv;
  const [h, m] = (afterHHMM ?? '09:00').split(':').map(Number);
  findNextBus(Number(fromNo), Number(toNo), h * 60 + m, new Date().getDay())
    .then((r) => {
      console.log(r ?? '該当便なし');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
