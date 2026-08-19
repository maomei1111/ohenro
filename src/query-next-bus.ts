/**
 * 「札所Aから札所Bへ、指定日時以降で最初に乗れる便」を検索するクエリ。
 * 直通便に加えて、同一事業者内での「乗り換え1回まで」の経路も探索し、
 * 早く着く方を返す。
 *
 * 実務上の注意:
 *  - GTFSの時刻は "25:30:00" のように24時を超える表記がある（深夜便対応のため）。
 *    単純な文字列比較ではなく、分に正規化してから比較する。
 *  - 運行日の判定は、単純な曜日ではなく、GTFS仕様に正しく沿った以下の3条件をすべて満たすかで行う:
 *      1. calendar.txt の該当曜日がtrue
 *      2. 指定日が calendar.txt の start_date〜end_date の範囲内
 *      3. calendar_dates.txt に「その日だけ運休(exception_type=2)」の指定があれば除外、
 *         逆に「その日だけ追加運行(exception_type=1)」があれば曜日パターンに関わらず追加
 *    これにより、祝日ダイヤ（平日パターンだが祝日は運休、または祝日だけの特別ダイヤ等）を
 *    実際の事業者の公開データ通りに反映できる。
 *
 * 重要な設計変更（徒歩時間の正確化。以前の版からの引き継ぎ）:
 *  - 「バス停まで歩く時間」は temple_stop_links の実距離(distance_m)を使って区間ごとに計算し、
 *    door-to-door の所要時間で徒歩ルートと比較する。
 *
 * 乗り換え機能の割り切り（設計時に合意した制約）:
 *  - 乗り換えは1回まで（2回以上の乗り継ぎは非対応）
 *  - 乗り換えは同一事業者内のみ対象（事業者をまたぐ乗り換えは、地方は便数が少なく
 *    実用性が低いと判断し非対応。試験実装はしたが元に戻した経緯がある）
 *  - 乗り換えに必要な時間は一律5分固定（停留所間の徒歩移動などは考慮しない）
 */
import { AppDataSource } from './data-source';
import { TempleStopLink } from './entities/gtfs.entities';

const TRANSFER_MINUTES = 5; // 乗り換えに最低限必要な時間（固定値）
const WALK_KMH = 4; // 徒歩速度の想定
const NEGLIGIBLE_DIFF_MIN = 3; // 到着時刻の差がこの範囲内なら「実質同じ」とみなす

// 到着時刻がほぼ同じ候補が複数ある場合、無駄に遠い停留所を選んでしまわないよう、
// その中では歩く距離が一番短いものを優先して選ぶ。
// (例: ループ運行するバスで、同じ便がたまたま1分早く別の停留所にも停まる場合、
//  何も考えずに「1分早い」方だけを見ると、実際には遠回りな停留所を選んでしまうことがあるため)
export function pickBestCandidate(candidates: any[]): any | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => a.arrivalMin - b.arrivalMin);
  const best = sorted[0];
  const nearlyBest = sorted.filter((c) => c.arrivalMin - best.arrivalMin <= NEGLIGIBLE_DIFF_MIN);
  nearlyBest.sort((a, b) => (a.walkToStopMin + a.walkFromStopMin) - (b.walkToStopMin + b.walkFromStopMin));
  return nearlyBest[0];
}

export function gtfsTimeToMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
}

export function walkMinutesForMeters(meters: number): number {
  return (meters / 1000 / WALK_KMH) * 60;
}

const WEEKDAY_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

// 「そのtrip(=service_id)が指定日に運行しているか」を判定するSQL条件のひな形。
// gtfs_trips trip を参照している前提で使う（agency_key・service_idのカラムが必要）。
export function serviceRunsOnDateClause(tripAlias: string, dayColumn: string): string {
  return `
    (
      EXISTS (
        SELECT 1 FROM gtfs_calendar cal
        WHERE cal.agency_key = ${tripAlias}.agency_key
          AND cal.service_id = ${tripAlias}.service_id
          AND cal.start_date <= $DATE AND cal.end_date >= $DATE
          AND cal."${dayColumn}" = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM gtfs_calendar_dates cdr
        WHERE cdr.agency_key = ${tripAlias}.agency_key
          AND cdr.service_id = ${tripAlias}.service_id
          AND cdr.date = $DATE AND cdr.exception_type = 2
      )
    )
    OR EXISTS (
      SELECT 1 FROM gtfs_calendar_dates cda
      WHERE cda.agency_key = ${tripAlias}.agency_key
        AND cda.service_id = ${tripAlias}.service_id
        AND cda.date = $DATE AND cda.exception_type = 1
    )
  `;
}

async function findDirectBus(
  fromLinks: TempleStopLink[],
  toLinks: TempleStopLink[],
  afterMinutes: number,
  dayColumn: string,
  dateStr: string
) {
  const ds = AppDataSource;

  const sql = `
    SELECT
      st_from.departure_time AS from_departure,
      st_to.arrival_time     AS to_arrival,
      st_from.trip_id,
      st_from.agency_key,
      st_from.stop_id   AS from_stop_id,
      s_from.stop_name  AS from_stop_name,
      s_from.stop_lat   AS from_stop_lat,
      s_from.stop_lon   AS from_stop_lon,
      st_to.stop_id     AS to_stop_id,
      s_to.stop_name    AS to_stop_name,
      s_to.stop_lat     AS to_stop_lat,
      s_to.stop_lon     AS to_stop_lon,
      (SELECT fr.fare_id FROM gtfs_fare_rules fr
        WHERE fr.agency_key = trip.agency_key
          AND (fr.route_id = trip.route_id OR fr.route_id = '')
        ORDER BY (fr.route_id = trip.route_id) DESC LIMIT 1) AS fare_id
    FROM gtfs_stop_times st_from
    JOIN gtfs_stop_times st_to
      ON st_from.agency_key = st_to.agency_key
     AND st_from.trip_id    = st_to.trip_id
     AND st_to.stop_sequence > st_from.stop_sequence
    JOIN gtfs_trips trip
      ON trip.agency_key = st_from.agency_key
     AND trip.trip_id    = st_from.trip_id
    JOIN gtfs_stops s_from
      ON s_from.agency_key = st_from.agency_key
     AND s_from.stop_id    = st_from.stop_id
    JOIN gtfs_stops s_to
      ON s_to.agency_key = st_to.agency_key
     AND s_to.stop_id    = st_to.stop_id
    WHERE st_from.agency_key = ANY($1)
      AND st_from.stop_id = ANY($2)
      AND st_to.stop_id   = ANY($3)
      AND (${serviceRunsOnDateClause('trip', dayColumn).replace(/\$DATE/g, '$4')})
    ORDER BY st_from.departure_time ASC
  `;

  const rows = await ds.query(sql, [
    Array.from(new Set(fromLinks.map((l) => l.agency_key))),
    fromLinks.map((l) => l.stop_id),
    toLinks.map((l) => l.stop_id),
    dateStr,
  ]);

  const candidates = rows
    .map((r: any) => {
      const fromLink = fromLinks.find((l) => l.agency_key === r.agency_key && l.stop_id === r.from_stop_id);
      const toLink = toLinks.find((l) => l.agency_key === r.agency_key && l.stop_id === r.to_stop_id);
      const walkToStopMin = fromLink ? walkMinutesForMeters(fromLink.distance_m) : walkMinutesForMeters(500);
      const walkFromStopMin = toLink ? walkMinutesForMeters(toLink.distance_m) : walkMinutesForMeters(500);
      const departureMin = gtfsTimeToMinutes(r.from_departure);
      const stopArrivalMin = gtfsTimeToMinutes(r.to_arrival);
      return {
        ...r,
        transfers: 0,
        departureMin,
        walkToStopMin,
        walkFromStopMin,
        // 実際に札所の玄関口に着く時刻（降車後の徒歩を含む）。徒歩ルートとの比較にはこちらを使う。
        arrivalMin: stopArrivalMin + walkFromStopMin,
      };
    })
    // このバスに乗るには、乗車停留所までの徒歩を終えている必要がある
    .filter((r: any) => r.departureMin >= afterMinutes + r.walkToStopMin);

  return pickBestCandidate(candidates);
}

async function findOneTransferBus(
  fromLinks: TempleStopLink[],
  toLinks: TempleStopLink[],
  afterMinutes: number,
  dayColumn: string,
  dateStr: string
) {
  const ds = AppDataSource;

  // leg1: 出発停留所 → 中継停留所（乗換候補地点） / leg2: 中継停留所 → 到着停留所
  // 同一事業者内の乗り換えのみを対象とする（JOIN条件の agency_key 一致で担保）
  const sql = `
    SELECT
      leg1.agency_key   AS agency_key,
      leg1.from_stop_id AS from_stop_id,
      leg1.from_stop_name,
      leg1.trip1        AS trip1,
      leg1.from_departure,
      leg1.mid_stop_id,
      leg1.mid_stop_name,
      leg1.mid_arrival,
      leg1.fare_id1,
      leg2.trip2        AS trip2,
      leg2.mid_departure,
      leg2.to_stop_id,
      leg2.to_stop_name,
      leg2.to_stop_lat,
      leg2.to_stop_lon,
      leg2.to_arrival,
      leg2.fare_id2
    FROM (
      SELECT
        st_a.agency_key   AS agency_key,
        st_a.stop_id      AS from_stop_id,
        s_a.stop_name     AS from_stop_name,
        st_a.trip_id      AS trip1,
        st_a.departure_time AS from_departure,
        st_b.stop_id      AS mid_stop_id,
        s_b.stop_name     AS mid_stop_name,
        st_b.arrival_time AS mid_arrival,
        (SELECT fr.fare_id FROM gtfs_fare_rules fr
          WHERE fr.agency_key = trip1.agency_key
            AND (fr.route_id = trip1.route_id OR fr.route_id = '')
          ORDER BY (fr.route_id = trip1.route_id) DESC LIMIT 1) AS fare_id1
      FROM gtfs_stop_times st_a
      JOIN gtfs_stop_times st_b
        ON st_a.agency_key = st_b.agency_key
       AND st_a.trip_id    = st_b.trip_id
       AND st_b.stop_sequence > st_a.stop_sequence
      JOIN gtfs_trips trip1
        ON trip1.agency_key = st_a.agency_key AND trip1.trip_id = st_a.trip_id
      JOIN gtfs_stops s_a
        ON s_a.agency_key = st_a.agency_key AND s_a.stop_id = st_a.stop_id
      JOIN gtfs_stops s_b
        ON s_b.agency_key = st_b.agency_key AND s_b.stop_id = st_b.stop_id
      WHERE st_a.agency_key = ANY($1)
        AND st_a.stop_id = ANY($2)
        AND (${serviceRunsOnDateClause('trip1', dayColumn).replace(/\$DATE/g, '$4')})
    ) leg1
    JOIN (
      SELECT
        st_c.agency_key   AS agency_key,
        st_c.trip_id      AS trip2,
        st_c.stop_id      AS mid_stop_id,
        st_c.departure_time AS mid_departure,
        st_d.stop_id      AS to_stop_id,
        s_d.stop_name     AS to_stop_name,
        s_d.stop_lat      AS to_stop_lat,
        s_d.stop_lon      AS to_stop_lon,
        st_d.arrival_time AS to_arrival,
        (SELECT fr.fare_id FROM gtfs_fare_rules fr
          WHERE fr.agency_key = trip2.agency_key
            AND (fr.route_id = trip2.route_id OR fr.route_id = '')
          ORDER BY (fr.route_id = trip2.route_id) DESC LIMIT 1) AS fare_id2
      FROM gtfs_stop_times st_c
      JOIN gtfs_stop_times st_d
        ON st_c.agency_key = st_d.agency_key
       AND st_c.trip_id    = st_d.trip_id
       AND st_d.stop_sequence > st_c.stop_sequence
      JOIN gtfs_trips trip2
        ON trip2.agency_key = st_c.agency_key AND trip2.trip_id = st_c.trip_id
      JOIN gtfs_stops s_d
        ON s_d.agency_key = st_d.agency_key AND s_d.stop_id = st_d.stop_id
      WHERE st_d.stop_id = ANY($3)
        AND (${serviceRunsOnDateClause('trip2', dayColumn).replace(/\$DATE/g, '$4')})
    ) leg2
      ON leg2.agency_key = leg1.agency_key
     AND leg2.mid_stop_id = leg1.mid_stop_id
     AND leg2.trip2 <> leg1.trip1
    ORDER BY leg1.mid_arrival ASC
  `;

  const rows = await ds.query(sql, [
    Array.from(new Set(fromLinks.map((l) => l.agency_key))),
    fromLinks.map((l) => l.stop_id),
    toLinks.map((l) => l.stop_id),
    dateStr,
  ]);

  const candidates = rows
    .map((r: any) => {
      const fromLink = fromLinks.find((l) => l.agency_key === r.agency_key && l.stop_id === r.from_stop_id);
      const toLink = toLinks.find((l) => l.agency_key === r.agency_key && l.stop_id === r.to_stop_id);
      const walkToStopMin = fromLink ? walkMinutesForMeters(fromLink.distance_m) : walkMinutesForMeters(500);
      const walkFromStopMin = toLink ? walkMinutesForMeters(toLink.distance_m) : walkMinutesForMeters(500);
      const departureMin = gtfsTimeToMinutes(r.from_departure);
      const midArrivalMin = gtfsTimeToMinutes(r.mid_arrival);
      const midDepartureMin = gtfsTimeToMinutes(r.mid_departure);
      const stopArrivalMin = gtfsTimeToMinutes(r.to_arrival);
      return {
        ...r,
        transfers: 1,
        departureMin,
        midArrivalMin,
        midDepartureMin,
        walkToStopMin,
        walkFromStopMin,
        arrivalMin: stopArrivalMin + walkFromStopMin,
      };
    })
    .filter(
      (r: any) =>
        r.departureMin >= afterMinutes + r.walkToStopMin &&
        r.midDepartureMin >= r.midArrivalMin + TRANSFER_MINUTES
    );

  return pickBestCandidate(candidates);
}

// shapes.txt(実際の走行経路)から、乗車〜降車区間だけを切り出して返すヘルパー
function nearestShapeIndex(coords: [number, number][], lat: number, lng: number): number {
  let best = 0, bestDist = Infinity;
  coords.forEach((c, i) => {
    const d = (c[0] - lat) ** 2 + (c[1] - lng) ** 2; // 並び替え用途なので簡易な二乗距離で十分
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

// 選ばれた便に、実際の走行経路(shapes.txt由来、乗車〜降車区間だけ切り出したもの)を紐付ける。
// 乗り換えありの便は今回対象外（地図側でも直通のみ実経路表示に対応しているため）。
// shapes.txtが無いフィードもあるため、見つからない場合は何も付与しない。
async function attachBusShape(result: any, ds: any) {
  if (!result || result.transfers === 1) return result;
  try {
    const tripRows = await ds.query(`SELECT shape_id FROM gtfs_trips WHERE agency_key = $1 AND trip_id = $2`, [
      result.agency_key,
      result.trip_id,
    ]);
    const shapeId = tripRows[0]?.shape_id;
    if (!shapeId) return result;

    const shapeRows = await ds.query(
      `SELECT shape_pt_lat, shape_pt_lon FROM gtfs_shapes WHERE agency_key = $1 AND shape_id = $2 ORDER BY shape_pt_sequence`,
      [result.agency_key, shapeId]
    );
    if (!shapeRows.length) return result;

    const shapeCoords: [number, number][] = shapeRows.map((r: any) => [Number(r.shape_pt_lat), Number(r.shape_pt_lon)]);
    const fromIdx = nearestShapeIndex(shapeCoords, Number(result.from_stop_lat), Number(result.from_stop_lon));
    const toIdx = nearestShapeIndex(shapeCoords, Number(result.to_stop_lat), Number(result.to_stop_lon));
    const [startIdx, endIdx] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    let trimmed = shapeCoords.slice(startIdx, endIdx + 1);
    if (fromIdx > toIdx) trimmed = trimmed.reverse(); // 進行方向を乗車→降車の順に揃える

    if (trimmed.length >= 2) result.busShapeCoords = trimmed;
  } catch (e) {
    console.warn('bus shape 取得に失敗しました', e);
  }
  return result;
}

// 選ばれた便に、実際の運賃額(fare_attributes)を紐付ける。
// 運賃データが無いフィードも多いため、見つからない場合は何も付与しない（undefinedのまま）。
async function attachFare(result: any, ds: any) {
  if (!result) return result;
  const fareIds = [result.fare_id, result.fare_id1, result.fare_id2].filter(Boolean);
  if (!fareIds.length) return result;

  const rows = await ds.query(
    `SELECT fare_id, price, currency_type FROM gtfs_fare_attributes WHERE agency_key = $1 AND fare_id = ANY($2)`,
    [result.agency_key, fareIds]
  );
  const map = new Map<string, any>(rows.map((r: any): [string, any] => [r.fare_id, r]));

  if (result.transfers === 1) {
    const f1 = map.get(result.fare_id1);
    const f2 = map.get(result.fare_id2);
    if (f1 || f2) {
      result.farePrice = (f1?.price ?? 0) + (f2?.price ?? 0);
      result.fareCurrency = f1?.currency_type || f2?.currency_type || 'JPY';
    }
  } else {
    const f = map.get(result.fare_id);
    if (f) {
      result.farePrice = f.price;
      result.fareCurrency = f.currency_type;
    }
  }
  return result;
}

export async function findNextBus(
  fromTempleNo: number,
  toTempleNo: number,
  afterMinutes: number, // 0:00からの経過分。例: 9:15 -> 555
  weekday: number, // 0=日曜 ... 6=土曜 (指定日から算出したもの)
  dateStr: string // "YYYYMMDD" 形式。calendar/calendar_datesとの突き合わせに使う
) {
  const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();

  const fromLinks = await ds.getRepository(TempleStopLink).find({ where: { temple_no: fromTempleNo } });
  const toLinks = await ds.getRepository(TempleStopLink).find({ where: { temple_no: toTempleNo } });
  if (!fromLinks.length || !toLinks.length) return null;

  const dayColumn = WEEKDAY_COLUMNS[weekday];

  const [direct, withTransfer] = await Promise.all([
    findDirectBus(fromLinks, toLinks, afterMinutes, dayColumn, dateStr),
    findOneTransferBus(fromLinks, toLinks, afterMinutes, dayColumn, dateStr),
  ]);

  // 両方見つかった場合は、実際の到着(徒歩込み)が早い方を採用
  // 僅差(3分以内)なら、乗り換えの手間が無い直通を優先する
  const chosen = direct && withTransfer
    ? (withTransfer.arrivalMin < direct.arrivalMin - NEGLIGIBLE_DIFF_MIN ? withTransfer : direct)
    : direct ?? withTransfer ?? null;

  const withFare = await attachFare(chosen, ds);
  return attachBusShape(withFare, ds);
}

// CLIから直接実行された場合のみ動作確認用に実行
if (require.main === module) {
  const [, , fromNo, toNo, afterHHMM, dateArg] = process.argv;
  const [h, m] = (afterHHMM ?? '09:00').split(':').map(Number);
  const targetDate = dateArg ? new Date(dateArg) : new Date();
  const dateStr =
    targetDate.getFullYear().toString() +
    String(targetDate.getMonth() + 1).padStart(2, '0') +
    String(targetDate.getDate()).padStart(2, '0');
  findNextBus(Number(fromNo), Number(toNo), h * 60 + m, targetDate.getDay(), dateStr)
    .then((r) => {
      console.log(r ?? '該当便なし');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}