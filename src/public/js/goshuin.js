// index.htmlから切り出した巡礼図鑑（御朱印スタンプ×コレクション帳UI）・下部タブバー・デジタル御朱印モーダル。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。


// ==================================================================
// ---- 巡礼図鑑（御朱印風スタンプ×コレクション帳UI）----
// 見た目の演出だけをゲーム化する。由来・見どころ自体はいつでも
// 誰でも読めるようにし(/temple/:no は訪問状況を問わず常に開放)、
// 「未訪問はグレーアウト・訪問済みはスタンプ付きカラー」という
// 一覧の見え方だけで達成感を演出する。
// ==================================================================
// ==================================================================
// ---- 設定画面（位置情報の許可状態の確認・変更）----
// ==================================================================
// ==================================================================
// ---- 下部タブバー（HOME / 図鑑 / 設定の切り替え）----
// ==================================================================
function switchTab(tab){
  const hero = document.querySelector('body > .hero');
  if(hero) hero.style.display = tab==='home' ? '' : 'none';
  document.getElementById('viewHome').style.display = tab==='home' ? '' : 'none';
  document.getElementById('viewZukan').style.display = tab==='zukan' ? '' : 'none';
  document.getElementById('viewSettings').style.display = tab==='settings' ? '' : 'none';
  document.getElementById('tabHomeBtn').classList.toggle('active', tab==='home');
  document.getElementById('tabZukanBtn').classList.toggle('active', tab==='zukan');
  document.getElementById('tabSettingsBtn').classList.toggle('active', tab==='settings');
  if(tab==='zukan') renderZukan();
  if(tab==='settings') refreshLocationStatus();
  window.scrollTo(0,0);
}
function applyReferenceVisuals(){
  const icons = {
    tabHomeBtn:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/></svg>',
    tabZukanBtn:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></svg>',
    tabSettingsBtn:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
  };
  Object.entries(icons).forEach(([id,svg])=>{
    const icon = document.querySelector(`#${id} .tab-icon`);
    if(icon) icon.innerHTML = svg;
  });
  decorateSettingsCards();
}
function decorateSettingsCards(){
  const body = document.querySelector('#viewSettings .settings-body');
  if(!body || body.dataset.decorated === 'true') return;
  body.dataset.decorated = 'true';
  const titles = [...body.querySelectorAll('.settings-section-title')];
  const languageTitle = titles[0];
  const locationTitle = titles[1];
  const themeTitle = titles[2];
  const languageSelect = document.getElementById('langSelect');
  const themeSelect = document.getElementById('themeSelect');
  const locationDesc = body.querySelector('.settings-section-desc');
  const locationRow = body.querySelector('.settings-toggle-row');
  const locationStatus = document.getElementById('settingsLocationStatus');

  if(languageTitle && languageSelect){
    const card = document.createElement('div');
    card.className = 'settings-reference-card';
    card.innerHTML = '<div class="settings-reference-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg></div><div class="settings-reference-content"></div><div class="settings-reference-chevron">›</div>';
    languageTitle.parentNode.insertBefore(card,languageTitle);
    const content = card.querySelector('.settings-reference-content');
    content.append(languageTitle,languageSelect);
  }
  if(locationTitle && locationRow){
    const card = document.createElement('div');
    card.className = 'settings-reference-card';
    card.innerHTML = '<div class="settings-reference-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg></div><div class="settings-reference-content"></div>';
    locationTitle.parentNode.insertBefore(card,locationTitle);
    const content = card.querySelector('.settings-reference-content');
    content.append(locationTitle);
    if(locationDesc) content.append(locationDesc);
    if(locationStatus) content.append(locationStatus);
    card.append(locationRow);
  }
  if(themeTitle && themeSelect){
    const card = document.createElement('div');
    card.className = 'settings-reference-card settings-theme-card';
    card.innerHTML = '<div class="settings-reference-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A9 9 0 0 1 8.5 3.5 9 9 0 1 0 20.5 15.5z"/></svg></div><div class="settings-reference-content"></div><div class="settings-reference-chevron">›</div>';
    themeTitle.parentNode.insertBefore(card,themeTitle);
    card.querySelector('.settings-reference-content').append(themeTitle,themeSelect);
  }
}

// ==================================================================
// ---- デジタル御朱印モーダル ----
// 御朱印画像はサーバー側 /goshuin/{no}.png として管理。
// 訪問日は localStorage から取得し、画像上のCSS座標に合漢数字で重ねる。
// 画像のオリジナルサイズ(1024×1536)をベースに座標を定義し、
// 表示サイズ(320×480)へは CSS scale() で一括変換する。
// ==================================================================
let activeZukanTempleNo = null;
function formatVisitDate(dateStr){
  if(!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if(Number.isNaN(date.getTime())) return dateStr;
  try{
    return new Intl.DateTimeFormat(currentLang, {
      year:'numeric', month:'numeric', day:'numeric'
    }).format(date);
  }catch(e){
    return dateStr;
  }
}
function openGoshuin(no){
  activeZukanTempleNo = no;
  const temple = temples.find(item=>item.no===no);
  const visited = getVisitedSet().has(no);
  const dateStr   = getVisitedDate(no);
  const overlay   = document.getElementById('goshuinOverlay');
  const frame     = document.getElementById('goshuinFrame');
  const img       = document.getElementById('goshuinImg');
  const placeholder = document.getElementById('goshuinPlaceholder');
  const visitedEl = document.getElementById('goshuinVisitedOn');
  const nameEl = document.getElementById('goshuinTempleName');
  const visitBtn = document.getElementById('goshuinVisitBtn');
  const dateOverlay = document.getElementById('goshuinDateOverlay');

  if(nameEl) nameEl.textContent = temple ? `${String(no).padStart(2,'0')} ${templeDisplayName(temple)}` : t('goshuin_title');
  visitBtn.textContent = visited ? t('zukan_visited_badge') : t('visited_mark');
  visitBtn.classList.toggle('is-visited', visited);
  visitBtn.disabled = visited;
  dateOverlay.textContent = getWarekiDate(dateStr);
  dateOverlay.className = `goshuin-date-overlay goshuin-date-${String(no).padStart(2,'0')}`;
  dateOverlay.style.display = visited && dateStr ? '' : 'none';

  const imgPath = `/goshuin/${String(no).padStart(2,'0')}.png`;
  if(visited) img.src = imgPath;
  else img.removeAttribute('src');
  img.onerror = ()=>{
    frame.style.display = 'none';
    dateOverlay.style.display = 'none';
    placeholder.textContent = t('goshuin_no_image');
    placeholder.classList.add('show');
  };
  img.onload = ()=>{
    frame.style.display = 'block';
    dateOverlay.style.display = dateStr ? '' : 'none';
    placeholder.classList.remove('show');
  };

  if(!visited){
    frame.style.display = 'none';
    dateOverlay.style.display = 'none';
    placeholder.textContent = t('goshuin_not_visited');
    placeholder.classList.add('show');
  }
  visitedEl.textContent = dateStr ? t('goshuin_visited_on', formatVisitDate(dateStr)) : t('goshuin_not_visited');
  overlay.classList.add('open');
}
function toggleVisitedFromDetail(){
  if(activeZukanTempleNo == null) return;
  if(getVisitedSet().has(activeZukanTempleNo)) return;
  const no = activeZukanTempleNo;
  const visitBtn = document.getElementById('goshuinVisitBtn');
  checkTempleProximity(no, visitBtn, ()=>{
    toggleVisited(no, null);
    renderZukan();
    openGoshuin(no);
  });
}
function closeGoshuin(){
  document.getElementById('goshuinOverlay').classList.remove('open');
}

