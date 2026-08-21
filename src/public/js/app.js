// index.htmlから切り出した起動処理（札所データ取得→セレクト構築→初回描画）。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

// ---- 起動処理: 札所データを取得 → セレクト構築 → 初回計算 ----
(async function init(){
  applyStaticTranslations();
  applyReferenceVisuals();
  document.getElementById('timeline').innerHTML = `<div class="segment-note">${t('loading_temples')}</div>`;
  try{
    await loadTemples();
  }catch(e){
    document.getElementById('timeline').innerHTML =
      `<div class="segment-note">${t('err_temples')}</div>`;
    return;
  }
  populateTempleSelects();
  updateProgressLabel();
  // 言語切り替え時のページ再読み込みで、選択中だった出発・到着札所・日付・時刻をURLパラメータから復元
  const params = new URLSearchParams(location.search);
  const restoredFrom = params.get('from');
  const restoredTo = params.get('to');
  const restoredDate = params.get('date');
  const restoredTime = params.get('time');
  if(restoredFrom && temples.some(t=>String(t.no)===restoredFrom)) startSel.value = restoredFrom;
  if(restoredTo && temples.some(t=>String(t.no)===restoredTo)) endSel.value = restoredTo;
  if(restoredDate){
    const [ry,rm,rd] = restoredDate.split('-').map(Number);
    if(ry && rm && rd) buildDateFields(new Date(ry, rm-1, rd));
  }
  buildTimeFields(restoredTime);

  // 詳細ページから戻った場合など、直前と同じ条件のキャッシュ結果があれば
  // 再計算せずにそのまま復元する（APIへの再問い合わせを避けるため）。
  let restoredFromCache = false;
  try{
    const cached = JSON.parse(sessionStorage.getItem('ohenro_last_result') || 'null');
    if(cached
      && String(cached.from) === (restoredFrom ?? String(startSel.value))
      && String(cached.to) === (restoredTo ?? String(endSel.value))
      && cached.date === getSelectedDateStr()
      && cached.time === getSelectedTimeStr()
      && cached.lang === currentLang
    ){
      renderResult(cached.arrival, cached.date);
      restoredFromCache = true;

      // 見どころページから戻った場合、直前に保存したスクロール位置(押した札所)へ復元する
      // (仕様書4.4)。ルート条件が変わっていた場合は誤って復元しない。
      try{
        const savedScroll = JSON.parse(sessionStorage.getItem('ohenro_return_scroll') || 'null');
        if(savedScroll){
          const routeKey = buildRouteKey(cached.from, cached.to, cached.date, cached.time, cached.lang);
          if(savedScroll.routeKey === routeKey){
            const target = document.getElementById(`route-stop-${savedScroll.templeNo}`);
            if(target){
              target.scrollIntoView({ block: 'center' });
            } else if(typeof savedScroll.scrollY === 'number'){
              window.scrollTo(0, savedScroll.scrollY);
            }
          }
        }
      }catch(e){ console.warn('スクロール位置の復元に失敗しました', e); }
      sessionStorage.removeItem('ohenro_return_scroll');
    }
  }catch(e){ console.warn('キャッシュ結果の復元に失敗しました', e); }

  if(!restoredFromCache){
    // 開いた瞬間に自動でルート計算はせず、ボタンを押した時だけ計算する
    document.getElementById('timeline').innerHTML = `<div class="segment-note">${t('prompt_press_button')}</div>`;
  }
})();

