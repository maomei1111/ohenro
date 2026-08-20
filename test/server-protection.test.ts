import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

// server.ts はモジュール読み込み時に環境変数(CORS_ALLOWED_ORIGINS等)を
// 一度だけ評価して createApp() のクロージャに焼き込む設計のため、環境変数を
// 切り替えて挙動を比較するテストごとに vi.resetModules() で再読込する。
async function loadAppWithEnv(env: Record<string, string | undefined>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  vi.resetModules();
  const { createApp } = await import('../src/server');
  const app = createApp();
  return {
    app,
    restore() {
      for (const key of Object.keys(original)) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
      vi.resetModules();
    },
  };
}

describe('CORS', () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it('allows an origin listed in CORS_ALLOWED_ORIGINS', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
      ALLOW_NULL_ORIGIN: undefined,
    });
    restore = r;
    const res = await request(app).get('/health').set('Origin', 'https://allowed.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example.com');
  });

  it('does not set the allow-origin header for an origin not in the allowlist', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
    });
    restore = r;
    const res = await request(app).get('/health').set('Origin', 'https://not-allowed.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('succeeds for a request with no Origin header (same-site / native)', async () => {
    const { app, restore: r } = await loadAppWithEnv({ CORS_ALLOWED_ORIGINS: 'https://allowed.example.com' });
    restore = r;
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('allows Origin: null only when ALLOW_NULL_ORIGIN=true', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
      ALLOW_NULL_ORIGIN: 'true',
    });
    restore = r;
    const res = await request(app).get('/health').set('Origin', 'null');
    expect(res.headers['access-control-allow-origin']).toBe('null');
  });

  it('does not allow Origin: null when ALLOW_NULL_ORIGIN is unset (default false)', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
      ALLOW_NULL_ORIGIN: undefined,
    });
    restore = r;
    const res = await request(app).get('/health').set('Origin', 'null');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never treats a wildcard entry as an allowed origin', async () => {
    const { app, restore: r } = await loadAppWithEnv({ CORS_ALLOWED_ORIGINS: '*' });
    restore = r;
    const res = await request(app).get('/health').set('Origin', 'https://anything.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a method outside the allowed GET/OPTIONS set from a cross-origin request', async () => {
    const { app, restore: r } = await loadAppWithEnv({ CORS_ALLOWED_ORIGINS: 'https://allowed.example.com' });
    restore = r;
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://allowed.example.com')
      .set('Access-Control-Request-Method', 'POST');
    // corsのpreflightは許可メソッド一覧に無いメソッドを許可ヘッダーへ含めない
    const allowMethods = res.headers['access-control-allow-methods'] ?? '';
    expect(allowMethods).not.toContain('POST');
  });
});

describe('HTTP headers (helmet)', () => {
  it('sets basic security headers without forcing a Content-Security-Policy', async () => {
    const { app, restore: r } = await loadAppWithEnv({});
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeUndefined();
    r();
  });
});

describe('Rate limiting', () => {
  it('does not rate-limit /health even under many requests', async () => {
    const { app, restore: r } = await loadAppWithEnv({});
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
    r();
  });

  it('returns 429 with the documented JSON body once a dynamic endpoint exceeds its limit', async () => {
    const { app, restore: r } = await loadAppWithEnv({});
    // /temple-places はDB接続不要かつ制限が120回/分の対象エンドポイント。
    // テストで120回叩くのは重いため、express-rate-limitの挙動そのもの
    // (上限を超えたら429+JSON body+ヘッダー)を、より軽い/next-busの
    // バリデーションエラー応答(DB接続前に400で返る)を使って確認する。
    // ここでは実際のエンドポイントを規定回数連打して確認する。
    let lastRes;
    for (let i = 0; i < 121; i++) {
      lastRes = await request(app).get('/temple-places');
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.body).toEqual({
      error: 'too_many_requests',
      message: 'しばらく待ってから再度お試しください',
    });
    expect(lastRes!.headers['retry-after']).toBeDefined();
    expect(lastRes!.headers['ratelimit-limit']).toBeDefined();
    r();
  }, 20000);
});

describe('/weather-proxy input validation', () => {
  it('rejects more than 100 points', async () => {
    const { app, restore: r } = await loadAppWithEnv({});
    const points = Array.from({ length: 101 }, () => '34.1,134.5,2026-08-20').join(';');
    const res = await request(app).get('/weather-proxy').query({ points });
    expect(res.status).toBe(400);
    r();
  });
});
