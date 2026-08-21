// サーバー環境変数を安全に真偽値へ変換するユーティリティ。
// 未設定・不正値は必ず安全側(既定値)へフォールバックする。
export function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  console.warn(`[config] invalid boolean env value "${value}"; using ${defaultValue}`);
  return defaultValue;
}

// CORS_ALLOWED_ORIGINS をカンマ区切りでパースする。
// "*" やワイルドカードを含む値は許可オリジンとして絶対に採用しない
// (無条件許可に相当してしまうため、安全側でその要素だけ無視して警告する)。
export function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (value == null || value.trim() === '') return new Set();
  const origins = new Set<string>();
  for (const raw of value.split(',')) {
    const origin = raw.trim();
    if (!origin) continue;
    if (origin.includes('*')) {
      console.warn(`[config] CORS_ALLOWED_ORIGINS contains a wildcard entry "${origin}"; ignoring it`);
      continue;
    }
    if (origin.endsWith('/')) {
      console.warn(`[config] CORS_ALLOWED_ORIGINS entry "${origin}" has a trailing slash; ignoring it`);
      continue;
    }
    origins.add(origin);
  }
  return origins;
}

// TRUST_PROXY_HOPS を安全な正の整数へ変換する。不正値・未設定は既定値(1)。
export function parseTrustProxyHops(value: string | undefined, defaultValue = 1): number {
  if (value == null || value.trim() === '') return defaultValue;
  const n = Number(value.trim());
  if (Number.isInteger(n) && n >= 0) return n;
  console.warn(`[config] invalid TRUST_PROXY_HOPS value "${value}"; using ${defaultValue}`);
  return defaultValue;
}

// DATABASE_URL等の接続文字列に含まれるパスワード部分を伏せる。
// ログ・例外メッセージへ接続文字列をそのまま出さないようにするため
// (postgresql://user:password@host/db 形式のpassword部分だけを****に置換する)。
export function maskConnectionString(value: string): string {
  return value.replace(/:([^:@/]+)@/g, ':****@');
}

// DB接続失敗時などの例外を、接続文字列(パスワード含む)を含めない安全な文字列へ変換する。
export function sanitizeDbError(e: unknown, connectionString?: string): string {
  let message = e instanceof Error ? e.message : String(e);
  if (connectionString) {
    message = message.split(connectionString).join(maskConnectionString(connectionString));
  }
  return maskConnectionString(message);
}
