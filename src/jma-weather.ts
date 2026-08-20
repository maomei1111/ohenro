/**
 * 気象庁防災情報XML(府県天気予報 VPFD51 / 府県週間天気予報 VPFW50)から
 * 天気・気温・降水確率を取得し、アプリ内部で使う正規化形式へ変換するモジュール。
 * (docs/JMA_WEATHER_MIGRATION_SPEC.md)
 *
 * ブラウザ・Android WebViewから気象庁へ直接アクセスさせないため、
 * このモジュールはサーバー側(src/server.ts)からのみ呼び出す。
 *
 * キャッシュはプロセス内メモリのみ(永続キャッシュは今回未実装。仕様書5.3では
 * 「可能であれば」という努力目標のため、再起動直後の一斉アクセスは許容している)。
 */
import { XMLParser } from 'fast-xml-parser';
import templeAreasRaw from './data/temple_jma_areas.json';

// ---- 札所⇔気象庁区域の対応表 ----
export interface TempleJmaArea {
  templeNo: number;
  forecastOfficeCode: string;
  forecastAreaCode: string;
  forecastAreaName: string;
  temperatureAreaCode: string;
  temperatureAreaName: string;
}

const TEMPLE_AREAS: TempleJmaArea[] = templeAreasRaw as TempleJmaArea[];
const TEMPLE_AREA_BY_NO = new Map<number, TempleJmaArea>(TEMPLE_AREAS.map((a) => [a.templeNo, a]));

// 起動時に一度だけ検証する。1〜88番が過不足なく揃っていなければ即座に落とす
// (仕様書8.3「登録されていない区域コードを検出した場合、起動時またはテスト時に失敗する」)。
export function validateTempleAreas(areas: TempleJmaArea[] = TEMPLE_AREAS): void {
  const nos = new Set(areas.map((a) => a.templeNo));
  const missing: number[] = [];
  for (let no = 1; no <= 88; no++) {
    if (!nos.has(no)) missing.push(no);
  }
  if (missing.length) {
    throw new Error(`[jma-weather] temple_jma_areas.json is missing temple(s): ${missing.join(', ')}`);
  }
  if (nos.size !== areas.length) {
    throw new Error('[jma-weather] temple_jma_areas.json contains duplicate templeNo entries');
  }
  for (const a of areas) {
    if (!/^\d{6}$/.test(a.forecastOfficeCode)) {
      throw new Error(`[jma-weather] temple ${a.templeNo}: invalid forecastOfficeCode "${a.forecastOfficeCode}"`);
    }
    if (!/^\d{6}$/.test(a.forecastAreaCode)) {
      throw new Error(`[jma-weather] temple ${a.templeNo}: invalid forecastAreaCode "${a.forecastAreaCode}"`);
    }
    if (!/^\d{5}$/.test(a.temperatureAreaCode)) {
      throw new Error(`[jma-weather] temple ${a.templeNo}: invalid temperatureAreaCode "${a.temperatureAreaCode}"`);
    }
  }
}
validateTempleAreas();

export function getTempleArea(templeNo: number): TempleJmaArea | null {
  return TEMPLE_AREA_BY_NO.get(templeNo) ?? null;
}

// ---- 正規化レスポンス(仕様書5.2) ----
export interface NormalizedWeather {
  available: boolean;
  source?: 'JMA';
  publishedAt?: string;
  forecastAreaName?: string;
  weatherCode?: string | null;
  weatherText?: string | null;
  temperature?: { maxC: number | null; minC: number | null };
  precipitationProbability?: number | null;
  precipitationPeriod?: string | null;
  isDailyForecast?: boolean;
}

// ---- 気象庁XML(jmaxml1)の汎用パーサー ----
// VPFD51(府県天気予報)とVPFW50(府県週間天気予報)は同じスキーマ形状
// (MeteorologicalInfos > TimeSeriesInfo > Item > Area|Station / Kind.Property.Type)
// なので同じパーサーで両方扱える。

export interface WeatherPeriod {
  dateTime: string; // ISO8601 (+09:00)
  durationHours: number | null;
  name: string | null;
  weatherCode: string | null;
  weatherText: string | null;
}
export interface PopPeriod {
  dateTime: string;
  durationHours: number | null;
  name: string | null;
  probability: number | null; // null = 電文に値なし(0で補完しない)
}
export interface TempPoint {
  dateTime: string;
  kind: 'min' | 'max' | 'unknown';
  valueC: number | null;
}

export interface ParsedAreaReport {
  publishingOffice: string;
  publishedAt: string; // Head/ReportDateTime
  weatherByArea: Map<string, WeatherPeriod[]>;
  popByArea: Map<string, PopPeriod[]>;
  tempByStation: Map<string, TempPoint[]>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // jmx_eb:Weather 等の名前空間プレフィックスは今回区別不要
  parseTagValue: false, // 数値をこちらで明示的にパースする(空文字や条件欠損との区別のため)
});

// fast-xml-parserは子要素が1件だと配列にならないため、常に配列として扱うためのヘルパー。
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDurationHours(iso: string | undefined | null): number | null {
  // "PT7H" や "P1D" のような簡易ISO8601 Duration表記のみ対応(このXMLで実際に使われる範囲)。
  if (!iso) return null;
  const dayMatch = iso.match(/P(\d+)D/);
  const hourMatch = iso.match(/T(?:(\d+)H)?/);
  let hours = 0;
  if (dayMatch) hours += Number(dayMatch[1]) * 24;
  if (hourMatch && hourMatch[1]) hours += Number(hourMatch[1]);
  return hours || null;
}

export function parseAreaForecastXml(xml: string): ParsedAreaReport {
  const doc = xmlParser.parse(xml);
  const report = doc.Report;
  if (!report) throw new Error('[jma-weather] unexpected XML: missing <Report>');

  const publishingOffice = report.Control?.PublishingOffice ?? '';
  const publishedAt = report.Head?.ReportDateTime ?? '';

  const weatherByArea = new Map<string, WeatherPeriod[]>();
  const popByArea = new Map<string, PopPeriod[]>();
  const tempByStation = new Map<string, TempPoint[]>();

  const infos = asArray(report.Body?.MeteorologicalInfos);
  for (const info of infos) {
    const timeSeriesList = asArray(info.TimeSeriesInfo);
    for (const ts of timeSeriesList) {
      // timeId -> {dateTime, duration, name}
      const timeDefines = new Map<
        string,
        { dateTime: string; durationHours: number | null; name: string | null }
      >();
      for (const td of asArray(ts.TimeDefines?.TimeDefine)) {
        timeDefines.set(String(td['@_timeId']), {
          dateTime: td.DateTime,
          durationHours: parseDurationHours(td.Duration),
          name: td.Name ?? null,
        });
      }

      for (const item of asArray(ts.Item)) {
        const kinds = asArray(item.Kind);
        const areaCode: string | undefined = item.Area?.Code != null ? String(item.Area.Code) : undefined;
        const stationCode: string | undefined =
          item.Station?.Code != null ? String(item.Station.Code) : undefined;

        for (const kind of kinds) {
          const properties = asArray(kind.Property);
          for (const prop of properties) {
            const type: string = prop.Type ?? '';

            if (type === '天気' && areaCode) {
              const weatherRefs = asArray(prop.WeatherPart?.Weather);
              const codeRefs = asArray(prop.WeatherCodePart?.WeatherCode);
              const codeByRef = new Map<string, string>();
              for (const c of codeRefs) codeByRef.set(String(c['@_refID']), String(c['#text'] ?? c));
              const periods: WeatherPeriod[] = [];
              for (const w of weatherRefs) {
                const refId = String(w['@_refID']);
                const td = timeDefines.get(refId);
                if (!td) continue;
                const text = typeof w === 'object' ? String(w['#text'] ?? '') : String(w);
                periods.push({
                  dateTime: td.dateTime,
                  durationHours: td.durationHours,
                  name: td.name,
                  weatherText: text || null,
                  weatherCode: codeByRef.get(refId) ?? null,
                });
              }
              if (periods.length) {
                weatherByArea.set(areaCode, [...(weatherByArea.get(areaCode) ?? []), ...periods]);
              }
            }

            if ((type === '降水確率' || type === '日降水確率') && areaCode) {
              const popRefs = asArray(prop.ProbabilityOfPrecipitationPart?.ProbabilityOfPrecipitation);
              const periods: PopPeriod[] = [];
              for (const p of popRefs) {
                const refId = String(p['@_refID']);
                const td = timeDefines.get(refId);
                if (!td) continue;
                const hasValue = p['@_condition'] !== '値なし' && p['#text'] != null && p['#text'] !== '';
                periods.push({
                  dateTime: td.dateTime,
                  durationHours: td.durationHours,
                  name: td.name,
                  probability: hasValue ? Number(p['#text']) : null,
                });
              }
              if (periods.length) {
                popByArea.set(areaCode, [...(popByArea.get(areaCode) ?? []), ...periods]);
              }
            }

            if (
              (type.includes('最低気温') || type.includes('最高気温')) &&
              !type.includes('予測範囲') && // 「最低気温予測範囲（上端/下端）」は今回使わない
              stationCode
            ) {
              const kindLabel: 'min' | 'max' = type.includes('最低') ? 'min' : 'max';
              const tempRefs = asArray(prop.TemperaturePart?.Temperature);
              const points: TempPoint[] = [];
              for (const tp of tempRefs) {
                const refId = String(tp['@_refID']);
                const td = timeDefines.get(refId);
                if (!td) continue;
                const hasValue = tp['@_condition'] !== '値なし' && tp['#text'] != null && tp['#text'] !== '';
                points.push({
                  dateTime: td.dateTime,
                  kind: kindLabel,
                  valueC: hasValue ? Number(tp['#text']) : null,
                });
              }
              if (points.length) {
                tempByStation.set(stationCode, [...(tempByStation.get(stationCode) ?? []), ...points]);
              }
            }
          }
        }
      }
    }
  }

  return { publishingOffice, publishedAt, weatherByArea, popByArea, tempByStation };
}

// ---- 予報選択ロジック ----

// targetDateTime(JST基準のDate)が、period(dateTime起点+durationHours)の範囲に含まれるものを選ぶ。
// duration不明の場合は日付(YYYY-MM-DD、JST)が一致するものを選ぶ。
function selectPeriodContaining<T extends { dateTime: string; durationHours: number | null }>(
  periods: T[],
  targetDateTime: Date
): T | null {
  const targetMs = targetDateTime.getTime();
  for (const p of periods) {
    const start = new Date(p.dateTime).getTime();
    if (Number.isNaN(start)) continue;
    if (p.durationHours != null) {
      const end = start + p.durationHours * 3600 * 1000;
      if (targetMs >= start && targetMs < end) return p;
    } else {
      if (jstDateStr(new Date(start)) === jstDateStr(targetDateTime)) return p;
    }
  }
  return null;
}

function jstDateStr(d: Date): string {
  // このプロセスはJSTで動く前提だが、念のためTZに依存しない計算にする。
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const jst = new Date(utcMs + 9 * 3600 * 1000);
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;
}

function formatPeriodLabel(p: { dateTime: string; durationHours: number | null; name: string | null }): string {
  if (p.durationHours && p.durationHours <= 24) {
    const start = new Date(p.dateTime);
    const startH = String((start.getUTCHours() + 9) % 24).padStart(2, '0');
    const endDate = new Date(start.getTime() + p.durationHours * 3600 * 1000);
    const endH = String((endDate.getUTCHours() + 9) % 24).padStart(2, '0');
    return `${startH}:00-${endH}:00`;
  }
  return p.name ?? '';
}

function selectTempForDate(points: TempPoint[], dateStr: string): { minC: number | null; maxC: number | null } {
  let minC: number | null = null;
  let maxC: number | null = null;
  for (const p of points) {
    if (jstDateStr(new Date(p.dateTime)) !== dateStr) continue;
    if (p.kind === 'min') minC = p.valueC;
    if (p.kind === 'max') maxC = p.valueC;
  }
  return { minC, maxC };
}

/**
 * VPFD51(短期)向け: 対象日時を含む天気・降水確率の期間と、対象日の気温を選ぶ。
 */
export function selectShortTermForecast(
  parsed: ParsedAreaReport,
  forecastAreaCode: string,
  temperatureAreaCode: string,
  targetDateTime: Date
): NormalizedWeather {
  const weatherPeriods = parsed.weatherByArea.get(forecastAreaCode) ?? [];
  const popPeriods = parsed.popByArea.get(forecastAreaCode) ?? [];
  const tempPoints = parsed.tempByStation.get(temperatureAreaCode) ?? [];

  const weather = selectPeriodContaining(weatherPeriods, targetDateTime);
  const pop = selectPeriodContaining(popPeriods, targetDateTime);
  const dateStr = jstDateStr(targetDateTime);
  const temp = selectTempForDate(tempPoints, dateStr);

  if (!weather && !pop && temp.minC == null && temp.maxC == null) {
    return { available: false };
  }

  return {
    available: true,
    source: 'JMA',
    publishedAt: parsed.publishedAt,
    forecastAreaName: parsed.publishingOffice,
    weatherCode: weather?.weatherCode ?? null,
    weatherText: weather?.weatherText ?? null,
    temperature: { maxC: temp.maxC, minC: temp.minC },
    precipitationProbability: pop?.probability ?? null,
    precipitationPeriod: pop ? formatPeriodLabel(pop) : null,
    isDailyForecast: false,
  };
}

/**
 * VPFW50(週間)向け: 対象日の日別天気・降水確率・気温を選ぶ。
 * 週間予報の区域コードは県全体(=forecastOfficeCode)、気温地点は県に1つだけなので
 * (地点予報のMeteorologicalInfosに実際に1件しか出てこない)、そのままtempByStationの
 * 唯一のエントリを使う。
 */
export function selectWeeklyForecast(
  parsed: ParsedAreaReport,
  forecastOfficeCode: string,
  targetDateTime: Date
): NormalizedWeather {
  const weatherPeriods = parsed.weatherByArea.get(forecastOfficeCode) ?? [];
  const popPeriods = parsed.popByArea.get(forecastOfficeCode) ?? [];
  const dateStr = jstDateStr(targetDateTime);

  const weather = weatherPeriods.find((p) => jstDateStr(new Date(p.dateTime)) === dateStr) ?? null;
  const pop = popPeriods.find((p) => jstDateStr(new Date(p.dateTime)) === dateStr) ?? null;

  const [firstStationCode] = parsed.tempByStation.keys();
  const tempPoints = firstStationCode ? parsed.tempByStation.get(firstStationCode) ?? [] : [];
  const temp = selectTempForDate(tempPoints, dateStr);

  if (!weather && !pop && temp.minC == null && temp.maxC == null) {
    return { available: false };
  }

  return {
    available: true,
    source: 'JMA',
    publishedAt: parsed.publishedAt,
    forecastAreaName: parsed.publishingOffice,
    weatherCode: weather?.weatherCode ?? null,
    weatherText: weather?.weatherText ?? null,
    temperature: { maxC: temp.maxC, minC: temp.minC },
    precipitationProbability: pop?.probability ?? null,
    precipitationPeriod: null,
    isDailyForecast: true,
  };
}

// ---- フィード・電文の取得とキャッシュ ----

const FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/regular.xml';
const FEED_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 仕様書5.3: フィード確認間隔は10分以上
const FETCH_FAILURE_RETRY_MS = 5 * 60 * 1000; // 仕様書5.3: 取得失敗時は5分以上あけて再試行
const FETCH_TIMEOUT_MS = 8000;

interface FeedEntry {
  id: string; // = 電文の直接URL
  updated: string;
  officeName: string;
}

let feedCache: { fetchedAt: number; entries: FeedEntry[] } | null = null;
let feedFetchFailedAt = 0;

// テスト用にモック差し替えできるよう、fetch呼び出しを薄いラッパーへ切り出す。
type FetchFn = typeof fetch;
let fetchImpl: FetchFn = fetch;
export function __setFetchForTesting(fn: FetchFn | null): void {
  fetchImpl = fn ?? fetch;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`[jma-weather] ${url} responded ${res.status}`);
  return res.text();
}

// 雑だが依存を増やさないための最小限のAtomフィードパーサー(fast-xml-parserで十分)。
const feedParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function refreshFeedIfStale(): Promise<void> {
  const now = Date.now();
  if (feedCache && now - feedCache.fetchedAt < FEED_CHECK_INTERVAL_MS) return;
  if (now - feedFetchFailedAt < FETCH_FAILURE_RETRY_MS) return; // 失敗直後は5分あける

  try {
    const xml = await fetchText(FEED_URL);
    const doc = feedParser.parse(xml);
    const rawEntries = asArray(doc.feed?.entry);
    const entries: FeedEntry[] = rawEntries.map((e: any) => ({
      id: typeof e.id === 'string' ? e.id : String(e.id ?? ''),
      updated: e.updated ?? '',
      officeName: e.author?.name ?? '',
    }));
    feedCache = { fetchedAt: now, entries };
  } catch (e) {
    feedFetchFailedAt = now;
    console.warn('[jma-weather] failed to refresh feed:', (e as Error).message);
    // 失敗時は古いfeedCacheが残っていればそのまま使う(呼び出し元でnullチェック)。
  }
}

function findLatestReportUrl(entries: FeedEntry[], reportType: string, officeCode: string): FeedEntry | null {
  const matches = entries.filter((e) => e.id.includes(`_${reportType}_${officeCode}.xml`));
  if (!matches.length) return null;
  matches.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  return matches[0];
}

interface ReportCacheEntry {
  sourceUpdatedAt: string;
  parsed: ParsedAreaReport;
  fetchedAt: number;
}
const reportCache = new Map<string, ReportCacheEntry>();
const reportFetchFailedAt = new Map<string, number>();

async function getReport(reportType: 'VPFD51' | 'VPFW50', officeCode: string): Promise<ParsedAreaReport | null> {
  const cacheKey = `${reportType}_${officeCode}`;
  await refreshFeedIfStale();

  const latest = feedCache ? findLatestReportUrl(feedCache.entries, reportType, officeCode) : null;
  const cached = reportCache.get(cacheKey);

  // フィードから最新の発表時刻が分かり、かつキャッシュ済みの発表時刻と同じなら再取得しない
  // (仕様書5.3: 同一電文を再取得しない。正常取得した予報は次の発表まで利用できる)。
  if (latest && cached && cached.sourceUpdatedAt === latest.updated) {
    return cached.parsed;
  }

  const now = Date.now();
  const lastFailed = reportFetchFailedAt.get(cacheKey) ?? 0;
  if (now - lastFailed < FETCH_FAILURE_RETRY_MS) {
    // 直近で失敗している間は再試行せず、古いキャッシュがあればそれを返す(呼び出し元で許容期限を判断)。
    return cached?.parsed ?? null;
  }

  if (!latest) {
    // フィードから該当電文が見つからない(フィード取得自体に失敗している等)。
    return cached?.parsed ?? null;
  }

  try {
    const xml = await fetchText(latest.id);
    const parsed = parseAreaForecastXml(xml);
    reportCache.set(cacheKey, { sourceUpdatedAt: latest.updated, parsed, fetchedAt: now });
    return parsed;
  } catch (e) {
    reportFetchFailedAt.set(cacheKey, now);
    console.warn(`[jma-weather] failed to fetch report ${cacheKey}:`, (e as Error).message);
    return cached?.parsed ?? null;
  }
}

// 発表から一定時間が経ちすぎた予報を「最新値のように」表示しないための許容期限。
// VPFD51は1日3回+随時更新、VPFW50は1日2回更新のため、24時間を大きく超えた
// キャッシュは新しい発表の取得に失敗し続けている異常系とみなし使わない。
const STALE_REPORT_LIMIT_MS = 24 * 3600 * 1000;

function isTooStale(parsed: ParsedAreaReport): boolean {
  const publishedMs = new Date(parsed.publishedAt).getTime();
  if (Number.isNaN(publishedMs)) return false;
  return Date.now() - publishedMs > STALE_REPORT_LIMIT_MS;
}

/**
 * 札所番号・対象日・到着予定時刻(省略可)から正規化された天気予報を返す。
 * 気象庁の予報期間(今日〜7日先)を超える日付は available:false を返す(推測値・固定値は返さない)。
 */
export async function getForecastForTemple(
  templeNo: number,
  targetDateStr: string,
  targetTime: string | null
): Promise<NormalizedWeather> {
  const area = getTempleArea(templeNo);
  if (!area) return { available: false };

  const [y, m, d] = targetDateStr.split('-').map(Number);
  if (!y || !m || !d) return { available: false };
  const [h, min] = (targetTime ?? '12:00').split(':').map(Number);
  // JSTのその日時をUTCのDateとして構築する(このプロセスのタイムゾーンに依存しないように)。
  const targetDateTime = new Date(Date.UTC(y, m - 1, d, (h || 0) - 9, min || 0));

  const todayJst = jstDateStr(new Date());
  const daysOut = Math.round(
    (Date.parse(`${targetDateStr}T00:00:00+09:00`) - Date.parse(`${todayJst}T00:00:00+09:00`)) / 86400000
  );

  if (daysOut < 0 || daysOut > 7) return { available: false }; // 予報範囲外

  if (daysOut <= 2) {
    const parsed = await getReport('VPFD51', area.forecastOfficeCode);
    if (!parsed || isTooStale(parsed)) return { available: false };
    return selectShortTermForecast(parsed, area.forecastAreaCode, area.temperatureAreaCode, targetDateTime);
  }

  const parsed = await getReport('VPFW50', area.forecastOfficeCode);
  if (!parsed || isTooStale(parsed)) return { available: false };
  return selectWeeklyForecast(parsed, area.forecastOfficeCode, targetDateTime);
}

// テスト用にキャッシュを初期状態へ戻す。
export function __resetCachesForTesting(): void {
  feedCache = null;
  feedFetchFailedAt = 0;
  reportCache.clear();
  reportFetchFailedAt.clear();
}
