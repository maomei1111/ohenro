import crypto from 'crypto';

// legacy_paid(有料公開期間中の購入者)・pro_one_time(将来無料化後の買い切りPro購入者)の
// 権利判定・引継ぎコード発行・Google Play購入検証をまとめたモジュール。
// docs/PAID_LAUNCH_AND_GOSHUIN_LIST_SPEC.md 3章。
// DBアクセスはsrc/server.ts側(既存の他エンドポイントと同じくds.getRepository経由)で行い、
// ここにはネットワーク呼び出し・暗号処理などモック差し替えが必要な純粋なロジックだけを置く。

// ログイン機能が無いアプリのため、この文字列自体が「パスワード」に相当する。
// 見間違えやすい 0/O, 1/I を除いた32文字から生成する。
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_GROUPS = 4;
const RECOVERY_CODE_GROUP_LEN = 4;

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < RECOVERY_CODE_GROUP_LEN; i++) {
      group += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// クライアント入力を正規化する(全角→半角は要求しない。大文字化・前後空白除去・区切り統一のみ)。
export function normalizeRecoveryCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

// spec 3.4: hasProEntitlement = legacy_paid || pro_one_time
// (種別を問わずstatus==='active'であれば権利ありとする、共通の1箇所判定)
export function hasProEntitlement(status: string): boolean {
  return status === 'active';
}

type PlayVerificationResult = { valid: true } | { valid: false; reason: string };

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch (e) {
    console.error('[entitlement] GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_JSON is not valid JSON');
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const account = getServiceAccount();
  if (!account) return null;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      console.error(`[entitlement] failed to obtain Google access token: status ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) return null;
    cachedAccessToken = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) };
    return cachedAccessToken.token;
  } catch (e) {
    console.error('[entitlement] exception while obtaining Google access token:', e);
    return null;
  }
}

// Google Play Developer API (purchases.products.get) で買い切り商品の購入トークンを検証する。
// サービスアカウント未設定の環境(ローカル開発・移行前の本番)では常にnot_configuredを返す
// (仕組みが無いことを明示し、誤ってvalid扱いにしないため)。
export async function verifyPlayPurchase(purchaseToken: string, productId: string): Promise<PlayVerificationResult> {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) return { valid: false, reason: 'not_configured' };

  const accessToken = await getAccessToken();
  if (!accessToken) return { valid: false, reason: 'not_configured' };

  try {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.error(`[entitlement] Play purchase verification upstream status ${res.status}`);
      return { valid: false, reason: 'upstream_error' };
    }
    const body = (await res.json()) as { purchaseState?: number };
    // purchaseState: 0=購入済み, 1=キャンセル済み, 2=保留中(spec 5.1のとおり保留・キャンセルは有効扱いしない)
    if (body.purchaseState === 0) return { valid: true };
    return { valid: false, reason: 'not_purchased' };
  } catch (e) {
    console.error('[entitlement] exception during Play purchase verification:', e);
    return { valid: false, reason: 'verification_failed' };
  }
}
