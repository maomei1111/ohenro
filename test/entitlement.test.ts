import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { DataSource } from 'typeorm';

// server.tsと同じ「環境変数を切り替えるたびにモジュールを再読込する」パターン
// (test/server-protection.test.tsを参照)。
async function loadAppWithEnv(env: Record<string, string | undefined>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  vi.resetModules();
  const { createApp } = await import('../src/server');
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

// AppDataSource.getRepository(Entitlement) をDB無しで差し替えるための、
// 素朴なメモリ上リポジトリ。recovery_code/purchase_tokenの一意制約違反も再現する。
function makeFakeEntitlementRepo() {
  const rows: any[] = [];
  let nextId = 1;
  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: async (entity: any) => {
      if (entity.id == null) {
        if (rows.some((r) => r.recovery_code === entity.recovery_code)) {
          const err: any = new Error('duplicate key value violates unique constraint "UQ_entitlements_recovery_code"');
          throw err;
        }
        if (entity.purchase_token && rows.some((r) => r.purchase_token === entity.purchase_token)) {
          const err: any = new Error('duplicate key value violates unique constraint "UQ_entitlements_purchase_token"');
          throw err;
        }
        entity.id = nextId++;
        rows.push(entity);
      } else {
        const idx = rows.findIndex((r) => r.id === entity.id);
        if (idx >= 0) rows[idx] = entity;
      }
      return entity;
    },
    findOne: async ({ where }: any) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
    },
  };
}

const RECOVERY_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

describe('GET /entitlement/status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns found:false when code is missing', async () => {
    const { app, restore } = await loadAppWithEnv({});
    const res = await request(app).get('/entitlement/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
    restore();
  });

  it('returns found:false for a malformed code without touching the DB', async () => {
    const { app, dataSource, restore } = await loadAppWithEnv({});
    const repo = makeFakeEntitlementRepo();
    const getRepoSpy = vi.spyOn(dataSource, 'getRepository').mockReturnValue(repo as any);
    const res = await request(app).get('/entitlement/status').query({ code: 'not-a-code' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
    expect(getRepoSpy).not.toHaveBeenCalled();
    restore();
  });

  it('returns found:false for a well-formed but unknown code', async () => {
    const { app, dataSource, restore } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    vi.spyOn(dataSource, 'getRepository').mockReturnValue(makeFakeEntitlementRepo() as any);
    const res = await request(app).get('/entitlement/status').query({ code: 'ABCD-EFGH-2345-6789' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
    restore();
  });

  it('returns the entitlement and hasProEntitlement:true for an active legacy_paid code', async () => {
    const { app, dataSource, restore } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    const repo = makeFakeEntitlementRepo();
    repo.rows.push({
      id: 1,
      recovery_code: 'ABCD-EFGH-2345-6789',
      entitlement_type: 'legacy_paid',
      status: 'active',
      purchase_token: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      last_verified_at: new Date('2026-01-01T00:00:00Z'),
    });
    vi.spyOn(dataSource, 'getRepository').mockReturnValue(repo as any);
    const res = await request(app).get('/entitlement/status').query({ code: 'abcd-efgh-2345-6789' }); // 小文字でも通る
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      entitlementType: 'legacy_paid',
      status: 'active',
      hasProEntitlement: true,
    });
    // last_verified_atが更新されている
    expect(repo.rows[0].last_verified_at.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime());
    restore();
  });

  it('reports hasProEntitlement:false for a revoked entitlement', async () => {
    const { app, dataSource, restore } = await loadAppWithEnv({});
    dataSource.isInitialized = true;
    const repo = makeFakeEntitlementRepo();
    repo.rows.push({
      id: 1,
      recovery_code: 'ABCD-EFGH-2345-6789',
      entitlement_type: 'pro_one_time',
      status: 'revoked',
      last_verified_at: new Date(),
    });
    vi.spyOn(dataSource, 'getRepository').mockReturnValue(repo as any);
    const res = await request(app).get('/entitlement/status').query({ code: 'ABCD-EFGH-2345-6789' });
    expect(res.body.hasProEntitlement).toBe(false);
    restore();
  });
});

describe('POST /entitlement/admin/register-legacy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 404 when ENTITLEMENT_ADMIN_SECRET is not configured', async () => {
    const { app, restore } = await loadAppWithEnv({ ENTITLEMENT_ADMIN_SECRET: undefined });
    const res = await request(app).post('/entitlement/admin/register-legacy').send({ note: 'test' });
    expect(res.status).toBe(404);
    restore();
  });

  it('returns 404 when the provided secret does not match', async () => {
    const { app, restore } = await loadAppWithEnv({ ENTITLEMENT_ADMIN_SECRET: 'correct-secret' });
    const res = await request(app)
      .post('/entitlement/admin/register-legacy')
      .set('X-Admin-Secret', 'wrong-secret')
      .send({ note: 'test' });
    expect(res.status).toBe(404);
    restore();
  });

  it('issues a recovery code and creates an active legacy_paid row when the secret matches', async () => {
    const { app, dataSource, restore } = await loadAppWithEnv({ ENTITLEMENT_ADMIN_SECRET: 'correct-secret' });
    dataSource.isInitialized = true;
    const repo = makeFakeEntitlementRepo();
    vi.spyOn(dataSource, 'getRepository').mockReturnValue(repo as any);

    const res = await request(app)
      .post('/entitlement/admin/register-legacy')
      .set('X-Admin-Secret', 'correct-secret')
      .send({ note: 'support ticket #123' });

    expect(res.status).toBe(200);
    expect(res.body.recoveryCode).toMatch(RECOVERY_CODE_RE);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      entitlement_type: 'legacy_paid',
      status: 'active',
      note: 'support ticket #123',
    });
    restore();
  });
});

describe('POST /entitlement/verify-purchase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a request missing purchaseToken/productId', async () => {
    const { app, restore } = await loadAppWithEnv({});
    const res = await request(app).post('/entitlement/verify-purchase').send({});
    expect(res.status).toBe(400);
    restore();
  });

  it('returns 400 when GOOGLE_PLAY_PACKAGE_NAME is not configured (not_configured)', async () => {
    const { app, restore } = await loadAppWithEnv({ GOOGLE_PLAY_PACKAGE_NAME: undefined });
    const res = await request(app)
      .post('/entitlement/verify-purchase')
      .send({ purchaseToken: 'tok', productId: 'pro_lifetime' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_purchase', reason: 'not_configured' });
    restore();
  });

  it('creates a pro_one_time entitlement when Google reports the purchase as purchased', async () => {
    // JWT署名(crypto.createSign(...).sign(privateKey))を実際に通すため、テスト用に
    // 本物の鍵ペアを生成する(ダミー文字列だと署名処理自体が例外になるため)。
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const { app, dataSource, restore } = await loadAppWithEnv({
      GOOGLE_PLAY_PACKAGE_NAME: 'com.example.ohenro',
      GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify({
        client_email: 'svc@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    });
    dataSource.isInitialized = true;
    const repo = makeFakeEntitlementRepo();
    vi.spyOn(dataSource, 'getRepository').mockReturnValue(repo as any);

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('androidpublisher.googleapis.com')) {
        return new Response(JSON.stringify({ purchaseState: 0 }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const res = await request(app)
      .post('/entitlement/verify-purchase')
      .send({ purchaseToken: 'tok-1', productId: 'pro_lifetime' });

    expect(res.status).toBe(200);
    expect(res.body.hasProEntitlement).toBe(true);
    expect(res.body.recoveryCode).toMatch(RECOVERY_CODE_RE);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ entitlement_type: 'pro_one_time', purchase_token: 'tok-1' });
    expect(fetchSpy).toHaveBeenCalled();
    restore();
  });

  it('returns 400 when Google reports the purchase as not purchased (e.g. pending/cancelled)', async () => {
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const { app, restore } = await loadAppWithEnv({
      GOOGLE_PLAY_PACKAGE_NAME: 'com.example.ohenro',
      GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify({
        client_email: 'svc@example.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
    });

    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ purchaseState: 1 }), { status: 200 }); // 1=キャンセル済み
    });

    const res = await request(app)
      .post('/entitlement/verify-purchase')
      .send({ purchaseToken: 'tok-2', productId: 'pro_lifetime' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_purchase', reason: 'not_purchased' });
    restore();
  });
});
