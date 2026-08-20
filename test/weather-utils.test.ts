import { describe, it, expect } from 'vitest';
import {
  findClosestHourlyIndex,
  selectHourlyForecast,
  selectDailyForecastFallback,
  type HourlyForecastResponse,
} from '../src/weather-utils';

// 晴れ(0%)が09:00、雨(100%)が18:00というダミーの時間別データ。
// daily.precipitation_probability_max(=100)とdaily.weathercode(=晴れ)のような
// 異なる集計の混在を防ぎ、同じ時間帯の値だけを使うことを検証する。
function buildHourlyFixture(date: string): HourlyForecastResponse {
  const hours = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  const weathercode = hours.map((_, h) => (h === 9 ? 0 : h === 18 ? 61 : 3));
  const precipitation_probability = hours.map((_, h) => (h === 9 ? 0 : h === 18 ? 100 : 20));
  const temperature_2m = hours.map((_, h) => 20 + h);
  const relative_humidity_2m = hours.map(() => 55);
  return {
    hourly: { time: hours, weather_code: weathercode, temperature_2m, precipitation_probability, relative_humidity_2m },
  };
}

describe('findClosestHourlyIndex', () => {
  it('finds the exact hour when it exists', () => {
    const hours = ['2026-08-20T08:00', '2026-08-20T09:00', '2026-08-20T10:00'];
    expect(findClosestHourlyIndex(hours, '2026-08-20', '09:00')).toBe(1);
  });
  it('finds the nearest hour when there is no exact match', () => {
    const hours = ['2026-08-20T08:00', '2026-08-20T09:00', '2026-08-20T10:00'];
    // 09:20は09:00(diff=20)の方が10:00(diff=40)より近い
    expect(findClosestHourlyIndex(hours, '2026-08-20', '09:20')).toBe(1);
  });
  it('returns null when no entry matches the given date', () => {
    const hours = ['2026-08-21T09:00'];
    expect(findClosestHourlyIndex(hours, '2026-08-20', '09:00')).toBeNull();
  });
});

describe('selectHourlyForecast', () => {
  it('09:00到着で晴れ0%が選ばれる', () => {
    const json = buildHourlyFixture('2026-08-20');
    const result = selectHourlyForecast(json, '2026-08-20', '09:00');
    expect(result.available).toBe(true);
    expect(result.weathercode).toBe(0);
    expect(result.precipProbability).toBe(0);
    expect(result.isDailyMax).toBe(false);
    expect(result.forecastTime).toBe('09:00');
  });
  it('同一データで18:00到着なら雨100%になる(09:00到着とは異なる値)', () => {
    const json = buildHourlyFixture('2026-08-20');
    const result = selectHourlyForecast(json, '2026-08-20', '18:00');
    expect(result.available).toBe(true);
    expect(result.weathercode).toBe(61);
    expect(result.precipProbability).toBe(100);
  });
  it('該当日のデータが無ければavailable:falseを返す', () => {
    const json = buildHourlyFixture('2026-08-20');
    const result = selectHourlyForecast(json, '2026-08-21', '09:00');
    expect(result.available).toBe(false);
  });
});

describe('selectDailyForecastFallback', () => {
  it('時刻なしのフォールバックでは最高降水確率(isDailyMax:true)として扱われる', () => {
    const json = {
      daily: {
        time: ['2026-08-20'],
        weathercode: [61],
        temperature_2m_max: [28],
        precipitation_probability_max: [90],
        relative_humidity_2m_mean: [70],
      },
    };
    const result = selectDailyForecastFallback(json, '2026-08-20');
    expect(result.available).toBe(true);
    expect(result.isDailyMax).toBe(true);
    expect(result.precipProbability).toBe(90);
    expect(result.forecastTime).toBeUndefined();
  });
  it('該当日が無ければavailable:falseを返す', () => {
    const json = { daily: { time: ['2026-08-21'], weathercode: [0], temperature_2m_max: [25] } };
    const result = selectDailyForecastFallback(json, '2026-08-20');
    expect(result.available).toBe(false);
  });
});
