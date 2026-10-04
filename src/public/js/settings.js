// index.htmlから切り出した設定タブ（言語切替・位置情報のトグル）・カスタム日付選択。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

// ==================================================================
// ---- 設定タブ（言語切替・位置情報のトグル）----
// ==================================================================
async function getLocationPermissionState(){
  let nativeGranted = false;
  try{
    nativeGranted = !!(window.AndroidBridge && typeof window.AndroidBridge.hasLocationPermission === 'function' && window.AndroidBridge.hasLocationPermission());
  }catch(e){ console.warn('Android permission check failed', e); }
  if(nativeGranted) return 'granted';
  if(navigator.permissions?.query){
    try{ return (await navigator.permissions.query({name:'geolocation'})).state; }
    catch(e){ console.warn('Browser permission check failed', e); }
  }
  return 'unknown';
}
function isLocationUsageEnabled(){
  return localStorage.getItem('ohenro_location_enabled') !== '0';
}
async function refreshLocationStatus(){
  const statusEl = document.getElementById('settingsLocationStatus');
  const toggle = document.getElementById('locationToggle');
  if(!statusEl || !toggle) return;
  const state = await getLocationPermissionState();
  const appEnabled = isLocationUsageEnabled();
  const nativeRequestAvailable = window.AndroidBridge && typeof window.AndroidBridge.requestLocationPermission === 'function';
  toggle.disabled = !navigator.geolocation && !nativeRequestAvailable;
  toggle.checked = appEnabled && state === 'granted';
  statusEl.textContent = !appEnabled ? t('settings_location_app_off')
    : state === 'granted' ? t('settings_location_granted')
    : state === 'denied' ? t('settings_location_denied')
    : state === 'prompt' ? t('settings_location_prompt')
    : t('settings_location_unknown');
}
// トグルON: まだ許可されていなければ、ダミーの位置情報取得を1回行い、許可ダイアログを呼び出す。
// トグルOFF: JSからは権限を取り消せない仕様(Android/ブラウザ共通)のため、
//            端末の設定画面を開くよう案内し、トグル自体は実際の状態に戻す。
function onLocationToggleChange(el){
  const wantsOn = el.checked;
  if(wantsOn){
    localStorage.setItem('ohenro_location_enabled', '1');
    if(window.AndroidBridge && typeof window.AndroidBridge.requestLocationPermission === 'function'){
      window.AndroidBridge.requestLocationPermission();
      return;
    }
    if(!navigator.geolocation){
      showToast(t('zukan_locate_unsupported'));
      refreshLocationStatus();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ()=>{
        localStorage.setItem('ohenro_location_enabled', '1');
        refreshLocationStatus();
      },
      (err)=>{
        localStorage.setItem('ohenro_location_enabled', '0');
        refreshLocationStatus();
        handleLocationFailure(err, 'locate_failed');
      },
      { enableHighAccuracy:false, timeout:8000, maximumAge:0 }
    );
  }else{
    // OS権限は残したまま、このアプリからの位置情報利用だけを停止する。
    localStorage.setItem('ohenro_location_enabled', '0');
    refreshLocationStatus();
  }
}
window.__onNativeLocationPermissionResult = function(granted){
  localStorage.setItem('ohenro_location_enabled', granted ? '1' : '0');
  refreshLocationStatus();
};
function handleLocationFailure(err, messageKey){
  const denied = err && err.code === 1;
  const canOpenSettings = window.AndroidBridge && typeof window.AndroidBridge.openAppSettings === 'function';
  if(denied && canOpenSettings){
    if(confirm(t(messageKey) + '\n\n' + t('location_open_settings_confirm'))){
      window.AndroidBridge.openAppSettings();
    }
    return;
  }
  showToast(t(messageKey));
}
function settingsOpenAppSettings(){
  if(window.AndroidBridge && typeof window.AndroidBridge.openAppSettings === 'function'){
    window.AndroidBridge.openAppSettings();
  }else{
    showToast(t('zukan_locate_unsupported'));
  }
}


function renderZukan(){
  const grid = document.getElementById('zukanGrid');
  if(!grid || !temples.length) return;
  const set = getVisitedSet();

  const progressPct = temples.length ? Math.round((set.size / temples.length) * 100) : 0;
  const progressHeading = t('zukan_progress_heading');
  const visitedLabel = t('zukan_visited_count', set.size);
  const unvisitedLabel = t('zukan_unvisited_count', temples.length-set.size);
  document.getElementById('zukanProgress').innerHTML = `
    <div class="zukan-progress-top">
      <div class="zukan-progress-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A3.5 3.5 0 0 1 7.5 1H12v20H7.5A3.5 3.5 0 0 0 4 24zM20 4.5A3.5 3.5 0 0 0 16.5 1H12v20h4.5A3.5 3.5 0 0 1 20 24z"/></svg>${progressHeading}</div>
      <div class="zukan-progress-count">${set.size}<small> / ${temples.length}</small></div>
    </div>
    <div class="zukan-progress-track"><div class="zukan-progress-fill" style="width:${progressPct}%"></div></div>
    <div class="zukan-progress-detail"><span>${visitedLabel}</span><span>${unvisitedLabel}</span></div>
    <div class="goshuin-guide"><span class="goshuin-guide-icon">i</span><span>${t('goshuin_guide')}</span></div>`;

  const sorted = [...temples].sort((a,b)=>a.no-b.no);
  grid.innerHTML = sorted.map(temple=>{
    const visited = set.has(temple.no);
    const displayName = templeDisplayName(temple);
    const no = String(temple.no).padStart(2,'0');
    const savedVisitDate = visited ? getVisitedDate(temple.no) : '';
    const visitDate = savedVisitDate ? formatVisitDate(savedVisitDate) : '';
    const warekiVisitDate = savedVisitDate ? getWarekiDate(savedVisitDate) : '';
    const hiddenHtml = `<div class="zukan-hidden-goshuin"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>${t('zukan_unvisited_badge')}</span></div>`;
    const dateOverlayClass =
      `zukan-card-date-overlay goshuin-date-${no} ${warekiDateLengthClass(warekiVisitDate)}`.trim();
    const photoHtml = visited
      ? `<div class="zukan-goshuin-area"><div class="zukan-goshuin-sheet"><img class="zukan-photo" src="/goshuin/${no}.webp" alt="${displayName}" loading="lazy" onerror="this.parentElement.style.display='none';this.parentElement.nextElementSibling.style.display='flex'">${warekiVisitDate ? `<div class="${dateOverlayClass}">${warekiVisitDate}</div>` : ''}</div><div class="zukan-hidden-goshuin" style="display:none"><span>${t('goshuin_no_image')}</span></div></div>`
      : hiddenHtml;
    return `<div class="zukan-card ${visited?'visited':'unvisited'}" onclick="zukanCardTap(event, ${temple.no})">
      ${photoHtml}
      <div class="zukan-info">
        <div class="zukan-name-row"><div class="zukan-no">${no}</div><div class="zukan-name">${displayName}</div>${visitDate ? `<div class="zukan-card-date">${visitDate}</div>` : ''}</div>
      </div>
    </div>`;
  }).join('');
}
const ZUKAN_VISIT_MIN_RADIUS_M = 100;
const ZUKAN_VISIT_MAX_RADIUS_M = 200;

// サーバー側の環境変数 DISABLE_GOSHUIN_LOCATION_CHECK から埋め込まれた設定を読む。
// window.OHENRO_CONFIG が無い(index.htmlを経由していない等)場合も安全側(false=位置判定有効)。
const DISABLE_GOSHUIN_LOCATION_CHECK = window.OHENRO_CONFIG?.disableGoshuinLocationCheck === true;

function checkTempleProximity(no, button, onSuccess){
  if (DISABLE_GOSHUIN_LOCATION_CHECK) {
    onSuccess(null, 0);
    return;
  }

//御朱印取得を現在地から取得
// function checkTempleProximity(no, button, onSuccess){
//   if(!isLocationUsageEnabled()){
//     showToast(t('location_app_disabled'));
//     return;
//   }
  if(!navigator.geolocation){
    showToast(t('zukan_locate_unsupported'));
    return;
  }
  const temple = temples.find(item=>item.no===no);
  if(!temple || !Number.isFinite(Number(temple.lat)) || !Number.isFinite(Number(temple.lng))){
    showToast(t('zukan_locate_failed'));
    return;
  }

  const originalLabel = button ? button.textContent : '';
  if(button){
    button.textContent = t('zukan_checking_location');
    button.disabled = true;
    button.title = t('zukan_checking_location');
  }
  const restoreButton = ()=>{
    if(!button) return;
    button.textContent = originalLabel;
    button.disabled = false;
    button.title = t('visited_mark');
  };

  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const accuracy = Number(pos.coords.accuracy);
      const distanceMeters = metersBetween(
        pos.coords.latitude,
        pos.coords.longitude,
        Number(temple.lat),
        Number(temple.lng)
      );
      const proximity = evaluateVisitProximity({
        accuracy,
        distanceMeters,
        minRadiusM: ZUKAN_VISIT_MIN_RADIUS_M,
        maxRadiusM: ZUKAN_VISIT_MAX_RADIUS_M,
      });
      const distance = Math.round(distanceMeters);
      if(proximity.reason === 'invalid_accuracy'){
        restoreButton();
        showToast(t('zukan_locate_failed'));
        return;
      }
      if(proximity.ok){
        onSuccess(pos, distance);
      }else{
        restoreButton();
        showToast(t('zukan_too_far', formatDistance(distance)));
      }
    },
    (err)=>{
      console.warn('現在地の取得に失敗しました', err);
      restoreButton();
      showToast(t('zukan_locate_failed'));
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
  );
}

function zukanToggleVisited(evt, no){
  evt.stopPropagation(); // カード全体のタップ(詳細ページを開く)と競合しないようにする
  const alreadyVisited = getVisitedSet().has(no);

  // 訪問済みを解除するだけの場合は、間違いの訂正なので現在地確認は不要
  if(alreadyVisited){
    toggleVisited(no, null);
    renderZukan();
    return;
  }

  const starBtn = evt.currentTarget;
  checkTempleProximity(no, starBtn, ()=>{
    toggleVisited(no, null);
    renderZukan();
  });
}
function zukanCardTap(evt, no){
  // 訪問済みかどうかに関わらず、御朱印モーダルを開く
  // (未訪問の場合は「まだ参拝されていません」メッセージを表示)
  openGoshuin(no);
}

function setStartFromLocation(){
  if(!isLocationUsageEnabled()){
    showToast(t('location_app_disabled'));
    return;
  }
  if(!navigator.geolocation){
    showToast(t('locate_unsupported'));
    return;
  }
  const btn = document.querySelector('.locate-btn');
  const originalText = btn.textContent;
  btn.textContent = t('locate_searching');
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const { latitude, longitude } = pos.coords;
      let nearest = null, minDist = Infinity;
      temples.forEach(temple=>{
        const d = metersBetween(latitude, longitude, temple.lat, temple.lng);
        if(d < minDist){ minDist = d; nearest = temple; }
      });
      btn.textContent = originalText;
      btn.disabled = false;
      if(nearest){
        if(minDist > MAX_AUTO_START_DISTANCE_M){
          showToast(t('locate_outside_area', Math.round(minDist / 1000)));
          return;
        }
        startSel.value = nearest.no;
        runPlanner();
      }
    },
    (err)=>{
      console.warn('現在地の取得に失敗しました', err);
      btn.textContent = originalText;
      btn.disabled = false;
      handleLocationFailure(err, 'locate_failed');
    },
    { enableHighAccuracy:true, timeout:8000, maximumAge:30000 }
  );
}

function populateTempleSelects(){
  // 初回起動時は出発・到着とも未選択にする(前回の検索があれば起動処理で復元する)
  const placeholder = `<option value="">${escapeHtml(t('select_temple_placeholder'))}</option>`;
  startSel.insertAdjacentHTML('beforeend', placeholder);
  endSel.insertAdjacentHTML('beforeend', placeholder);
  temples.forEach(t=>{
    const label = `${templeNoPrefix(t.no, currentLang)}${templeDisplayName(t)}`;
    startSel.insertAdjacentHTML('beforeend', `<option value="${t.no}">${label}</option>`);
    endSel.insertAdjacentHTML('beforeend', `<option value="${t.no}">${label}</option>`);
  });
  startSel.value = '';
  endSel.value = '';
}

// ---- 前回のルート検索(条件と結果)を端末内に保存し、アプリを開き直した時に復元する ----
const LAST_SEARCH_KEY = 'ohenro_last_search';
function saveLastSearch(search){
  try{ localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(search)); }
  catch(e){ console.warn('前回の検索の保存に失敗しました', e); }
}
function loadLastSearch(){
  try{
    const s = JSON.parse(localStorage.getItem(LAST_SEARCH_KEY) || 'null');
    if(!s || !s.from || !s.to) return null;
    return s;
  }catch(e){ return null; }
}

let mode = 'efficient';
document.getElementById('modeEfficient').onclick = ()=>{ mode='efficient'; setModeBtn(); };
document.getElementById('modeWalk').onclick = ()=>{ mode='walk'; setModeBtn(); };
function setModeBtn(){
  document.getElementById('modeEfficient').classList.toggle('active', mode==='efficient');
  document.getElementById('modeWalk').classList.toggle('active', mode==='walk');
}

function todayDateStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ==================================================================
// ---- カスタム日付選択（年・月・日をそれぞれ選ぶ形式） ----
// ブラウザ標準の<input type="date">は、カレンダーの表示言語がOS/ブラウザの
// システム言語に依存してしまい、アプリ内で選んだ言語と一致させられないため、
// 独自実装に置き換えている。月名の翻訳はIntl.DateTimeFormatを使い、
// ブラウザ内蔵のロケールデータから正確な表記を取得する。
// ==================================================================

function daysInMonth(year, month){ return new Date(year, month, 0).getDate(); } // month:1-12

// 「2日」「2nd」「2.」のような、言語ごとの日付の言い回しに合わせたラベルを返す
function ordinalEn(n){
  const suffixes = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (suffixes[(v-20)%10] || suffixes[v] || suffixes[0]);
}
function dayLabel(day){
  switch(currentLang){
    case 'ja': return `${day}日`;
    case 'ko': return `${day}일`;
    case 'zh-CN': case 'zh-TW': return `${day}日`;
    case 'de': return `${day}.`;
    case 'en': return ordinalEn(day);
    default: return String(day); // pt等: 数字そのまま
  }
}
function yearLabel(year){
  switch(currentLang){
    case 'ja': return `${year}年`;
    case 'ko': return `${year}년`;
    case 'zh-CN': case 'zh-TW': return `${year}年`;
    default: return String(year); // en/de/pt: 数字そのまま
  }
}
// 中国語(簡体字/繁体字)は「八月」のような漢数字表記でなく「8月」の数字表記にする。
// 日本語・韓国語はIntlの'long'指定でも数字表記(8月/8월)になるためそのままIntlを使う。
function monthLabel(m, locale){
  if(currentLang === 'zh-CN' || currentLang === 'zh-TW') return `${m}月`;
  return new Intl.DateTimeFormat(locale, { month:'long' }).format(new Date(2000, m-1, 1));
}

// 端末のタイムゾーン設定（インバウンド利用者は母国のタイムゾーンのままのことが多い）に
// 関わらず、常に日本時間(JST, UTC+9)を基準にするための関数。
function getJSTNow(){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find(p => p.type === type).value);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour') % 24, minute: get('minute'), // 'hour'が"24"を返す実装対策でmod
  };
}

function buildDateFields(presetDate){
  const container = document.getElementById('dateFields');
  if(!container) return;
  const jstNow = getJSTNow();
  const preset = presetDate || new Date(jstNow.year, jstNow.month-1, jstNow.day);
  const order = DATE_FIELD_ORDER[currentLang] || DATE_FIELD_ORDER.ja;
  const locale = INTL_LOCALES[currentLang] || 'ja';

  const yearSel = document.createElement('select');
  yearSel.className = 'df-year';
  const thisYear = jstNow.year;
  for(let y=thisYear; y<=thisYear+1; y++){
    yearSel.insertAdjacentHTML('beforeend', `<option value="${y}">${yearLabel(y)}</option>`);
  }

  const monthSel = document.createElement('select');
  monthSel.className = 'df-month';
  for(let m=1; m<=12; m++){
    monthSel.insertAdjacentHTML('beforeend', `<option value="${m}">${monthLabel(m, locale)}</option>`);
  }

  const daySel = document.createElement('select');
  daySel.className = 'df-day';
  function rebuildDayOptions(){
    const y = Number(yearSel.value), m = Number(monthSel.value);
    const maxDay = daysInMonth(y, m);
    const prevSelected = Number(daySel.value) || preset.getDate();
    daySel.innerHTML = '';
    for(let d=1; d<=maxDay; d++){
      daySel.insertAdjacentHTML('beforeend', `<option value="${d}">${dayLabel(d)}</option>`);
    }
    daySel.value = Math.min(prevSelected, maxDay);
  }

  yearSel.value = preset.getFullYear();
  monthSel.value = preset.getMonth()+1;
  rebuildDayOptions();
  daySel.value = preset.getDate();

  yearSel.onchange = rebuildDayOptions;
  monthSel.onchange = rebuildDayOptions;

  container.innerHTML = '';
  const fields = { year: yearSel, month: monthSel, day: daySel };
  order.forEach(key => container.appendChild(fields[key]));
}

function getSelectedDateObj(){
  const y = Number(document.querySelector('#dateFields .df-year')?.value);
  const m = Number(document.querySelector('#dateFields .df-month')?.value);
  const d = Number(document.querySelector('#dateFields .df-day')?.value);
  if(!y || !m || !d) return new Date();
  return new Date(y, m-1, d);
}
function getSelectedDateStr(){
  const dt = getSelectedDateObj();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// 時刻選択（24時間制の数字表記に統一。数字なので翻訳・AM/PM表記の言語差を気にしなくてよい）
function buildTimeFields(presetHHMM){
  const container = document.getElementById('timeFields');
  if(!container) return;
  const jstNow = getJSTNow();
  const currentHHMM = `${String(jstNow.hour).padStart(2,'0')}:${String(jstNow.minute).padStart(2,'0')}`;
  const [presetH, presetM] = (presetHHMM || currentHHMM).split(':').map(Number);

  const hourSel = document.createElement('select');
  hourSel.className = 'tf-hour';
  for(let h=0; h<24; h++){
    hourSel.insertAdjacentHTML('beforeend', `<option value="${h}">${String(h).padStart(2,'0')}</option>`);
  }
  hourSel.value = presetH;

  const minuteSel = document.createElement('select');
  minuteSel.className = 'tf-minute';
  for(let m=0; m<60; m++){
    minuteSel.insertAdjacentHTML('beforeend', `<option value="${m}">${String(m).padStart(2,'0')}</option>`);
  }
  minuteSel.value = presetM;

  container.innerHTML = '';
  container.appendChild(hourSel);
  container.insertAdjacentHTML('beforeend', '<span class="tf-colon">:</span>');
  container.appendChild(minuteSel);
}
function getSelectedTimeStr(){
  const h = document.querySelector('#timeFields .tf-hour')?.value ?? '7';
  const m = document.querySelector('#timeFields .tf-minute')?.value ?? '30';
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

async function fetchNextBus(fromNo, toNo, timeStr, dateStr){
  try{
    const url = `${API_BASE}/next-bus?from=${fromNo}&to=${toNo}&time=${encodeURIComponent(timeStr)}&date=${dateStr}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`API responded ${res.status}`);
    const data = await res.json();
    return data.result;
  }catch(e){
    console.warn('next-bus API fetch failed', e);
    return undefined;
  }
}

// 時刻表データの最終運行日("YYYYMMDD")を、注意文に出す「年月」の表記にする
function staleAsOfLabel(yyyymmdd){
  const y = yyyymmdd.slice(0,4), m = yyyymmdd.slice(4,6);
  return (currentLang === 'ja' || currentLang === 'zh-CN' || currentLang === 'zh-TW') ? `${y}年${Number(m)}月` : `${y}-${m}`;
}

function agencyDisplayName(key){
  const entry = AGENCY_NAMES[key];
  if(!entry) return key;
  return entry[currentLang] || entry.en || entry.ja;
}

// GTFSの時刻文字列("07:57:00")から秒を除いて表示用に整形する
function hhmm(timeStr){
  return timeStr ? formatGtfsTime(timeStr) : timeStr;
}

// ==================================================================
// ---- 購入者特典（有料版購入者/Pro権利） ----
// ログイン機能が無いアプリのため、サーバーが発行するrecovery_code(引継ぎコード)を
// localStorageに保持し、機種変更・再インストール後はユーザー自身がコードを入力して
// 復元する(docs/PAID_LAUNCH_AND_GOSHUIN_LIST_SPEC.md 3章)。
// 購入トークン等の機密情報は一切クライアントへ渡さない・保存しない。
// ==================================================================
const ENTITLEMENT_CODE_KEY = 'ohenro_entitlement_code';
const ENTITLEMENT_CACHE_KEY = 'ohenro_entitlement_cache';

function getStoredEntitlementCode(){
  return localStorage.getItem(ENTITLEMENT_CODE_KEY);
}
function getEntitlementCache(){
  try{
    const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function setEntitlementCache(entitlementType, status, lastVerifiedAt){
  localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify({ entitlementType, status, lastVerifiedAt }));
}

// spec 3.4のhasProEntitlement判定。オフライン時は直近の検証済みキャッシュをそのまま使う
// (一時的な通信失敗だけでProを解除しない)。
function hasProEntitlement(){
  const cache = getEntitlementCache();
  return !!(cache && cache.status === 'active');
}

function renderEntitlementUI(){
  const activeCard = document.getElementById('entitlementActive');
  const restoreForm = document.getElementById('entitlementRestoreForm');
  const statusLabel = document.getElementById('entitlementStatusLabel');
  const codeDisplay = document.getElementById('entitlementCodeDisplay');
  if(!activeCard || !restoreForm || !statusLabel || !codeDisplay) return;

  const code = getStoredEntitlementCode();
  const cache = getEntitlementCache();
  const active = code && cache && cache.status === 'active';

  activeCard.style.display = active ? '' : 'none';
  restoreForm.style.display = active ? 'none' : '';
  if(active){
    statusLabel.textContent = cache.entitlementType === 'legacy_paid'
      ? t('settings_entitlement_legacy_active')
      : t('settings_entitlement_pro_active');
    codeDisplay.textContent = code;
  }
}

// サーバーから最新の権利状態を取得してキャッシュを更新する。コード未保存時は何もしない。
// ネットワーク失敗時は既存のキャッシュを保持したまま(=直近の検証済み状態のまま)にする。
async function refreshEntitlementStatus(){
  renderEntitlementUI();
  const code = getStoredEntitlementCode();
  if(!code) return;
  try{
    const res = await fetch(`${API_BASE}/entitlement/status?code=${encodeURIComponent(code)}`);
    if(!res.ok) return;
    const data = await res.json();
    if(data.found){
      setEntitlementCache(data.entitlementType, data.status, data.lastVerifiedAt);
    }
    renderEntitlementUI();
  }catch(e){
    console.warn('entitlement status refresh failed', e);
  }
}

async function restoreEntitlementByCode(){
  const input = document.getElementById('entitlementCodeInput');
  const btn = document.querySelector('.settings-entitlement-restore-btn');
  if(!input) return;
  const code = input.value.trim().toUpperCase();
  if(!code){
    showToast(t('settings_entitlement_restore_failed'));
    return;
  }

  const originalLabel = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = t('settings_entitlement_restore_btn'); }

  try{
    const res = await fetch(`${API_BASE}/entitlement/status?code=${encodeURIComponent(code)}`);
    const data = res.ok ? await res.json() : { found:false };
    if(data.found && data.hasProEntitlement){
      localStorage.setItem(ENTITLEMENT_CODE_KEY, code);
      setEntitlementCache(data.entitlementType, data.status, data.lastVerifiedAt);
      input.value = '';
      renderEntitlementUI();
      showToast(t('settings_entitlement_restore_success'));
    }else{
      showToast(t('settings_entitlement_restore_failed'));
    }
  }catch(e){
    console.warn('entitlement restore failed', e);
    showToast(t('settings_entitlement_restore_failed'));
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
  }
}

// ==================================================================
// ---- 任意の応援（Google Play課金。Androidアプリ内のみ） ----
// 機能の開放には一切使わない、純粋な任意の支援。決済はGoogle Playの課金システムで行い
// (Play Paymentsポリシー)、商品の一覧(id・価格・名称)と購入結果は、Androidアプリ側
// (AndroidBridge / window.__onSupport*)から受け取る。ブラウザ等でAndroidBridgeが無い場合や、
// 商品を取得できない場合は、セクションごと表示しない。購入トークン等は扱わない。
// ==================================================================
function isSupportAvailable(){
  return !!(window.AndroidBridge
    && typeof window.AndroidBridge.requestSupportProducts === 'function'
    && typeof window.AndroidBridge.purchaseSupport === 'function');
}
function initSupportSection(){
  if(!isSupportAvailable()) return;
  try{ window.AndroidBridge.requestSupportProducts(); }
  catch(e){ console.warn('応援商品の取得に失敗しました', e); }
}
function setSupportButtonsDisabled(disabled){
  document.querySelectorAll('#supportButtons .support-btn').forEach(b=>{ b.disabled = disabled; });
}
function renderSupportProducts(list){
  const section = document.getElementById('supportSection');
  const box = document.getElementById('supportButtons');
  if(!section || !box) return;
  box.textContent = '';
  const items = (Array.isArray(list) ? list : []).filter(p => p && typeof p.id === 'string' && p.id && typeof p.price === 'string' && p.price);
  if(!items.length){ section.hidden = true; return; }
  items.forEach(p=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'support-btn';
    btn.dataset.productId = p.id;
    const price = document.createElement('span');
    price.className = 'support-price';
    price.textContent = p.price;
    btn.appendChild(price);
    // 名称は、アプリ内で選んだ表示言語のものを優先する。Playが返す名称(p.title)は端末の言語に従うため、
    // アプリ内で言語を切り替えても変わらない。対応表に無い商品だけPlayの名称を使う。
    const itemName = t(`support_item_${p.id}`) || (typeof p.title === 'string' ? p.title : '');
    if(itemName){
      const label = document.createElement('span');
      label.className = 'support-label';
      label.textContent = itemName;
      btn.appendChild(label);
    }
    btn.addEventListener('click', ()=> purchaseSupport(p.id));
    box.appendChild(btn);
  });
  section.hidden = false;
}
let supportPurchaseBusy = false;
function purchaseSupport(productId){
  if(!isSupportAvailable() || supportPurchaseBusy) return;
  supportPurchaseBusy = true;
  setSupportButtonsDisabled(true);
  try{ window.AndroidBridge.purchaseSupport(productId); }
  catch(e){
    console.warn('応援の購入を開始できませんでした', e);
    supportPurchaseBusy = false;
    setSupportButtonsDisabled(false);
    showToast(t('support_error'));
  }
}
// Android側から呼ばれる。jsonは [{id, price, title}] のJSON文字列。
window.__onSupportProducts = function(json){
  let list = [];
  try{ list = typeof json === 'string' ? JSON.parse(json) : json; }
  catch(e){ console.warn('応援商品の一覧を解釈できませんでした', e); }
  renderSupportProducts(list);
};
// Android側から呼ばれる。status: success | pending | canceled | error
window.__onSupportPurchaseResult = function(productId, status){
  supportPurchaseBusy = false;
  setSupportButtonsDisabled(false);
  if(status === 'success') showToast(t('support_thanks'));
  else if(status === 'pending') showToast(t('support_pending'));
  else if(status === 'error') showToast(t('support_error'));
  // canceled: 利用者が自分でやめた操作なので、何も表示しない
};
