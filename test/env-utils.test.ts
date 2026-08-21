import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseBooleanEnv, maskConnectionString, sanitizeDbError } from '../src/env-utils';

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

describe('maskConnectionString', () => {
  it('masks the password portion of a postgresql:// URL', () => {
    expect(maskConnectionString('postgresql://user:s3cr3t@sakura.proxy.rlwy.net:33335/railway')).toBe(
      'postgresql://user:****@sakura.proxy.rlwy.net:33335/railway'
    );
  });
  it('leaves a URL without a password unchanged', () => {
    expect(maskConnectionString('postgresql://localhost:5432/ohenro')).toBe('postgresql://localhost:5432/ohenro');
  });
  it('leaves arbitrary text without a credential pattern unchanged', () => {
    expect(maskConnectionString('connect ECONNREFUSED 127.0.0.1:5432')).toBe('connect ECONNREFUSED 127.0.0.1:5432');
  });
});

describe('sanitizeDbError', () => {
  it('masks a connection string embedded in an Error message', () => {
    const url = 'postgresql://user:s3cr3t@sakura.proxy.rlwy.net:33335/railway';
    const e = new Error(`Connection terminated: ${url}`);
    expect(sanitizeDbError(e, url)).toBe(
      'Connection terminated: postgresql://user:****@sakura.proxy.rlwy.net:33335/railway'
    );
  });
  it('masks any password-shaped substring even without a matching connectionString argument', () => {
    const e = new Error('failed to connect: postgresql://user:s3cr3t@host:5432/db');
    expect(sanitizeDbError(e)).toBe('failed to connect: postgresql://user:****@host:5432/db');
  });
  it('stringifies non-Error thrown values safely', () => {
    expect(sanitizeDbError('plain string error')).toBe('plain string error');
  });
});
