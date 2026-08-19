import { describe, it, expect } from 'vitest';
import { metersBetween, formatDistance, evaluateVisitProximity } from '../src/public/js/geo-utils.js';

// 霊山寺(1番札所)付近の座標を基準に使う
const TEMPLE = { lat: 34.1594397, lng: 134.5027968 };

describe('metersBetween', () => {
  it('returns 0 for the same point', () => {
    expect(metersBetween(TEMPLE.lat, TEMPLE.lng, TEMPLE.lat, TEMPLE.lng)).toBe(0);
  });
  it('returns a value under 100m for two very close points', () => {
    // 緯度方向に約0.0005度(約55m)ずらす
    const d = metersBetween(TEMPLE.lat, TEMPLE.lng, TEMPLE.lat + 0.0005, TEMPLE.lng);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(100);
  });
  it('returns a value between 100m and 200m', () => {
    // 緯度方向に約0.0014度(約155m)ずらす
    const d = metersBetween(TEMPLE.lat, TEMPLE.lng, TEMPLE.lat + 0.0014, TEMPLE.lng);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(200);
  });
  it('returns a value over 200m', () => {
    const d = metersBetween(TEMPLE.lat, TEMPLE.lng, TEMPLE.lat + 0.01, TEMPLE.lng);
    expect(d).toBeGreaterThan(200);
  });
});

describe('formatDistance', () => {
  it('formats 999m as meters', () => {
    expect(formatDistance(999)).toBe('999m');
  });
  it('formats exactly 1000m as km', () => {
    expect(formatDistance(1000)).toBe('1km');
  });
  it('formats 1500m as km with one decimal', () => {
    expect(formatDistance(1500)).toBe('1.5km');
  });
});

// checkTempleProximity()の判定ロジック(御朱印の現在地チェック)。
// ZUKAN_VISIT_MIN_RADIUS_M=100 / ZUKAN_VISIT_MAX_RADIUS_M=200 がindex.html側の実値。
describe('evaluateVisitProximity', () => {
  const opts = { minRadiusM: 100, maxRadiusM: 200 };

  it('accepts the same point (0m) with good accuracy', () => {
    const result = evaluateVisitProximity({ accuracy: 20, distanceMeters: 0, ...opts });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
  });
  it('accepts a distance under 100m', () => {
    const result = evaluateVisitProximity({ accuracy: 20, distanceMeters: 50, ...opts });
    expect(result.ok).toBe(true);
  });
  it('accepts a distance between 100m and 200m when accuracy allows it', () => {
    // accuracy=150m → allowedDistance = clamp(150, 100, 200) = 150m
    const result = evaluateVisitProximity({ accuracy: 150, distanceMeters: 140, ...opts });
    expect(result.ok).toBe(true);
    expect(result.allowedDistance).toBe(150);
  });
  it('rejects a distance over 200m', () => {
    const result = evaluateVisitProximity({ accuracy: 20, distanceMeters: 250, ...opts });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('too_far');
  });
  it('rejects when accuracy is not finite (invalid location precision)', () => {
    const result = evaluateVisitProximity({ accuracy: NaN, distanceMeters: 10, ...opts });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_accuracy');
  });
  it('rejects when accuracy exceeds the max radius (too imprecise to trust)', () => {
    const result = evaluateVisitProximity({ accuracy: 500, distanceMeters: 10, ...opts });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_accuracy');
  });
});
