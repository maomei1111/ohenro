/**
 * Androidアプリ(WebView)から呼び出すための簡易APIサーバー。
 *
 * ローカル起動: npx tsx src/server.ts
 * 動作確認    : http://localhost:3000/next-bus?from=4&to=5&time=09:00
 */
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { findNextBus } from './query-next-bus';
import { AppDataSource } from './data-source';

const app = express();
app.use(cors()); // WebView(file://やhttps://)からのアクセスを許可

// 88札所のマスタデータ（番号・名前・都道府県・市区町村・緯度経度）
// src/data/temples_88.json に配置。アプリ側はこのAPIから取得し、
// サーバー側の停留所マッチング(match-temple-stops.ts)とも同じデータを共有する。
const templesPath = path.join(__dirname, 'data', 'temples_88.json');
let temples88: any[] = [];
try {
  temples88 = JSON.parse(fs.readFileSync(templesPath, 'utf-8'));
  console.log(`[startup] ${temples88.length}件の札所データを読み込みました`);
} catch (e) {
  console.error('[startup] temples_88.json の読み込みに失敗しました:', e);
}

app.get('/temples', (_req, res) => {
  res.json(temples88);
});

// メインのプランナー画面を配信。Google Maps APIキーはビルド時に埋め込まず、
// リクエスト時に環境変数から動的に埋め込む(コードにキーを残さないため)。
const indexTemplatePath = path.join(__dirname, 'public', 'index.html');
app.get('/', (_req, res) => {
  try {
    let html = fs.readFileSync(indexTemplatePath, 'utf-8');
    html = html.replace('{{GOOGLE_MAPS_API_KEY}}', process.env.GOOGLE_MAPS_API_KEY ?? '');
    res.type('html').send(html);
  } catch (e) {
    console.error('[/] failed to serve index.html:', e);
    res.status(500).send('internal error');
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/next-bus', async (req, res) => {
  try {
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const time = String(req.query.time ?? '09:00'); // "HH:MM"

    if (!from || !to) {
      return res.status(400).json({ error: 'from, to は必須です（札所番号）' });
    }

    // date: "YYYY-MM-DD" 形式で受け取る。省略時はサーバーの「今日」を使う。
    const dateParam = req.query.date ? String(req.query.date) : null;
    const targetDate = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'date は YYYY-MM-DD 形式で指定してください' });
    }
    const weekday = targetDate.getDay();
    const dateStr =
      targetDate.getFullYear().toString() +
      String(targetDate.getMonth() + 1).padStart(2, '0') +
      String(targetDate.getDate()).padStart(2, '0');

    const [h, m] = time.split(':').map(Number);
    const afterMinutes = h * 60 + m;

    const result = await findNextBus(from, to, afterMinutes, weekday, dateStr);
    res.json({ from, to, time, date: dateStr, weekday, result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  }
});

// WebView(file://)からOverpass APIへ直接fetchするとCORS(Origin: null)で拒否されるため、
// サーバー側で代理リクエストする。ブラウザ⇔サーバー間はcors()で許可済み、
// サーバー⇔Overpass間はサーバー同士の通信なのでCORSの制約を受けない。
// 以前はOverpass APIへ毎回ライブで問い合わせていたが、公開デモサーバーの
// 混雑・タイムアウトに悩まされたため、事前に precompute-landmarks.ts で
// 取り込んでおいた自前DB(cached_landmarks)を検索する方式に変更。
// クライアント側の呼び出し方(GET /overpass-proxy?bbox=...)は変えていない。
app.get('/overpass-proxy', async (req, res) => {
  try {
    const bbox = String(req.query.bbox ?? ''); // "south,west,north,east"
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return res.status(400).json({ error: 'bbox は "south,west,north,east" 形式で必須です' });
    }
    const [south, west, north, east] = parts;

    const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
    const rows = await ds.query(
      `SELECT osm_id, lat, lng, name, tags FROM cached_landmarks
       WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4`,
      [south, north, west, east]
    );

    // クライアント側は Overpass由来のelements形式 ({lat, lon, tags}) を期待しているため、
    // 同じ形に整形して返す（クライアントの実装は変更不要にするため）。
    const elements = rows.map((r: any) => ({
      id: r.osm_id,
      lat: Number(r.lat),
      lon: Number(r.lng),
      tags: r.tags,
    }));
    res.json({ elements });
  } catch (e) {
    console.error('[overpass-proxy] exception:', e);
    res.status(500).json({ error: 'internal error', detail: (e as Error).message });
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