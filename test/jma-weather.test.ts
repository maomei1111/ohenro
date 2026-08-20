import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseAreaForecastXml,
  selectShortTermForecast,
  selectWeeklyForecast,
  getForecastForTemple,
  getTempleArea,
  validateTempleAreas,
  __setFetchForTesting,
  __resetCachesForTesting,
} from '../src/jma-weather';
import templeAreasRaw from '../src/data/temple_jma_areas.json';

// ---- 日付ヘルパー(テストが実行日に依存しても壊れないよう、常に「今日」からの相対日数で組み立てる) ----
function jstToday(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 9 * 3600 * 1000);
}
function dateStrPlusDays(days: number): string {
  const d = jstToday();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- 実物のVPFD51/VPFW50電文を元にした最小限のfixture(徳島県、agency=360000) ----
// 「今夜/明日/明後日」の3期間、区域は北部(360010)のみ(南部は省略しても解析に支障はない)。
// 明日の降水確率(12-18時)はcondition="値なし"で欠損させ、0へ変換されないことを確認する。
function buildVpfd51Xml(reportDateTimeIso: string): string {
  const todayIso = `${dateStrPlusDays(0)}T09:00:00+09:00`;
  const tomorrowIso = `${dateStrPlusDays(1)}T09:00:00+09:00`;
  const dayAfterIso = `${dateStrPlusDays(2)}T09:00:00+09:00`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/" xmlns:jmx_add="http://xml.kishou.go.jp/jmaxml1/addition1/">
<Control><PublishingOffice>徳島地方気象台</PublishingOffice></Control>
<Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
<ReportDateTime>${reportDateTimeIso}</ReportDateTime>
</Head>
<Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
<MeteorologicalInfos type="区域予報">
<TimeSeriesInfo>
<TimeDefines>
<TimeDefine timeId="1"><DateTime>${todayIso}</DateTime><Duration>PT24H</Duration><Name>今日</Name></TimeDefine>
<TimeDefine timeId="2"><DateTime>${tomorrowIso}</DateTime><Duration>P1D</Duration><Name>明日</Name></TimeDefine>
<TimeDefine timeId="3"><DateTime>${dayAfterIso}</DateTime><Duration>P1D</Duration><Name>明後日</Name></TimeDefine>
</TimeDefines>
<Item>
<Kind><Property><Type>天気</Type>
<WeatherPart>
<jmx_eb:Weather refID="1" type="天気">晴れ</jmx_eb:Weather>
<jmx_eb:Weather refID="2" type="天気">くもり時々雨</jmx_eb:Weather>
<jmx_eb:Weather refID="3" type="天気">雨</jmx_eb:Weather>
</WeatherPart>
<WeatherCodePart>
<jmx_eb:WeatherCode refID="1" type="天気予報用テロップ番号">100</jmx_eb:WeatherCode>
<jmx_eb:WeatherCode refID="2" type="天気予報用テロップ番号">203</jmx_eb:WeatherCode>
<jmx_eb:WeatherCode refID="3" type="天気予報用テロップ番号">300</jmx_eb:WeatherCode>
</WeatherCodePart>
</Property></Kind>
<Area><Name>北部</Name><Code>360010</Code></Area>
</Item>
</TimeSeriesInfo>
<TimeSeriesInfo>
<TimeDefines>
<TimeDefine timeId="1"><DateTime>${todayIso}</DateTime><Duration>PT6H</Duration><Name>０６時から１２時まで</Name></TimeDefine>
<TimeDefine timeId="2"><DateTime>${dateStrPlusDays(0)}T12:00:00+09:00</DateTime><Duration>PT6H</Duration><Name>１２時から１８時まで</Name></TimeDefine>
<TimeDefine timeId="3"><DateTime>${dateStrPlusDays(1)}T12:00:00+09:00</DateTime><Duration>PT6H</Duration><Name>１２時から１８時まで</Name></TimeDefine>
</TimeDefines>
<Item>
<Kind><Property><Type>降水確率</Type>
<ProbabilityOfPrecipitationPart>
<jmx_eb:ProbabilityOfPrecipitation refID="1" type="降水確率" unit="%">10</jmx_eb:ProbabilityOfPrecipitation>
<jmx_eb:ProbabilityOfPrecipitation refID="2" type="降水確率" unit="%">20</jmx_eb:ProbabilityOfPrecipitation>
<jmx_eb:ProbabilityOfPrecipitation refID="3" type="降水確率" unit="%" condition="値なし"/>
</ProbabilityOfPrecipitationPart>
</Property></Kind>
<Area><Name>北部</Name><Code>360010</Code></Area>
</Item>
</TimeSeriesInfo>
<TimeSeriesInfo>
<TimeDefines>
<TimeDefine timeId="1"><DateTime>${dateStrPlusDays(0)}T09:00:00+09:00</DateTime><Name>今日</Name></TimeDefine>
<TimeDefine timeId="2"><DateTime>${dateStrPlusDays(1)}T09:00:00+09:00</DateTime><Name>明日</Name></TimeDefine>
</TimeDefines>
<Item>
<Kind>
<Property><Type>朝の最低気温</Type><TemperaturePart><jmx_eb:Temperature refID="1" type="朝の最低気温" unit="度">25</jmx_eb:Temperature></TemperaturePart></Property>
<Property><Type>日中の最高気温</Type><TemperaturePart><jmx_eb:Temperature refID="1" type="日中の最高気温" unit="度">34</jmx_eb:Temperature></TemperaturePart></Property>
<Property><Type>朝の最低気温</Type><TemperaturePart><jmx_eb:Temperature refID="2" type="朝の最低気温" unit="度" condition="値なし"/></TemperaturePart></Property>
<Property><Type>日中の最高気温</Type><TemperaturePart><jmx_eb:Temperature refID="2" type="日中の最高気温" unit="度">33</jmx_eb:Temperature></TemperaturePart></Property>
</Kind>
<Station><Name>徳島</Name><Code>71106</Code></Station>
</Item>
</TimeSeriesInfo>
</MeteorologicalInfos>
</Body>
</Report>`;
}

function buildVpfw50Xml(reportDateTimeIso: string): string {
  const days = [1, 2, 3, 4, 5, 6, 7].map((n) => `${dateStrPlusDays(n)}T00:00:00+09:00`);
  const timeDefines = days.map((iso, i) => `<TimeDefine timeId="${i + 1}"><DateTime>${iso}</DateTime><Duration>P1D</Duration></TimeDefine>`).join('');
  const weatherRefs = days.map((_, i) => `<jmx_eb:Weather type="基本天気" refID="${i + 1}">晴れ時々くもり</jmx_eb:Weather>`).join('');
  const codeRefs = days.map((_, i) => `<jmx_eb:WeatherCode type="天気予報用テロップ番号" refID="${i + 1}">101</jmx_eb:WeatherCode>`).join('');
  const popRefs = days
    .map((_, i) => (i === 0
      ? `<jmx_eb:ProbabilityOfPrecipitation type="日降水確率" unit="%" refID="${i + 1}" condition="値なし"/>`
      : `<jmx_eb:ProbabilityOfPrecipitation type="日降水確率" unit="%" refID="${i + 1}">30</jmx_eb:ProbabilityOfPrecipitation>`))
    .join('');
  const minRefs = days.map((_, i) => `<jmx_eb:Temperature type="最低気温" unit="度" refID="${i + 1}">${24 + i}</jmx_eb:Temperature>`).join('');
  const maxRefs = days.map((_, i) => `<jmx_eb:Temperature type="最高気温" unit="度" refID="${i + 1}">${32 + i}</jmx_eb:Temperature>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://xml.kishou.go.jp/jmaxml1/">
<Control><PublishingOffice>徳島地方気象台</PublishingOffice></Control>
<Head xmlns="http://xml.kishou.go.jp/jmaxml1/informationBasis1/">
<ReportDateTime>${reportDateTimeIso}</ReportDateTime>
</Head>
<Body xmlns="http://xml.kishou.go.jp/jmaxml1/body/meteorology1/" xmlns:jmx_eb="http://xml.kishou.go.jp/jmaxml1/elementBasis1/">
<MeteorologicalInfos type="区域予報">
<TimeSeriesInfo>
<TimeDefines>${timeDefines}</TimeDefines>
<Item>
<Kind><Property><Type>天気</Type><WeatherPart>${weatherRefs}</WeatherPart><WeatherCodePart>${codeRefs}</WeatherCodePart></Property></Kind>
<Kind><Property><Type>降水確率</Type><ProbabilityOfPrecipitationPart>${popRefs}</ProbabilityOfPrecipitationPart></Property></Kind>
<Area><Name>徳島県</Name><Code>360000</Code></Area>
</Item>
</TimeSeriesInfo>
</MeteorologicalInfos>
<MeteorologicalInfos type="地点予報">
<TimeSeriesInfo>
<TimeDefines>${timeDefines}</TimeDefines>
<Item>
<Kind>
<Property><Type>最低気温</Type><TemperaturePart>${minRefs}</TemperaturePart></Property>
<Property><Type>最高気温</Type><TemperaturePart>${maxRefs}</TemperaturePart></Property>
</Kind>
<Station><Name>徳島</Name><Code>71106</Code></Station>
</Item>
</TimeSeriesInfo>
</MeteorologicalInfos>
</Body>
</Report>`;
}

function buildFeedXml(vpfd51Updated: string, vpfw50Updated: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>府県天気予報（Ｒ１）</title>
<id>https://example.test/xml/data/20260101000000_0_VPFD51_360000.xml</id>
<updated>${vpfd51Updated}</updated>
<author><name>徳島地方気象台</name></author>
</entry>
<entry>
<title>府県週間天気予報</title>
<id>https://example.test/xml/data/20260101000000_0_VPFW50_360000.xml</id>
<updated>${vpfw50Updated}</updated>
<author><name>徳島地方気象台</name></author>
</entry>
</feed>`;
}

describe('temple_jma_areas.json', () => {
  it('has an entry for every temple 1-88 with no duplicates', () => {
    expect(() => validateTempleAreas(templeAreasRaw as any)).not.toThrow();
    const nos = (templeAreasRaw as any[]).map((a) => a.templeNo).sort((a, b) => a - b);
    expect(nos).toEqual(Array.from({ length: 88 }, (_, i) => i + 1));
  });
  it('getTempleArea returns null for an out-of-range temple number', () => {
    expect(getTempleArea(999)).toBeNull();
  });
});

describe('parseAreaForecastXml (VPFD51)', () => {
  const reportDateTime = `${dateStrPlusDays(0)}T17:00:00+09:00`;
  const parsed = parseAreaForecastXml(buildVpfd51Xml(reportDateTime));

  it('extracts weather text/code per area', () => {
    const weather = parsed.weatherByArea.get('360010');
    expect(weather?.length).toBe(3);
    expect(weather?.[0].weatherText).toBe('晴れ');
    expect(weather?.[0].weatherCode).toBe('100');
  });

  it('extracts precipitation probability per area and does not convert a missing value to 0', () => {
    const pop = parsed.popByArea.get('360010');
    expect(pop?.[1].probability).toBe(20);
    expect(pop?.[2].probability).toBeNull(); // condition="値なし"
  });

  it('extracts temperature per station, keyed by min/max kind', () => {
    const temp = parsed.tempByStation.get('71106');
    const todayMin = temp?.find((t) => t.kind === 'min' && t.dateTime.startsWith(dateStrPlusDays(0)));
    const todayMax = temp?.find((t) => t.kind === 'max' && t.dateTime.startsWith(dateStrPlusDays(0)));
    const tomorrowMin = temp?.find((t) => t.kind === 'min' && t.dateTime.startsWith(dateStrPlusDays(1)));
    expect(todayMin?.valueC).toBe(25);
    expect(todayMax?.valueC).toBe(34);
    expect(tomorrowMin?.valueC).toBeNull(); // condition="値なし"
  });
});

describe('parseAreaForecastXml (VPFW50)', () => {
  const reportDateTime = `${dateStrPlusDays(0)}T11:00:00+09:00`;
  const parsed = parseAreaForecastXml(buildVpfw50Xml(reportDateTime));

  it('uses the office-level area code (whole prefecture, no sub-area split)', () => {
    expect(parsed.weatherByArea.has('360000')).toBe(true);
    expect(parsed.weatherByArea.get('360000')?.length).toBe(7);
  });

  it('has exactly one temperature station for the whole prefecture', () => {
    expect(parsed.tempByStation.size).toBe(1);
    expect(parsed.tempByStation.has('71106')).toBe(true);
  });

  it('does not convert the first day missing precipitation probability to 0', () => {
    const pop = parsed.popByArea.get('360000');
    expect(pop?.[0].probability).toBeNull();
    expect(pop?.[1].probability).toBe(30);
  });
});

describe('selectShortTermForecast', () => {
  const parsed = parseAreaForecastXml(buildVpfd51Xml(`${dateStrPlusDays(0)}T17:00:00+09:00`));

  it('selects the period and station values containing the target date/time (today, morning)', () => {
    const target = new Date(`${dateStrPlusDays(0)}T09:00:00+09:00`);
    const result = selectShortTermForecast(parsed, '360010', '71106', target);
    expect(result.available).toBe(true);
    expect(result.weatherText).toBe('晴れ');
    expect(result.precipitationProbability).toBe(10);
    expect(result.temperature?.maxC).toBe(34);
    expect(result.isDailyForecast).toBe(false);
  });

  it('selects a different period for a later time the same day (afternoon)', () => {
    const target = new Date(`${dateStrPlusDays(0)}T15:00:00+09:00`);
    const result = selectShortTermForecast(parsed, '360010', '71106', target);
    expect(result.precipitationProbability).toBe(20);
  });

  it('rolls over to the next day forecast when the route crosses midnight', () => {
    const target = new Date(`${dateStrPlusDays(1)}T09:00:00+09:00`);
    const result = selectShortTermForecast(parsed, '360010', '71106', target);
    expect(result.weatherText).toBe('くもり時々雨');
    expect(result.temperature?.minC).toBeNull(); // condition="値なし" のまま
  });
});

describe('selectWeeklyForecast', () => {
  const parsed = parseAreaForecastXml(buildVpfw50Xml(`${dateStrPlusDays(0)}T11:00:00+09:00`));

  it('selects the daily forecast matching the target date', () => {
    const target = new Date(`${dateStrPlusDays(3)}T09:00:00+09:00`);
    const result = selectWeeklyForecast(parsed, '360000', target);
    expect(result.available).toBe(true);
    expect(result.isDailyForecast).toBe(true);
    expect(result.precipitationPeriod).toBeNull();
    expect(result.precipitationProbability).toBe(30);
  });

  it('does not convert the missing first-day probability to 0', () => {
    const target = new Date(`${dateStrPlusDays(1)}T09:00:00+09:00`);
    const result = selectWeeklyForecast(parsed, '360000', target);
    expect(result.precipitationProbability).toBeNull();
  });
});

describe('getForecastForTemple (integration, mocked fetch)', () => {
  let fetchCalls: string[] = [];

  function mockFetch(vpfd51Updated: string, vpfw50Updated: string) {
    fetchCalls = [];
    const fn = (async (url: string) => {
      fetchCalls.push(url);
      let body: string;
      if (url.includes('feed/regular.xml')) {
        body = buildFeedXml(vpfd51Updated, vpfw50Updated);
      } else if (url.includes('VPFD51_360000')) {
        body = buildVpfd51Xml(vpfd51Updated);
      } else if (url.includes('VPFW50_360000')) {
        body = buildVpfw50Xml(vpfw50Updated);
      } else {
        return { ok: false, status: 404, text: async () => '' } as Response;
      }
      return { ok: true, status: 200, text: async () => body } as Response;
    }) as typeof fetch;
    __setFetchForTesting(fn);
  }

  beforeEach(() => {
    __resetCachesForTesting();
  });
  afterEach(() => {
    __setFetchForTesting(null);
  });

  it('uses VPFD51 for today and returns a period-based forecast for temple 1', async () => {
    mockFetch(`${dateStrPlusDays(0)}T17:00:00+09:00`, `${dateStrPlusDays(0)}T11:00:00+09:00`);
    const result = await getForecastForTemple(1, dateStrPlusDays(0), '09:00');
    expect(result.available).toBe(true);
    expect(result.source).toBe('JMA');
    expect(result.isDailyForecast).toBe(false);
    expect(result.weatherText).toBe('晴れ');
  });

  it('uses VPFW50 for a date 3-7 days out and returns a daily forecast', async () => {
    mockFetch(`${dateStrPlusDays(0)}T17:00:00+09:00`, `${dateStrPlusDays(0)}T11:00:00+09:00`);
    const result = await getForecastForTemple(1, dateStrPlusDays(4), null);
    expect(result.available).toBe(true);
    expect(result.isDailyForecast).toBe(true);
  });

  it('returns available:false beyond the 7-day forecast horizon without fetching anything new', async () => {
    mockFetch(`${dateStrPlusDays(0)}T17:00:00+09:00`, `${dateStrPlusDays(0)}T11:00:00+09:00`);
    const result = await getForecastForTemple(1, dateStrPlusDays(9), null);
    expect(result.available).toBe(false);
  });

  it('fetches the same office/report only once even when queried for multiple temples in the same area', async () => {
    mockFetch(`${dateStrPlusDays(0)}T17:00:00+09:00`, `${dateStrPlusDays(0)}T11:00:00+09:00`);
    // 1番(霊山寺)・7番(十楽寺)はどちらも徳島県・北部・徳島地点(office 360000, area 360010, station 71106)。
    expect(getTempleArea(1)?.forecastOfficeCode).toBe('360000');
    expect(getTempleArea(7)?.forecastOfficeCode).toBe('360000');

    await getForecastForTemple(1, dateStrPlusDays(0), '09:00');
    await getForecastForTemple(7, dateStrPlusDays(0), '09:00');
    await getForecastForTemple(1, dateStrPlusDays(0), '15:00');

    const feedFetches = fetchCalls.filter((u) => u.includes('feed/regular.xml'));
    const reportFetches = fetchCalls.filter((u) => u.includes('VPFD51_360000'));
    expect(feedFetches.length).toBe(1);
    expect(reportFetches.length).toBe(1);
  });

  it('does not fail the whole request when the JMA feed is unreachable (available:false instead of throwing)', async () => {
    __setFetchForTesting((async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch);
    const result = await getForecastForTemple(1, dateStrPlusDays(0), '09:00');
    expect(result.available).toBe(false);
  });

  it('returns available:false for an unknown temple number', async () => {
    mockFetch(`${dateStrPlusDays(0)}T17:00:00+09:00`, `${dateStrPlusDays(0)}T11:00:00+09:00`);
    const result = await getForecastForTemple(999, dateStrPlusDays(0), '09:00');
    expect(result.available).toBe(false);
  });
});
