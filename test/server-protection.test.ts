import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { DataSource } from 'typeorm';

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
  // server.tsが実際に使うAppDataSourceと同一インスタンスを得るため、resetModules後に
  // 改めてdata-sourceを読み込む(先にトップレベルでimportした参照はモジュールキャッシュの
  // リセットにより別インスタンスになってしまい、モックが効かなくなるため)。
  const { AppDataSource } = await import('../src/data-source');
  const app = createApp();
  return {
    app,
    dataSource: AppDataSource as DataSource,
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

  it('reports (but does not enforce) a Content-Security-Policy', async () => {
    const { app, restore: r } = await loadAppWithEnv({});
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy-report-only']).toBeDefined();
    expect(res.headers['content-security-policy-report-only']).toContain("default-src 'self'");
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

describe('/ready', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 {ok:true} when a lightweight DB query succeeds', async () => {
    const { app, dataSource, restore: r } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    vi.spyOn(dataSource, 'query').mockResolvedValue([{ '?column?': 1 }]);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    r();
  });

  it('returns 503 {ok:false} without leaking error details when the DB query fails', async () => {
    const { app, dataSource, restore: r } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    vi.spyOn(dataSource, 'query').mockRejectedValue(new Error('connection to postgresql://user:s3cr3t@host/db failed'));
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false });
    expect(JSON.stringify(res.body)).not.toContain('s3cr3t');
    r();
  });

  it('is not rate-limited even under many requests', async () => {
    const { app, dataSource, restore: r } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    vi.spyOn(dataSource, 'query').mockResolvedValue([{ '?column?': 1 }]);
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
    }
    r();
  });
});

describe('/temple-photo/:no', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a non-numeric temple number without touching fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { app, restore: r } = await loadAppWithEnv({});
    const res = await request(app).get('/temple-photo/abc');
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    r();
  });

  it('rejects a temple number outside 1-88 without touching fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { app, restore: r } = await loadAppWithEnv({});
    const res = await request(app).get('/temple-photo/999');
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    r();
  });

  it('proxies the upstream image without leaking the server API key in the URL or response', async () => {
    const fakeImage = Buffer.from('fake-jpeg-bytes');
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(fakeImage, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    );
    const { app, restore: r } = await loadAppWithEnv({ GOOGLE_MAPS_SERVER_API_KEY: 'fake-server-key' });
    // temple 1 は src/data/temples_88_places.json に実際のphotoNameを持つ
    const res = await request(app).get('/temple-photo/1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(res.body, fakeImage)).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).toContain('fake-server-key'); // サーバー→Google間ではキーを使う
    expect(res.text ?? '').not.toContain('fake-server-key'); // クライアントへは一切渡さない
    r();
  });

  it('returns 502 without leaking upstream error details when the upstream fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }));
    const { app, restore: r } = await loadAppWithEnv({});
    const res = await request(app).get('/temple-photo/1');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('forbidden');
    r();
  });
});

describe('Google Maps API key handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never includes the server API key in the /temple/:no HTML response', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      GOOGLE_MAPS_SERVER_API_KEY: 'fake-server-key-should-not-leak',
      GOOGLE_MAPS_BROWSER_API_KEY: 'fake-browser-key',
    });
    const res = await request(app).get('/temple/1');
    expect(res.text).not.toContain('fake-server-key-should-not-leak');
    expect(res.text).not.toContain('key=');
    r();
  });

  it('embeds the browser API key (not the server key) in the / HTML response', async () => {
    const { app, restore: r } = await loadAppWithEnv({
      GOOGLE_MAPS_SERVER_API_KEY: 'fake-server-key-should-not-leak',
      GOOGLE_MAPS_BROWSER_API_KEY: 'fake-browser-key-ok-to-expose',
    });
    const res = await request(app).get('/');
    expect(res.text).toContain('fake-browser-key-ok-to-expose');
    expect(res.text).not.toContain('fake-server-key-should-not-leak');
    r();
  });
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
