import { describe, it, expect } from 'vitest';
import { nokyoStatus, durationParts } from '../src/public/js/nokyo-utils.js';
import { toMinutes } from '../src/public/js/date-utils.js';

const CLOSE = toMinutes('17:00');

describe('nokyoStatus', () => {
  it('is not over and shows countdown when arriving 10 minutes before close', () => {
    const status = nokyoStatus(CLOSE - 10, CLOSE);
    expect(status.over).toBe(false);
    expect(status.diffMin).toBe(10);
    expect(status.showCountdown).toBe(true);
  });
  it('does not show countdown when arriving more than 30 minutes before close', () => {
    const status = nokyoStatus(CLOSE - 31, CLOSE);
    expect(status.over).toBe(false);
    expect(status.showCountdown).toBe(false);
  });
  it('is over when arriving exactly at close time is not over (boundary is strictly after)', () => {
    // renderResult()の元実装は `a.timeMin > NOKYO_CLOSE` なので、ちょうど閉所時刻は「間に合った」扱い
    const status = nokyoStatus(CLOSE, CLOSE);
    expect(status.over).toBe(false);
  });
  it('is over when arriving 1 minute after close', () => {
    const status = nokyoStatus(CLOSE + 1, CLOSE);
    expect(status.over).toBe(true);
    expect(status.diffMin).toBe(-1);
  });
});

describe('durationParts (formatDurationMinutesの分岐条件)', () => {
  it('treats 59 minutes as minutes-only', () => {
    const parts = durationParts(59);
    expect(parts.isHours).toBe(false);
    expect(parts.value).toBe(59);
  });
  it('treats exactly 60 minutes as 1 hour 0 minutes', () => {
    const parts = durationParts(60);
    expect(parts.isHours).toBe(true);
    expect(parts.hours).toBe(1);
    expect(parts.minutes).toBe(0);
  });
  it('treats 61 minutes as 1 hour 1 minute', () => {
    const parts = durationParts(61);
    expect(parts.isHours).toBe(true);
    expect(parts.hours).toBe(1);
    expect(parts.minutes).toBe(1);
  });
  it('treats 120+ minutes as multiple hours', () => {
    const parts = durationParts(125);
    expect(parts.isHours).toBe(true);
    expect(parts.hours).toBe(2);
    expect(parts.minutes).toBe(5);
  });
});
