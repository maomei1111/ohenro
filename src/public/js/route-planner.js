// index.htmlから切り出したルート計算コア（runPlanner/renderResult/天気表示）。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

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

    html += `<div class="stop">
      <div class="stop-rail">
        <div class="stop-dot"></div>
        <div class="stop-time">${toHHMM(a.timeMin)}</div>
        ${!isLast ? `<div class="stop-connector ${nextEntry && nextEntry.mode==='bus' ? 'bus':''}"></div>` : ''}
      </div>
      <div class="stop-card">
        <div class="stop-title"><span class="no">${String(temple.no).padStart(2,'0')}</span><span class="stop-name">${displayName}</span>
          <span class="nokyo-badge ${nokyoOver?'nokyo-warn':'nokyo-ok'}">${(nokyoOver? t('nokyo_warn') : t('nokyo_ok'))}${nokyoExtra}</span>
          <span class="weather-chip" id="weather-chip-${idx}" title="${t('weather_label')}"></span>
        </div>
        <div class="stop-meta mono">${temple.kana}</div>
        <a class="official-link" href="/temple/${temple.no}?lang=${currentLang}">${t('temple_detail_link')}</a>
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

// Open-Meteoの天気コード(WMO標準)を簡易アイコンに変換
function weatherIconForCode(code){
  if(code === 0) return '☀️';
  if(code === 1 || code === 2) return '🌤️';
  if(code === 3) return '☁️';
  if(code === 45 || code === 48) return '🌫️';
  if(code === 85 || code === 86) return '🌨️';
  if(code >= 71 && code <= 77) return '❄️';
  if(code === 95 || code === 96 || code === 99) return '⛈️';
  if(code >= 51 && code <= 82) return '🌧️';
  return '☁️';
}

// 経路上の各札所(区間ごと)の天気をまとめて取得し、対応するチップに反映する。
// APIキー不要のOpen-Meteoを使用。予報対象外の日付(先すぎる等)は何も表示しない。
async function attachWeather(arrival, dateStr){
  const stops = arrival
    .map((a, idx) => {
      const temple = temples.find(t=>t.no===a.no);
      if(!temple) return null;
      return { idx, lat: temple.lat, lng: temple.lng, date: addDaysToDateStr(dateStr, Math.floor(a.timeMin/1440)) };
    })
    .filter(Boolean);
  if(!stops.length) return;

  const pointsParam = stops.map(s=>`${s.lat},${s.lng},${s.date}`).join(';');
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
    if(!chip || !w || !w.available) return;
    const precipRounded = Math.round(w.precipProbability / 10) * 10; // 日本の天気予報に合わせて10%刻みで表示
    const humidityText = w.humidity != null ? ` 💧${Math.round(w.humidity)}%` : '';
    chip.textContent = `${weatherIconForCode(w.weathercode)} ${Math.round(w.maxTempC)}°C ☔${precipRounded}%${humidityText}`;
    chip.classList.toggle('weather-warn', w.precipProbability >= 50 || w.maxTempC >= 33);
  });
}

