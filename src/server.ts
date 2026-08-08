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

// 札所の見どころ画像（src/public/temple-images/ 配下）を配信
app.use('/temple-images', express.static(path.join(__dirname, 'public', 'temple-images')));

// デジタル御朱印画像（src/public/goshuin/ 配下）を配信
// ファイル名は {札所番号2桁}.png（例: 01.png, 02.png）
app.use('/goshuin', express.static(path.join(__dirname, 'public', 'goshuin')));

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

// Google Places由来の写真・紹介文（fetch-temple-places-info.ts で事前取得したもの）。
// 無くてもアプリ自体は動くよう、読み込み失敗は握りつぶす。
const templesPlacesPath = path.join(__dirname, 'data', 'temples_88_places.json');
let templesPlacesInfo: Record<string, any> = {};
try {
  templesPlacesInfo = JSON.parse(fs.readFileSync(templesPlacesPath, 'utf-8'));
  console.log(`[startup] ${Object.keys(templesPlacesInfo).length}件の札所Places情報を読み込みました`);
} catch (e) {
  console.log('[startup] temples_88_places.json は未生成です（紹介文・写真は非表示になります）');
}

app.get('/temples', (_req, res) => {
  res.json(temples88);
});

app.get('/temple-places', (_req, res) => {
  res.json(templesPlacesInfo);
});

// 札所⇔バス停 の事前計算済み徒歩ルート(walk_route)を配信。
// クライアント側は temple_no + agency_key + stop_id をキーに引き当てて使う。
app.get('/stop-walk-routes', async (_req, res) => {
  try {
    const ds = AppDataSource.isInitialized ? AppDataSource : await AppDataSource.initialize();
    const rows = await ds.query(
      `SELECT temple_no, agency_key, stop_id, walk_route FROM temple_stop_links WHERE walk_route IS NOT NULL`
    );
    res.json(rows);
  } catch (e) {
    console.error('[stop-walk-routes] exception:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

// 札所ごとのオリジナル紹介ページ（由来・見どころ）。
// 外部サイトの文章を複製せず、事実ベースで新規に書き起こしたもの。
// まずは試作として1番のみ用意している。
const templeDescriptionsPath = path.join(__dirname, 'data', 'temple_descriptions.json');
let templeDescriptions: Record<string, any> = {};
try {
  templeDescriptions = JSON.parse(fs.readFileSync(templeDescriptionsPath, 'utf-8'));
} catch (e) {
  console.log('[startup] temple_descriptions.json は未生成です');
}

// 詳細ページのUI文言（由来・見どころ・戻る 等）。7言語分。
const TEMPLE_PAGE_UI: Record<string, { history: string; highlights: string; back: string; empty: string; title: string }> = {
  ja: { history: '由来', highlights: '見どころ', back: '← 戻る', empty: 'この札所の紹介文は準備中です。', title: '番' },
  en: { history: 'History', highlights: 'Highlights', back: '← Back', empty: 'A description for this temple is coming soon.', title: '' },
  ko: { history: '유래', highlights: '볼거리', back: '← 뒤로', empty: '이 사찰의 소개 글은 준비 중입니다.', title: '번' },
  'zh-CN': { history: '由来', highlights: '看点', back: '← 返回', empty: '该寺庙的介绍正在准备中。', title: '番' },
  'zh-TW': { history: '由來', highlights: '看點', back: '← 返回', empty: '該寺廟的介紹正在準備中。', title: '番' },
  de: { history: 'Geschichte', highlights: 'Highlights', back: '← Zurück', empty: 'Eine Beschreibung für diesen Tempel folgt in Kürze.', title: '' },
  pt: { history: 'História', highlights: 'Destaques', back: '← Voltar', empty: 'A descrição deste templo será adicionada em breve.', title: '' },
};

app.get('/temple/:no', (req, res) => {
  const no = Number(req.params.no);
  const temple = temples88.find((t) => t.no === no);
  if (!temple) return res.status(404).send('Not found');

  const lang = TEMPLE_PAGE_UI[String(req.query.lang)] ? String(req.query.lang) : 'ja';
  const ui = TEMPLE_PAGE_UI[lang];
  const desc = templeDescriptions[String(no)]?.[lang] ?? templeDescriptions[String(no)]?.ja;

  const placeInfo = templesPlacesInfo[String(no)];
  const photoUrl = placeInfo?.photoName
    ? `https://places.googleapis.com/v1/${placeInfo.photoName}/media?maxHeightPx=500&key=${process.env.GOOGLE_MAPS_API_KEY ?? ''}`
    : null;

  const spotsHtml =
    desc?.spots && desc.spots.length
      ? desc.spots
          .map(
            (spot: any) => `
      <div class="spot-card">
        <h3>${spot.name}</h3>
        <p>${spot.description}</p>
      </div>`
          )
          .join('')
      : '';

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${no}${ui.title} ${temple.name} - Ohenro</title>
<style>
  body{ font-family:'Noto Sans JP', sans-serif; max-width:640px; margin:0 auto; padding:24px; background:#F7F1E6; color:#2B2825; line-height:1.9; }
  h1{ font-family:'Noto Serif JP', serif; font-size:26px; color:#1D2B4F; margin-bottom:4px; }
  .no{ color:#A63A2A; font-family:monospace; }
  img{ width:100%; border-radius:4px; margin:16px 0 4px; display:block; }
  .credit{ font-size:11px; color:#8a8578; margin-bottom:20px; }
  h2{ font-size:16px; border-left:4px solid #A63A2A; padding-left:10px; margin-top:32px; }
  h3{ font-family:'Noto Serif JP', serif; font-size:17px; color:#1D2B4F; margin:10px 0 6px; }
  a.back{ display:inline-block; margin-top:32px; color:#33507A; }
  .empty{ color:#8a8578; font-size:14px; }
  .spots-grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:12px; }
  @media (max-width:520px){ .spots-grid{ grid-template-columns:1fr; } }
  .spot-card p{ font-size:13.5px; }
</style>
</head>
<body>
  <h1><span class="no">${no}${ui.title}</span> ${temple.name}</h1>
  ${photoUrl ? `<img src="${photoUrl}" alt="${temple.name}"><div class="credit">Photo: ${placeInfo.photoAttribution || 'Google'}</div>` : ''}
  ${desc ? `
    <h2>${ui.history}</h2>
    <p>${desc.history}</p>
    ${spotsHtml ? `<h2>${ui.highlights}</h2><div class="spots-grid">${spotsHtml}</div>` : ''}
  ` : `<p class="empty">${ui.empty}</p>`}
  <a class="back" href="javascript:history.back()">${ui.back}</a>
</body>
</html>`;
  res.type('html').send(html);
});

// メインのプランナー画面を配信。Google Maps APIキーはビルド時に埋め込まず、
// リクエスト時に環境変数から動的に埋め込む(コードにキーを残さないため)。
const indexTemplatePath = path.join(__dirname, 'public', 'index.html');
app.get('/', (_req, res) => {
  try {
    let html = fs.readFileSync(indexTemplatePath, 'utf-8');
    html = html.replaceAll('{{GOOGLE_MAPS_API_KEY}}', process.env.GOOGLE_MAPS_API_KEY ?? '');
    html = html.replaceAll(
      '{{GOOGLE_MAPS_MAP_ID}}',
      process.env.GOOGLE_MAPS_MAP_ID ?? '75b8f3f04b0ac15a904e6d31'
    );
    // WebView/ブラウザによる古いバージョンのキャッシュを防ぐ
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.type('html').send(html);
  } catch (e) {
    console.error('[/] failed to serve index.html:', e);
    res.status(500).send('internal error');
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// プライバシーポリシー（Google Playのストア掲載に必要な公開URL）
app.get('/privacy', (_req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'privacy.html'), 'utf-8');
    res.type('html').send(html);
  } catch (e) {
    console.error('[/privacy] failed to serve privacy.html:', e);
    res.status(500).send('internal error');
  }
});

// データ提供元クレジット（GTFS各社・OpenStreetMap等のライセンス表示義務対応）
app.get('/credits', (_req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'credits.html'), 'utf-8');
    res.type('html').send(html);
  } catch (e) {
    console.error('[/credits] failed to serve credits.html:', e);
    res.status(500).send('internal error');
  }
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

// 天気予報プロキシ（Open-Meteo, APIキー不要）。
// ルート結果は複数の札所（区間ごと）を経由するため、区間ごとに個別の地点で天気を取得する。
// 同じ緯度経度(小数点2桁=約1km格子)・日付の組み合わせはメモリ上に短時間(30分)キャッシュし、
// 近接する札所をまとめて問い合わせた場合に外部APIへの重複リクエストを避ける。
const weatherCache = new Map<string, { expires: number; data: any }>();
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

function weatherCacheKey(lat: number, lng: number, date: string): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${date}`;
}

async function fetchWeatherForPoint(lat: number, lng: number, date: string): Promise<any> {
  const key = weatherCacheKey(lat, lng, date);
  const cached = weatherCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  let data: any = { available: false };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=weathercode,temperature_2m_max,precipitation_probability_max` +
      `&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
    const apiRes = await fetch(url);
    if (apiRes.ok) {
      const json: any = await apiRes.json();
      const idx = json?.daily?.time?.indexOf(date) ?? -1;
      const weathercode = idx >= 0 ? json.daily.weathercode?.[idx] : undefined;
      const maxTempC = idx >= 0 ? json.daily.temperature_2m_max?.[idx] : undefined;
      const precipProbability = idx >= 0 ? json.daily.precipitation_probability_max?.[idx] : undefined;
      if (weathercode != null && maxTempC != null) {
        data = { available: true, weathercode, maxTempC, precipProbability: precipProbability ?? 0 };
      }
    }
  } catch (e) {
    console.error('[weather-proxy] fetch failed:', e);
  }

  weatherCache.set(key, { expires: Date.now() + WEATHER_CACHE_TTL_MS, data });
  return data;
}

// points=lat,lng,date(YYYY-MM-DD);lat,lng,date;... の形式で、区間の数だけ地点を渡す。
// レスポンスの results は points と同じ順序で返す（該当日が予報範囲外の場合は available:false）。
app.get('/weather-proxy', async (req, res) => {
  try {
    const points = String(req.query.points ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [latStr, lngStr, date] = s.split(',');
        return { lat: Number(latStr), lng: Number(lngStr), date };
      });

    const isValid =
      points.length > 0 &&
      points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && /^\d{4}-\d{2}-\d{2}$/.test(p.date ?? ''));
    if (!isValid) {
      return res.status(400).json({ error: 'points=lat,lng,date(YYYY-MM-DD) の形式で1件以上必須です' });
    }

    // 同一の格子・日付は1回だけ問い合わせて使い回す
    const uniqueKeys = [...new Set(points.map((p) => weatherCacheKey(p.lat, p.lng, p.date)))];
    const uniqueResults = new Map<string, any>();
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const [latStr, lngStr, date] = key.split(',');
        uniqueResults.set(key, await fetchWeatherForPoint(Number(latStr), Number(lngStr), date));
      })
    );

    const results = points.map((p) => uniqueResults.get(weatherCacheKey(p.lat, p.lng, p.date)));
    res.json({ results });
  } catch (e) {
    console.error('[weather-proxy] exception:', e);
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
