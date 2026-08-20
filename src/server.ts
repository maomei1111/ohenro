/**
 * Androidアプリ(WebView)から呼び出すための簡易APIサーバー。
 *
 * ローカル起動: npx tsx src/server.ts
 * 動作確認    : http://localhost:3000/next-bus?from=4&to=5&time=09:00
 */
import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { findNextBus } from './query-next-bus';
import { AppDataSource } from './data-source';
import { parseBooleanEnv, parseAllowedOrigins, parseTrustProxyHops } from './env-utils';

// 起動時に一度だけ評価する。値が不正な場合の警告ログもここで1回だけ出す
// （リクエストごとに再評価すると、不正値の警告が毎回出てログが埋まってしまうため）。
const DISABLE_GOSHUIN_LOCATION_CHECK = parseBooleanEnv(process.env.DISABLE_GOSHUIN_LOCATION_CHECK, false);
console.log(
  `[config] goshuin location check: ${DISABLE_GOSHUIN_LOCATION_CHECK ? 'disabled (test mode)' : 'enabled'}`
);

// CORS許可オリジン一覧。"*"やワイルドカードは絶対に許可オリジンとして採用しない
// (parseAllowedOriginsが安全側で無視して警告する)。カンマ区切り・完全一致判定のみ。
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
// file:// から読み込まれるAndroid WebViewはOriginヘッダーが文字列"null"になることがある。
// 実機で実際にそうなるかは要確認のため、既定は不許可(false)。
const ALLOW_NULL_ORIGIN = parseBooleanEnv(process.env.ALLOW_NULL_ORIGIN, false);
// Railway等のリバースプロキシ配下で正しいクライアントIPを取得するためのホップ数。
// 無制限のtrueにはしない(不正値・未設定は安全側の既定値1)。
const TRUST_PROXY_HOPS = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS, 1);
console.log(
  `[config] CORS allowed origins: ${ALLOWED_ORIGINS.size === 0 ? '(none configured)' : `${ALLOWED_ORIGINS.size} configured`}, ` +
    `allow null origin: ${ALLOW_NULL_ORIGIN}, trust proxy hops: ${TRUST_PROXY_HOPS}`
);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Originヘッダーが無いリクエスト(同一サイト・ネイティブ相当・curl等)は許可する。
    if (!origin) return callback(null, true);
    if (origin === 'null') {
      return ALLOW_NULL_ORIGIN ? callback(null, true) : callback(new Error('CORS origin denied'));
    }
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  methods: ['GET', 'OPTIONS'],
};

// too_many_requestsのJSON形式・ヘッダーは全レート制限で共通のため、生成関数にまとめる。
// 実測前の初期値であるため、通常操作で429が頻発する場合はここを調整する。
function createLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // RateLimit-* ヘッダーを付与
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({
        error: 'too_many_requests',
        message: 'しばらく待ってから再度お試しください',
      });
    },
  });
}

// 対象エンドポイントごとの初期値(1分あたりの許容回数)。
// DB・外部APIへの負荷を抑えつつ通常のルート再計算操作は妨げないよう設定。
const nextBusLimiter = createLimiter(60 * 1000, 120); // ルート再計算を許容しつつDBを保護
const weatherProxyLimiter = createLimiter(60 * 1000, 30); // Open-Meteoへの代理アクセスを保護
const overpassProxyLimiter = createLimiter(60 * 1000, 30); // DB検索・地図関連処理を保護
const stopWalkRoutesLimiter = createLimiter(60 * 1000, 60); // DB参照を保護
const templesLimiter = createLimiter(60 * 1000, 120); // マスタ取得を保護

export function createApp() {
  const app = express();

  // Railwayのプロキシ経由でも正しいクライアントIPを扱えるようにする。
  // レート制限ミドルウェアより前に設定すること。
  app.set('trust proxy', TRUST_PROXY_HOPS);

  // Google Maps、Google Fonts、既存のインラインスクリプトと衝突しないよう、
  // 初回導入ではCSPは有効化しない(別段階でReport-Onlyから調査する)。
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  app.use(cors(corsOptions)); // 許可オリジンのみCORSを許可(WebViewのfile://等は環境変数で個別許可)

  // 札所の見どころ画像（src/public/temple-images/ 配下）を配信
  app.use('/temple-images', express.static(path.join(__dirname, 'public', 'temple-images')));

  // デジタル御朱印画像（src/public/goshuin/ 配下）を配信
  // ファイル名は {札所番号2桁}.webp（例: 01.webp, 02.webp）
  app.use('/goshuin', express.static(path.join(__dirname, 'public', 'goshuin')));

  // Serve the bundled font used for dates on goshuin images.
  app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));

  // index.htmlから切り出した純粋関数・辞書(src/public/js/ 配下)を配信
  app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

  // index.htmlから切り出したCSS(src/public/css/ 配下)を配信
  app.use('/css', express.static(path.join(__dirname, 'public', 'css')));

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

  app.get('/temples', templesLimiter, (_req, res) => {
    res.json(temples88);
  });

  app.get('/temple-places', templesLimiter, (_req, res) => {
    res.json(templesPlacesInfo);
  });

  // 札所⇔バス停 の事前計算済み徒歩ルート(walk_route)を配信。
  // クライアント側は temple_no + agency_key + stop_id をキーに引き当てて使う。
  app.get('/stop-walk-routes', stopWalkRoutesLimiter, async (_req, res) => {
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
      html = html.replaceAll('{{DISABLE_GOSHUIN_LOCATION_CHECK}}', String(DISABLE_GOSHUIN_LOCATION_CHECK));
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

  app.get('/next-bus', nextBusLimiter, async (req, res) => {
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
  app.get('/overpass-proxy', overpassProxyLimiter, async (req, res) => {
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
  // 取得失敗(available:false)は一時的な要因(コールドスタート直後の名前解決失敗など)のことが多いため、
  // 成功結果より短い時間だけキャッシュし、次のリクエストで早めに再試行されるようにする。
  const WEATHER_FAILURE_CACHE_TTL_MS = 2 * 60 * 1000;
  // 外部API(Open-Meteo)がハングした場合にリクエストを溜め込まないためのタイムアウト。
  const WEATHER_FETCH_TIMEOUT_MS = 8000;
  // 1リクエストで受け付ける最大地点数。区間が極端に多いルートでも外部APIへの
  // 同時リクエスト数を有限に保つための上限（15節）。
  const WEATHER_MAX_POINTS = 100;

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
        `&daily=weathercode,temperature_2m_max,precipitation_probability_max,relative_humidity_2m_mean` +
        `&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
      const apiRes = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
      if (apiRes.ok) {
        const json: any = await apiRes.json();
        const idx = json?.daily?.time?.indexOf(date) ?? -1;
        const weathercode = idx >= 0 ? json.daily.weathercode?.[idx] : undefined;
        const maxTempC = idx >= 0 ? json.daily.temperature_2m_max?.[idx] : undefined;
        const precipProbability = idx >= 0 ? json.daily.precipitation_probability_max?.[idx] : undefined;
        const humidity = idx >= 0 ? json.daily.relative_humidity_2m_mean?.[idx] : undefined;
        if (weathercode != null && maxTempC != null) {
          data = {
            available: true,
            weathercode,
            maxTempC,
            precipProbability: precipProbability ?? 0,
            humidity: humidity ?? null,
          };
        } else {
          console.warn(`[weather-proxy] no data for ${date} in response:`, JSON.stringify(json).slice(0, 300));
        }
      } else {
        const bodyText = await apiRes.text().catch(() => '');
        console.warn(`[weather-proxy] open-meteo responded ${apiRes.status} for ${url}: ${bodyText.slice(0, 300)}`);
      }
    } catch (e) {
      console.error('[weather-proxy] fetch failed:', e);
    }

    const ttl = data.available ? WEATHER_CACHE_TTL_MS : WEATHER_FAILURE_CACHE_TTL_MS;
    weatherCache.set(key, { expires: Date.now() + ttl, data });
    return data;
  }

  // points=lat,lng,date(YYYY-MM-DD);lat,lng,date;... の形式で、区間の数だけ地点を渡す。
  // レスポンスの results は points と同じ順序で返す（該当日が予報範囲外の場合は available:false）。
  app.get('/weather-proxy', weatherProxyLimiter, async (req, res) => {
    try {
      const points = String(req.query.points ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [latStr, lngStr, date] = s.split(',');
          return { lat: Number(latStr), lng: Number(lngStr), date };
        });

      if (points.length > WEATHER_MAX_POINTS) {
        return res.status(400).json({ error: `points は最大${WEATHER_MAX_POINTS}件までです` });
      }

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

  // corsのorigin検証で拒否された場合、express-rate-limit等のミドルウェアが投げた
  // その他のエラーも含め、Expressの既定エラーハンドラ(スタックトレース・サーバーの
  // ファイルパスをHTMLで返してしまう)を経由させない。許可オリジン一覧など秘密情報も返さない。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === 'CORS origin denied') {
      return res.status(403).json({ error: 'cors_denied' });
    }
    console.error('[server] unhandled error:', err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

// テスト(supertest等)からはこのファイルをrequireしてもポート待受・DB初期化が
// 勝手に始まらないよう、実サーバーとしての起動はメインモジュールとして
// 実行された場合だけ行う。
if (require.main === module) {
  const PORT = Number(process.env.PORT ?? 3000);

  // デバッグ用: 環境変数が実際に読み込めているか確認（パスワード部分は伏せる）
  if (process.env.DATABASE_URL) {
    const masked = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log(`[startup] DATABASE_URL detected: ${masked}`);
  } else {
    console.log('[startup] DATABASE_URL is NOT set. Falling back to localhost.');
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
}
