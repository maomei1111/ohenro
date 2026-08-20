// 天気予報の「到着予定時刻に最も近い時間帯」選択ロジック。
// Open-Meteoの実APIは呼ばず、サーバー(server.ts)から純粋関数として切り出して
// テスト可能にしたもの(docs/CSS_AND_SERVER_PROTECTION_SPEC.md 24節)。

export interface HourlyForecastResponse {
  hourly?: {
    time?: string[]; // "YYYY-MM-DDTHH:mm" 形式
    weather_code?: number[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    relative_humidity_2m?: number[];
  };
}

export interface DailyForecastResponse {
  daily?: {
    time?: string[]; // "YYYY-MM-DD" 形式
    weathercode?: number[];
    temperature_2m_max?: number[];
    precipitation_probability_max?: number[];
    relative_humidity_2m_mean?: number[];
  };
}

export interface WeatherResult {
  available: boolean;
  weathercode?: number;
  maxTempC?: number;
  precipProbability?: number;
  humidity?: number | null;
  forecastTime?: string; // 実際に採用した予報時刻("HH:MM")。日次フォールバック時は無し
  isDailyMax?: boolean; // trueの場合、precipProbabilityは「その日の最高降水確率」
}

// hourly.time(同一日付内の複数時刻)の中から、目標時刻(HH:MM)に最も近いインデックスを返す。
// 対象日付に一致する時刻が1件も無ければnullを返す。
export function findClosestHourlyIndex(
  hourlyTimes: string[] | undefined,
  date: string,
  targetTime: string
): number | null {
  if (!hourlyTimes || !hourlyTimes.length) return null;
  const [targetH, targetM] = targetTime.split(':').map(Number);
  if (!Number.isFinite(targetH) || !Number.isFinite(targetM)) return null;
  const targetMinutes = targetH * 60 + targetM;

  let bestIdx: number | null = null;
  let bestDiff = Infinity;
  hourlyTimes.forEach((t, i) => {
    if (!t || !t.startsWith(date)) return;
    const hh = Number(t.slice(11, 13));
    const mm = Number(t.slice(14, 16));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
    const diff = Math.abs(hh * 60 + mm - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// 到着予定時刻(targetTime)に最も近い時間帯の天気コード・気温・降水確率・湿度を、
// すべて同じ時間帯の値として返す(以前はdaily.weathercodeとdaily.precipitation_probability_max
// という別々の集計を混在させていたため、晴れ表示と降水確率100%が同時に出ることがあった)。
export function selectHourlyForecast(
  json: HourlyForecastResponse,
  date: string,
  targetTime: string
): WeatherResult {
  const idx = findClosestHourlyIndex(json.hourly?.time, date, targetTime);
  if (idx == null) return { available: false };

  const weathercode = json.hourly?.weather_code?.[idx];
  const maxTempC = json.hourly?.temperature_2m?.[idx];
  const precipProbability = json.hourly?.precipitation_probability?.[idx];
  const humidity = json.hourly?.relative_humidity_2m?.[idx];
  if (weathercode == null || maxTempC == null) return { available: false };

  return {
    available: true,
    weathercode,
    maxTempC,
    precipProbability: precipProbability ?? 0,
    humidity: humidity ?? null,
    forecastTime: json.hourly!.time![idx].slice(11, 16),
    isDailyMax: false,
  };
}

// 到着予定時刻が分からない場合のフォールバック。「その日の最高降水確率」であることを
// 呼び出し元(クライアント)が明示できるよう isDailyMax:true を付ける。
export function selectDailyForecastFallback(json: DailyForecastResponse, date: string): WeatherResult {
  const idx = json.daily?.time?.indexOf(date) ?? -1;
  if (idx < 0) return { available: false };

  const weathercode = json.daily?.weathercode?.[idx];
  const maxTempC = json.daily?.temperature_2m_max?.[idx];
  const precipProbability = json.daily?.precipitation_probability_max?.[idx];
  const humidity = json.daily?.relative_humidity_2m_mean?.[idx];
  if (weathercode == null || maxTempC == null) return { available: false };

  return {
    available: true,
    weathercode,
    maxTempC,
    precipProbability: precipProbability ?? 0,
    humidity: humidity ?? null,
    isDailyMax: true,
  };
}
