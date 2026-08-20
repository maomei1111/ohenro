import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseBooleanEnv } from '../src/env-utils';

describe('parseBooleanEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses "true" as true', () => {
    expect(parseBooleanEnv('true')).toBe(true);
  });
  it('parses "TRUE" (case-insensitive) as true', () => {
    expect(parseBooleanEnv('TRUE')).toBe(true);
  });
  it('trims surrounding whitespace before parsing', () => {
    expect(parseBooleanEnv(' true ')).toBe(true);
  });
  it('parses "false" as false', () => {
    expect(parseBooleanEnv('false')).toBe(false);
  });
  it('falls back to the default (false) when unset', () => {
    expect(parseBooleanEnv(undefined)).toBe(false);
  });
  it('falls back to the default (false) for an empty string', () => {
    expect(parseBooleanEnv('')).toBe(false);
  });
  it('falls back to the default (false) for an unrecognized value like "1"', () => {
    expect(parseBooleanEnv('1')).toBe(false);
  });
  it('falls back to the default (false) for an unrecognized value like "yes"', () => {
    expect(parseBooleanEnv('yes')).toBe(false);
  });
  it('falls back to the default (false) for an arbitrary typo', () => {
    expect(parseBooleanEnv('ture')).toBe(false);
  });
  it('warns on the console for an unrecognized value (fails safe, but visibly)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseBooleanEnv('1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
  it('does not warn for valid "true"/"false" values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseBooleanEnv('true');
    parseBooleanEnv('false');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('respects a custom default value when unset', () => {
    expect(parseBooleanEnv(undefined, true)).toBe(true);
  });
});
