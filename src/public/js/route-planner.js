// index.htmlから切り出したルート計算コア（runPlanner/renderResult/天気表示）。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

// 見どころページから戻った際の位置復元用。出発・到着・日付・時刻・言語が全て一致する場合だけ
// 同じルート結果とみなす識別子(app.jsの復元処理と同じ組み立て方をする)。
function buildRouteKey(from, to, date, time, lang){
  return `${from}-${to}-${date}-${time}-${lang}`;
}

// 見どころリンクを押した時点のスクロール位置を保存する。戻ってきた際にapp.js側で復元する。
function saveReturnScrollPosition(templeNo, routeKey){
  try{
    sessionStorage.setItem('ohenro_return_scroll', JSON.stringify({
      templeNo, scrollY: window.scrollY, routeKey,
    }));
  }catch(e){ console.warn('スクロール位置の保存に失敗しました', e); }
}

async function runPlanner(){
  const startNo = Number(startSel.value);
  const endNo = Number(endSel.value);
  const startTimeStr = getSelectedTimeStr();
  const startDateStr = getSelectedDateStr();

  // 詳細ページから戻った時・アプリを開き直した時に前回の内容を復元できるよう、
  // 計算実行のたびに現在の選択状態をURLに反映しておく(履歴には残さずURLだけ書き換える)。
  const stateParams = new URLSearchParams();
  stateParams.set('from', String(startNo));
  stateParams.set('to', String(endNo));
  stateParams.set('date', startDateStr);
  stateParams.set('time', startTimeStr);
  stateParams.set('lang', currentLang);
  history.replaceState(null, '', `?${stateParams.toString()}`);

  if(startNo === endNo){
    document.getElementById('timeline').innerHTML =
      `<div class="segment-note">${t('err_same_temple')}</div>`;
    document.getElementById('summary').innerHTML = '';
    return;
  }

  document.getElementById('timeline').innerHTML = `<div class="segment-note">${t('loading_route')}</div>`;
  document.getElementById('summary').innerHTML = '';

  // 順打ち(番号が小さい→大きい)・逆打ち(大きい→小さい)の両方に対応
  const isReverse = startNo > endNo;
  const lo = Math.min(startNo, endNo), hi = Math.max(startNo, endNo);
  const inRange = temples.filter(t=>t.no>=lo && t.no<=hi).sort((a,b)=>a.no-b.no);
  const route = isReverse ? [...inRange].reverse() : inRange;

  // 隣接する2札所間の区間距離(distanceKm)は、番号が大きい方の札所に保持されている
  // (loadTemples()で「1つ前の札所からの距離」として格納しているため)。
  // 順打ち・逆打ちどちらでも、区間の両端のうち番号が大きい方を見れば同じ値が取れる。
  function segmentInfo(templeA, templeB){
    const higher = temples.find(t=>t.no===Math.max(templeA.no, templeB.no));
    return { distanceKm: higher.distanceKm, walkMin: walkMinutesFor(higher) };
  }

  let currentMin = toMinutes(startTimeStr);
  let totalWalkKm = 0, busSegments = 0, walkSegments = 0;
  const NOKYO_CLOSE = toMinutes('17:00');

  const arrival = [{ no:route[0].no, timeMin: currentMin, mode:null, note:null }];

  for(let i=1;i<route.length;i++){
    const seg = route[i];
    const prevNo = route[i-1].no;
    const { distanceKm, walkMin } = segmentInfo(route[i-1], seg);
    let chosen, arriveMin, note, missedBus=false, busResult=null;

    const walkArrive = currentMin + walkMin;

    if(mode==='efficient'){
      // バス停までの徒歩時間は、停留所ごとの実距離をもとにサーバー側で正確に計算するため、
      // ここでは現在時刻をそのまま渡すだけでよい。
      busResult = await fetchNextBus(prevNo, seg.no, toHHMM(currentMin), startDateStr);

      if(busResult === undefined){
        chosen = 'walk';
        arriveMin = walkArrive;
        note = t('bus_fetch_error');
      } else if(busResult){
        const busArrive = busResult.arrivalMin;
        if(busArrive < walkArrive){
          chosen = 'bus';
          arriveMin = busArrive;
          note = busResult.transfers === 1
            ? t('bus_transfer', agencyDisplayName(busResult.agency_key), busResult.from_stop_name, hhmm(busResult.from_departure), busResult.mid_stop_name, hhmm(busResult.mid_arrival), hhmm(busResult.mid_departure), busResult.to_stop_name, hhmm(busResult.to_arrival))
            : t('bus_direct', agencyDisplayName(busResult.agency_key), busResult.from_stop_name, hhmm(busResult.from_departure), busResult.to_stop_name, hhmm(busResult.to_arrival));
          // 運賃データがあれば末尾に追記する（無いフィードも多いため、無ければ何も表示しない）
          if(busResult.farePrice != null){
            const amount = busResult.fareCurrency === 'JPY' || !busResult.fareCurrency
              ? `¥${Math.round(busResult.farePrice)}`
              : `${Math.round(busResult.farePrice)} ${busResult.fareCurrency}`;
            note += t('fare_label', amount);
          }
        } else {
          chosen = 'walk';
          arriveMin = walkArrive;
          note = t('walk_faster', hhmm(busResult.from_departure));
        }
      } else {
        chosen = 'walk';
        arriveMin = walkArrive;
        note = t('bus_no_service');
        missedBus = true;
      }
    } else {
      chosen = 'walk';
      arriveMin = walkArrive;
      note = t('walk_mode_note');
    }

    if(chosen==='bus') busSegments++; else { walkSegments++; totalWalkKm += distanceKm; }

    currentMin = arriveMin;
    arrival.push({ no:seg.no, timeMin:currentMin, mode:chosen, note, distanceKm, missedBus, busResult: chosen==='bus' ? busResult : null });
  }

  renderResult(arrival, startDateStr);

  // 詳細ページから戻った時に、再計算せずそのまま復元できるよう結果をキャッシュしておく
  try{
    sessionStorage.setItem('ohenro_last_result', JSON.stringify({
      from: startNo, to: endNo, date: startDateStr, time: startTimeStr, lang: currentLang,
      arrival,
    }));
  }catch(e){ console.warn('結果のキャッシュに失敗しました', e); }
}

// 計算結果(arrival配列)を画面に描画する。新規計算時・キャッシュ復元時の両方から呼ばれる。
function renderResult(arrival, dateStr){
  lastArrival = arrival;
  const NOKYO_CLOSE = toMinutes('17:00');

  const totalWalkKm = arrival.reduce((sum,a)=> a.mode==='walk' ? sum + (a.distanceKm||0) : sum, 0);
  const busSegments = arrival.filter(a=>a.mode==='bus').length;

  const finalMin = arrival[arrival.length-1].timeMin;
  document.getElementById('summary').innerHTML = `
    <div class="summary">
      <div class="figure"><div class="num">${toHHMM(finalMin)}</div><div class="lbl">${t('summary_arrival')}</div></div>
      <div class="figure"><div class="num">${totalWalkKm.toFixed(1)}km</div><div class="lbl">${t('summary_walk_total')}</div></div>
      <div class="figure"><div class="num">${busSegments}${currentLang==='en' ? ' ' : ''}${t('summary_bus_segments')}</div><div class="lbl">${t('summary_bus_label')}</div></div>
    </div>
  `;

  // 見どころページから戻った位置の復元に使うルート識別子(仕様書4.2)。
  const routeKey = buildRouteKey(arrival[0].no, arrival[arrival.length-1].no, dateStr, toHHMM(arrival[0].timeMin), currentLang);

  let html = '';
  arrival.forEach((a, idx)=>{
    const temple = temples.find(t=>t.no===a.no);
    const isLast = idx === arrival.length-1;
    const { over: nokyoOver, diffMin: nokyoDiff, showCountdown: nokyoShowCountdown } = nokyoStatus(a.timeMin, NOKYO_CLOSE);
    let nokyoExtra = '';
    if(nokyoOver){
      nokyoExtra = ` ${t('nokyo_over', formatDurationMinutes(Math.abs(nokyoDiff)))}`;
    } else if(nokyoShowCountdown){
      nokyoExtra = ` ${t('nokyo_countdown', Math.round(nokyoDiff))}`;
    }
    const displayName = templeDisplayName(temple);

    // 区間情報(バス/徒歩案内)は、到着側ではなく「出発側」の札所カードに表示する。
    // ＝この札所を出発してから次の札所に着くまでの案内、という見せ方に統一。
    const nextEntry = arrival[idx+1];
    const nextTemple = nextEntry ? temples.find(t=>t.no===nextEntry.no) : null;

    html += `<div class="stop" id="route-stop-${temple.no}">
      <div class="stop-rail">
        <div class="stop-dot"></div>
        <div class="stop-time">${toHHMM(a.timeMin)}</div>
        ${!isLast ? `<div class="stop-connector ${nextEntry && nextEntry.mode==='bus' ? 'bus':''}"></div>` : ''}
      </div>
      <div class="stop-card">
        <div class="stop-title"><span class="no">${String(temple.no).padStart(2,'0')}</span><span class="stop-name">${displayName}</span>
          <span class="nokyo-badge ${nokyoOver?'nokyo-warn':'nokyo-ok'}">${(nokyoOver? t('nokyo_warn') : t('nokyo_ok'))}${nokyoExtra}</span>
        </div>
        <div class="stop-meta mono">${temple.kana}</div>
        <div class="weather-chip" id="weather-chip-${idx}" hidden></div>
        <a class="official-link" href="/temple/${temple.no}?lang=${currentLang}" onclick="saveReturnScrollPosition(${temple.no}, '${routeKey}')">${t('temple_detail_link')}</a>
        ${nextEntry ? `
          <div class="segment-note" onclick="openMapForIndex(${idx+1})">
            <span class="badge-mode ${nextEntry.mode}">${nextEntry.mode==='bus'?'BUS':'WALK'}</span>
            ${nextEntry.busResult && nextEntry.busResult.transfers === 1 ? `<span class="badge-mode transfer">${t('transfer_badge')}</span>` : ''}
            <b>${t('to_temple_km', templeDisplayName(nextTemple), nextEntry.distanceKm)}</b>：${nextEntry.note}
            <div class="map-link">${t('map_link')}</div>
          </div>` : ''}
      </div>
    </div>`;
  });
  document.getElementById('timeline').innerHTML = html;

  if(dateStr) attachWeather(arrival, dateStr);
}

// 日付文字列("YYYY-MM-DD")に日数を加算する。区間の到着が日をまたぐ場合(timeMinが1440分超)に使う。
function addDaysToDateStr(dateStr, days){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

// 気象庁の天気コード(天気予報用テロップ番号)を簡易アイコンへ変換。
// 121種類の完全な対応表は持たず、先頭桁(1xx=晴れ系,2xx=くもり系,3xx=雨系,4xx=雪系)で大まかに判定する。
// 表示文言そのもの(weatherText)は気象庁の値をそのまま使うため、ここではアイコン選択のみ行う。
function weatherIconForCode(code){
  const n = Number(code);
  if(!Number.isFinite(n)) return '☁️';
  const family = Math.floor(n/100);
  if(family === 1) return n===100 ? '☀️' : '🌤️';
  if(family === 2) return '☁️';
  if(family === 3) return '🌧️';
  if(family === 4) return '❄️';
  return '☁️';
}

// HTML特殊文字をエスケープする(天気チップをinnerHTMLで組み立てるため)。
// 気象庁の文言は基本的に安全なテキストだが、念のため防御的にエスケープする。
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 気象庁のweatherTextは日本語のみ。日本語以外の言語では、完全翻訳の代わりに
// 天気コードから生成した簡潔な状態語(晴れ/くもり/雨/雪)を表示する(仕様書5.5節)。
function weatherTextForLang(weatherCode, weatherTextJa, lang){
  if(lang === 'ja') return weatherTextJa || null;
  return weatherSimpleTextFromCode(weatherCode, lang);
}

// 経路上の各札所(区間ごと)の天気をまとめて取得し、対応するチップに反映する。
// 気象庁防災情報XML(サーバー側 /weather-proxy 経由)を使用。湿度は表示しない。
// 予報対象外の日付(8日以降等)は「予報を取得できません」を表示する(仕様書6.3節)。
async function attachWeather(arrival, dateStr){
  const stops = arrival
    .map((a, idx) => {
      const temple = temples.find(t=>t.no===a.no);
      if(!temple) return null;
      // 気象庁予報は札所ごとに割り当てた区域(src/data/temple_jma_areas.json)を使うため、
      // 緯度経度ではなく札所番号(a.no)をそのままサーバーへ渡す。
      return { idx, templeNo: a.no, date: addDaysToDateStr(dateStr, Math.floor(a.timeMin/1440)), time: toHHMM(a.timeMin) };
    })
    .filter(Boolean);
  if(!stops.length) return;

  const pointsParam = stops.map(s=>`${s.templeNo},${s.date},${s.time}`).join(';');
  let results;
  try{
    const res = await fetch(`${API_BASE}/weather-proxy?points=${encodeURIComponent(pointsParam)}`);
    if(!res.ok) throw new Error(`weather-proxy failed (status ${res.status})`);
    const data = await res.json();
    results = data.results || [];
  }catch(e){
    console.warn('weather fetch failed', e);
    return;
  }

  stops.forEach((s, i) => {
    const chip = document.getElementById(`weather-chip-${s.idx}`);
    const w = results[i];
    if(!chip) return;

    const maxC = w?.temperature?.maxC;
    const minC = w?.temperature?.minC;
    const tempParts = [];
    if(maxC != null) tempParts.push(`${t('temp_max_short')}${Math.round(maxC)}℃`);
    if(minC != null) tempParts.push(`${t('temp_min_short')}${Math.round(minC)}℃`);
    const precipText = w?.precipitationProbability != null ? `☔${Math.round(w.precipitationProbability)}%` : '';
    const weatherText = w ? weatherTextForLang(w.weatherCode, w.weatherText, currentLang) : null;

    // 予報自体が対象外(available:false)の場合も、天気・気温・降水確率が全て欠けている場合も、
    // 画面上に「予報を取得できません」とはっきり表示する(仕様書5.3節)。titleだけに情報を
    // 押し込めず、一部だけ取得できた項目はそのまま表示する。
    if(!w || !w.available || (!weatherText && !tempParts.length && !precipText)){
      chip.hidden = false;
      chip.innerHTML = `<div class="weather-chip-main">${escapeHtml(t('weather_unavailable'))}</div>`;
      chip.title = '';
      chip.classList.remove('weather-warn');
      return;
    }

    const icon = weatherIconForCode(w.weatherCode);
    const mainLine = [
      weatherText ? `${icon} ${weatherText}` : icon,
      tempParts.join(' / '),
      precipText,
    ].filter(Boolean).join('　');
    // 「到着予定時刻の降水確率」と誤認させないよう、時間帯別予報の場合は対象時間帯を必ず併記し、
    // 日別予報の場合はその旨を明記する(仕様書5.3節)。気象庁の区域は札所の一点予報ではないため
    // 「◯◯寺の降水確率」のような表現は避け、区域名(forecastAreaName)と合わせて表示する。
    const periodLine = w.isDailyForecast
      ? `${t('weather_daily_label')}・${t('weather_source_jma')}`
      : `${w.precipitationPeriod ? w.precipitationPeriod + '・' : ''}${t('weather_period_label')}・${t('weather_source_jma')}`;
    const subLine = [w.forecastAreaName, periodLine].filter(Boolean).join('・');

    const tempFullParts = [];
    if(maxC != null) tempFullParts.push(`${t('temp_max_label')}${Math.round(maxC)}℃`);
    if(minC != null) tempFullParts.push(`${t('temp_min_label')}${Math.round(minC)}℃`);
    // titleは補助情報(長い原文全文の確認手段)として残すが、必要な情報は本文2行に必ず出す。
    const fullTitle = [w.forecastAreaName, tempFullParts.join(' / '), periodLine, w.weatherText]
      .filter(Boolean).join('　');

    chip.hidden = false;
    chip.innerHTML = `<div class="weather-chip-main">${escapeHtml(mainLine)}</div><div class="weather-chip-sub">${escapeHtml(subLine)}</div>`;
    chip.title = fullTitle;
    chip.classList.toggle('weather-warn', (w.precipitationProbability ?? 0) >= 50 || (maxC ?? 0) >= 33);
  });
}

