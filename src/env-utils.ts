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
