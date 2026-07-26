/**
 * Androidアプリ(WebView)から呼び出すための簡易APIサーバー。
 *
 * ローカル起動: npx tsx src/server.ts
 * 動作確認    : http://localhost:3000/next-bus?from=4&to=5&time=09:00
 */
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import { findNextBus } from './query-next-bus';

const app = express();
app.use(cors()); // WebView(file://やhttps://)からのアクセスを許可

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/next-bus', async (req, res) => {
  try {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const time = String(req.query.time ?? '09:00'); // "HH:MM"
    const weekday = req.query.weekday !== undefined ? Number(req.query.weekday) : new Date().getDay();

    if (!from || !to) {
      return res.status(400).json({ error: 'from, to は必須です（札所番号）' });
    }

    const [h, m] = time.split(':').map(Number);
    const afterMinutes = h * 60 + m;

    const result = await findNextBus(from, to, afterMinutes, weekday);
    res.json({ from, to, time, weekday, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  }
});

const PORT = Number(process.env.PORT ?? 3000);

// デバッグ用: 環境変数が実際に読み込めているか確認（パスワード部分は伏せる）
if (process.env.DATABASE_URL) {
  const masked = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
  console.log(`[startup] DATABASE_URL detected: ${masked}`);
} else {
  console.log('[startup] DATABASE_URL is NOT set. Falling back to localhost.');
}

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});