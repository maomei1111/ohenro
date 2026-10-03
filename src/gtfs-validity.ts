/**
 * GTFSフィードの「サービス有効期間」の判定ヘルパー。
 *
 * GTFS-JPのcalendar.txtには start_date / end_date があり、期間外の日付ではバスが
 * 走らない扱いになる。事業者は通常1年前後でデータを更新するため、取り込み済みのデータを
 * 放置すると、期限切れの事業者が検索から静かに「バスなし」になる。
 * 取り込み時の安全確認と、札所⇔バス停の紐付け対象の絞り込みで同じ判定を使う。
 */

export interface CalendarRow {
  start_date: string; // YYYYMMDD
  end_date: string; // YYYYMMDD
}

export interface CalendarDateRow {
  date: string; // YYYYMMDD
  exception_type: number; // 1=追加運行, 2=運休
}

export interface ServiceRange {
  start: string | null;
  end: string | null;
}

/** 日本時間の今日を YYYYMMDD で返す（GTFSの日付は現地日付のため）。 */
export function todayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * フィード全体のサービス有効期間を返す。
 * calendar.txt の期間に加え、calendar_dates.txt の「追加運行(exception_type=1)」の日付も
 * 運行日として数える（calendar.txtが無く、calendar_datesだけで運行日を定義するフィードがあるため）。
 */
export function feedServiceRange(calendar: CalendarRow[], calendarDates: CalendarDateRow[]): ServiceRange {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const c of calendar) {
    if (c.start_date) starts.push(c.start_date);
    if (c.end_date) ends.push(c.end_date);
  }
  for (const cd of calendarDates) {
    if (cd.exception_type === 1 && cd.date) {
      starts.push(cd.date);
      ends.push(cd.date);
    }
  }
  starts.sort();
  ends.sort();
  return { start: starts[0] ?? null, end: ends[ends.length - 1] ?? null };
}

/** 指定日(YYYYMMDD)の時点で、まだ運行日が残っている(期限切れではない)か。 */
export function isCurrentlyValid(range: ServiceRange, today: string): boolean {
  return range.end !== null && range.end >= today;
}

/** 事業者ごとの最終運行日の一覧を、有効・期限切れに振り分ける。 */
export function partitionAgenciesByValidity(
  rows: { agency_key: string; end_date: string | null }[],
  today: string
): { valid: string[]; expired: string[] } {
  const valid: string[] = [];
  const expired: string[] = [];
  for (const r of rows) {
    if (r.end_date && r.end_date >= today) valid.push(r.agency_key);
    else expired.push(r.agency_key);
  }
  return { valid: valid.sort(), expired: expired.sort() };
}

/**
 * 期限切れでも「注意文付きで案内する」猶予日数。公開元がGTFSを更新していないだけで、バス自体は
 * 走り続けている事業者が多いため、期限切れから2年以内のデータは時刻が変わっている可能性を明示した
 * うえで案内する。それより古いデータは、路線や事業者ごと変わっている可能性が高いので案内しない。
 */
export const STALE_GRACE_DAYS = 730;

export type Freshness = 'valid' | 'stale' | 'expired';

/** YYYYMMDD に日数を加算する（負数で過去）。 */
export function addDaysYmd(yyyymmdd: string, days: number): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 基準日(YYYYMMDD)の時点での、フィードの鮮度を返す。
 *  valid   : 最終運行日が基準日以降（通常どおり案内する）
 *  stale   : 期限切れだが猶予日数以内（注意文付きで案内する）
 *  expired : 猶予日数より古い、または運行日が無い（案内しない）
 */
export function classifyFreshness(
  endDate: string | null,
  onDate: string,
  graceDays: number = STALE_GRACE_DAYS
): Freshness {
  if (!endDate) return 'expired';
  if (endDate >= onDate) return 'valid';
  return addDaysYmd(endDate, graceDays) >= onDate ? 'stale' : 'expired';
}

/**
 * 最終運行日以前で、指定の曜日(0=日曜…6=土曜)にあたる日付を新しい順に count 件返す。
 * 期限切れのフィードで「同じ曜日のダイヤ」を引くための代表日の候補に使う。
 */
export function sameWeekdayDatesUpTo(endDate: string, weekday: number, count: number = 4): string[] {
  const end = new Date(Date.UTC(+endDate.slice(0, 4), +endDate.slice(4, 6) - 1, +endDate.slice(6, 8)));
  const back = (end.getUTCDay() - weekday + 7) % 7;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDaysYmd(endDate, -(back + 7 * i)));
  return out;
}
