// index.htmlから切り出した共有状態・i18nブートストラップ・巡礼進捗記録・本尊表示等。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

// ==================================================================
// ---- 多言語対応（i18n） ----
// ==================================================================
// 上記5ファイル(src/public/js/)から切り出した純粋関数・定数・辞書を、
// 従来通りの名前でこのスコープ内から呼べるようにする橋渡し。
// currentLangはこの直後で宣言されるが、tはgetter経由で毎回参照するため
// 宣言順の影響を受けない。
const { I18N, createTranslator, metersBetween, distToPolyline, formatDistance,
  evaluateVisitProximity, toKanjiNumber, getWarekiDate, toMinutes, toHHMM,
  warekiDateLengthClass, nokyoStatus, durationParts, TEMPLE_NAMES_EN, ROMANIZED_LANGS,
  TEMPLE_HONZON, HONZON_EN, MAX_AUTO_START_DISTANCE_M, DATE_FIELD_ORDER, INTL_LOCALES,
  AGENCY_NAMES } = window.OhenroApp;
// 共有されたリンクを開いた場合は、URLのlangパラメータ(送信者が選んだ言語)を優先する。
// 通常のアクセスでは、端末に保存済みの言語設定(localStorage)を使う。
const __urlLang = new URLSearchParams(location.search).get('lang');
let currentLang = __urlLang || localStorage.getItem('ohenro_lang') || 'ja';
const t = createTranslator(() => currentLang);
if(__urlLang) localStorage.setItem('ohenro_lang', __urlLang);
let currentTheme = localStorage.getItem('ohenro_theme') || 'auto';
function applyTheme(theme){
  currentTheme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function setTheme(theme){
  localStorage.setItem('ohenro_theme', theme);
  applyTheme(theme);
}
applyTheme(currentTheme);
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', ()=>{
    if(currentTheme === 'auto') applyTheme('auto');
  });
}

function formatDurationMinutes(minutes){
  const parts = durationParts(minutes);
  return parts.isHours ? t('duration_hm', parts.hours, parts.minutes) : t('duration_m', parts.value);
}
function templeDisplayName(temple){
  if(ROMANIZED_LANGS.includes(currentLang)) return TEMPLE_NAMES_EN[temple.no] || temple.name;
  return temple.name;
}

function applyStaticTranslations(){
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    el.innerHTML = t(el.getAttribute('data-i18n'));
  });
  const langSelect = document.getElementById('langSelect');
  if(langSelect) langSelect.value = currentLang;
  const themeSelect = document.getElementById('themeSelect');
  if(themeSelect) themeSelect.value = currentTheme;
  // 既に日付が選択されていればその値を保持したまま、表示言語(月名・並び順)だけ作り直す
  const existing = document.getElementById('dateFields')?.childElementCount ? getSelectedDateObj() : null;
  buildDateFields(existing);
}

function toggleHeroInfo(){
  document.getElementById('heroInfoTooltip')?.classList.toggle('open');
}

// window.alert()の代替。Android WebViewがonJsAlertを実装していないと
// alert()が表示されない(または反応がないように見える)ことがあるため、
// ページ内に自前でメッセージを表示する(タップ、または一定時間で自動的に消える)。
const TOAST_AUTO_HIDE_MS = 4000;
function showToast(message){
  const container = document.getElementById('appToastContainer');
  if(!container){ console.warn('[toast]', message); return; }
  const el = document.createElement('div');
  el.className = 'app-toast';
  el.textContent = message;
  const remove = () => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once:true });
  };
  el.addEventListener('click', remove);
  container.appendChild(el);
  // 追加直後にclassを付けることでCSSのtransitionを発火させる
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(remove, TOAST_AUTO_HIDE_MS);
}

// 現在の計画(出発・到着札所、日付、時刻、言語)を、URL一つで共有できるようにする
async function sharePlan(){
  const params = new URLSearchParams();
  params.set('from', startSel.value);
  params.set('to', endSel.value);
  params.set('date', getSelectedDateStr());
  params.set('time', getSelectedTimeStr());
  params.set('lang', currentLang);
  const shareUrl = `${location.origin}${location.pathname}?${params.toString()}`;

  try{
    if(navigator.share){
      await navigator.share({ title: t('hero_title').replace(/<br>/g,' '), url: shareUrl });
      return;
    }
  }catch(e){
    // ユーザーがシェアシートをキャンセルした場合等はここに来るが、エラー扱いしない
    if(e && e.name === 'AbortError') return;
  }

  // Web Share API が無い環境(PCブラウザ等)ではクリップボードにコピーする
  try{
    await navigator.clipboard.writeText(shareUrl);
    showToast(t('share_copied'));
  }catch(e){
    console.warn('share failed', e);
    showToast(t('share_failed'));
  }
}

function setLanguage(lang){
  if(lang === currentLang) return;
  localStorage.setItem('ohenro_lang', lang);
  // Google Maps自体の表示言語は再読み込みしないと切り替わらないため、
  // ページごと再読み込みする（選択中の出発・到着札所・日付・時刻は保持する）
  const params = new URLSearchParams(location.search);
  if(startSel.value) params.set('from', startSel.value);
  if(endSel.value) params.set('to', endSel.value);
  params.set('date', getSelectedDateStr());
  params.set('time', getSelectedTimeStr());
  params.set('lang', lang);
  location.search = params.toString();
}

// ---- 88札所データ（自前サーバーAPI経由。src/data/temples_88.json が単一の情報源）----
const API_BASE = ''; // 同一オリジンから配信するため空文字（相対パス）でOK
let temples = [];

const startSel = document.getElementById('startTemple');
const endSel = document.getElementById('endTemple');


let templePlacesInfo = {}; // 写真・紹介文（Google Places由来）。取得できなければ空のまま
let stopWalkRoutes = new Map(); // 札所⇔バス停の事前計算済み徒歩ルート。key: "temple_no:agency_key:stop_id"

async function loadTemples(){
  const [res, placesRes, walkRoutesRes] = await Promise.all([
    fetch(`${API_BASE}/temples`),
    fetch(`${API_BASE}/temple-places`).catch(()=>null), // 無くても致命的ではないので握りつぶす
    fetch(`${API_BASE}/stop-walk-routes`).catch(()=>null),
  ]);
  if(!res.ok) throw new Error(`temples API responded ${res.status}`);
  const raw = await res.json();
  raw.sort((a,b)=>a.no-b.no);
  temples = raw.map((t, i) => {
    const prev = raw[i-1];
    // 実測値(Google Directionsで事前計算済み)があればそれを使い、無ければ直線距離で概算
    const hasReal = t.walkDistanceKm != null && t.walkDurationMin != null;
    const straightKm = prev ? metersBetween(prev.lat, prev.lng, t.lat, t.lng)/1000 : 0;
    return {
      no: t.no, name: t.name, kana: '',
      distanceKm: hasReal ? t.walkDistanceKm : Math.round(straightKm*10)/10,
      walkDurationMin: hasReal ? t.walkDurationMin : null, // nullなら時速4km換算にフォールバック
      isRealWalkData: hasReal,
      elevations: t.elevations || null, // 事前計算済みの標高プロファイル(あれば)
      lat: t.lat, lng: t.lng,
    };
  });

  if(placesRes && placesRes.ok){
    try{ templePlacesInfo = await placesRes.json(); }catch(e){ templePlacesInfo = {}; }
  }
  if(walkRoutesRes && walkRoutesRes.ok){
    try{
      const rows = await walkRoutesRes.json();
      rows.forEach(r=> stopWalkRoutes.set(`${r.temple_no}:${r.agency_key}:${r.stop_id}`, r.walk_route));
    }catch(e){ /* 無くても致命的ではない */ }
  }
}

// 札所⇔バス停の事前計算済み徒歩ルートを取得する。無ければnull(呼び出し側でDirections APIにフォールバック)。
// reverse=trueの場合、バス停→札所の向きで使うため配列を反転して返す。
function cachedStopWalkRoute(templeNo, agencyKey, stopId, reverse){
  const coords = stopWalkRoutes.get(`${templeNo}:${agencyKey}:${stopId}`);
  if(!coords) return null;
  return reverse ? [...coords].reverse() : coords;
}

// Google Places写真のURL（帰属表示ルールに従い、寄稿者名も別途表示する）
function templePhotoUrl(no){
  const info = templePlacesInfo[no];
  if(!info || !info.photoName) return null;
  return `https://places.googleapis.com/v1/${info.photoName}/media?maxHeightPx=280&key={{GOOGLE_MAPS_API_KEY}}`;
}

// 区間の徒歩時間(分)を返す。実測値があればそれを、無ければ距離÷時速4kmで概算する。
function walkMinutesFor(temple){
  if(temple.isRealWalkData && temple.walkDurationMin != null) return temple.walkDurationMin;
  return temple.distanceKm / 4 * 60;
}

// 現在地から最も近い札所を検出し、出発する札所として自動設定する
// ==================================================================
// ---- 巡礼の進捗記録（端末内のみ。アカウント不要） ----
// ==================================================================
function getVisitedSet(){
  try{ return new Set(JSON.parse(localStorage.getItem('ohenro_visited') || '[]')); }
  catch(e){ return new Set(); }
}
function saveVisitedSet(set){
  localStorage.setItem('ohenro_visited', JSON.stringify([...set]));
}
function isVisited(no){
  return getVisitedSet().has(no);
}
// 訪問日の記録（訪問済みにした瞬間の日付。端末内のみ、アカウント不要）。
// キー: 札所番号 → "YYYY-MM-DD"
function getVisitedDates(){
  try{ return JSON.parse(localStorage.getItem('ohenro_visited_dates') || '{}'); }
  catch(e){ return {}; }
}
function saveVisitedDates(obj){
  localStorage.setItem('ohenro_visited_dates', JSON.stringify(obj));
}
function getVisitedDate(no){
  return getVisitedDates()[no] || null;
}
function todayDateStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// ==================================================================
// ---- 88札所の御本尊（出典: 四国遍路情報サイト「四国遍路」の札所一覧。
//      Wikipedia「四国八十八箇所」記載の本尊内訳統計と突き合わせて件数が
//      完全一致することを確認済み） ----
// ==================================================================
function honzonDisplay(no){
  const ja = TEMPLE_HONZON[no];
  if(!ja) return '';
  return ROMANIZED_LANGS.includes(currentLang) ? (HONZON_EN[ja] || ja) : ja;
}

// 公式サイト(四国八十八ヶ所霊場会)の札所紹介ページURL。
// URL規則: https://88shikokuhenro.jp/{番号}{ローマ字名(小文字)}/
// 著作権配慮のため本文を複製せず、公式ページへのリンクとして案内する。
function officialTempleUrl(no){
  const romaji = TEMPLE_NAMES_EN[no];
  if(!romaji) return null;
  return `https://88shikokuhenro.jp/${no}${romaji.toLowerCase()}/`;
}

function toggleVisited(no, btnEl){
  const set = getVisitedSet();
  const dates = getVisitedDates();
  if(set.has(no)){
    set.delete(no);
    delete dates[no]; // 解除した場合は記録も消す
  }else{
    set.add(no);
    dates[no] = todayDateStr(); // 訪問済みにした瞬間の日付を記録
  }
  saveVisitedSet(set);
  saveVisitedDates(dates);
  if(btnEl){
    const visited = set.has(no);
    btnEl.textContent = visited ? '★' : '☆';
    btnEl.title = visited ? t('visited_unmark') : t('visited_mark');
  }
  updateProgressLabel();
}
function updateProgressLabel(){
  const el = document.getElementById('progressLabel');
  if(!el || !temples.length) return;
  const set = getVisitedSet();
  el.textContent = t('progress_label', set.size, temples.length);
}

// Androidの物理戻るボタン用ブリッジ（MainActivity.ktのOnBackPressedDispatcherから
// evaluateJavascriptで呼ばれる想定）。御朱印詳細・地図のモーダルが開いていれば
// 閉じてtrueを返す。何も開いていなければfalseを返し、Android側は通常の終了動作へ
// フォールバックする（仕様書 docs/CSS_AND_SERVER_PROTECTION_SPEC.md 25節）。
window.closeAnyOpenOverlay = function(){
  const goshuinOverlay = document.getElementById('goshuinOverlay');
  if(goshuinOverlay && goshuinOverlay.classList.contains('open')){
    closeGoshuin();
    return true;
  }
  const mapOverlay = document.getElementById('mapOverlay');
  if(mapOverlay && mapOverlay.classList.contains('open')){
    closeMap();
    return true;
  }
  return false;
};
