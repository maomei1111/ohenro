// index.htmlから切り出した地図モーダル（Google Maps Platform版。標高グラフ・周辺目印含む）。
// index.html側の他スクリプトと同じグローバルスコープで動作する前提（ES Modules不使用）。

// ==================================================================
// ---- 地図モーダル（Google Maps Platform 版）----
// ==================================================================
let lastArrival = [];
let googleMap = null;
let mapOverlays = []; // 開き直すたびにクリアするマーカー・ポリラインの一覧
let mapReqToken = 0;
// コンパスボタンは常に表示したままにし(非表示にしない)、回転操作が使えるかどうかは
// このフラグで管理する。地図初期化直後・Rendering Type確定後(tilesloaded)の両方で更新する。
let mapVectorCapable = false;

// Google Maps JS APIの読み込み完了を待つための仕組み
// (実体・コールバック関数本体は head 内で定義済み。ここではグローバルの状態を参照するだけ)
function waitForGoogleMaps(){
  if(window.__googleMapsReady) return Promise.resolve();
  return new Promise(function(resolve){ window.__googleMapsReadyWaiters.push(resolve); });
}

function clearMapOverlays(){
  mapOverlays.forEach(o=> o.setMap(null));
  mapOverlays = [];
  currentLocationMarker = null;
  currentLocationHaloMarker = null;
  currentDirectionMarker = null;
  currentAccuracyCircle = null;
}

// Directions APIで実際の道なりルートを取得
// mode: 'WALKING'(徒歩) または 'DRIVING'(バス経路の近似。本来はGTFS shapes.txtが理想)
function fetchRoute(from, to, travelMode){
  return new Promise((resolve, reject)=>{
    const service = new google.maps.DirectionsService();
    service.route({
      origin: { lat: from.lat, lng: from.lng },
      destination: { lat: to.lat, lng: to.lng },
      travelMode: google.maps.TravelMode[travelMode],
    }, (result, status)=>{
      if(status === 'OK' && result.routes && result.routes.length){
        const coords = result.routes[0].overview_path.map(p=>[p.lat(), p.lng()]);
        resolve({ coords });
      } else {
        reject(new Error(`Directions request failed: ${status}`));
      }
    });
  });
}

// 自前サーバー経由でOverpass(OpenStreetMap)に問い合わせ、沿道の目印を取得
async function fetchLandmarks(routeCoords, retried=false){
  const lats = routeCoords.map(c=>c[0]), lngs = routeCoords.map(c=>c[1]);
  const pad = 0.004;
  const bbox = [Math.min(...lats)-pad, Math.min(...lngs)-pad, Math.max(...lats)+pad, Math.max(...lngs)+pad].join(',');

  let data;
  try{
    const res = await fetch(`${API_BASE}/overpass-proxy?bbox=${encodeURIComponent(bbox)}`);
    if(!res.ok) throw new Error(`overpass-proxy failed (status ${res.status})`);
    data = await res.json();
  }catch(e){
    if(!retried){
      await new Promise(r=>setTimeout(r, 1500));
      return fetchLandmarks(routeCoords, true);
    }
    throw e;
  }

  const candidates = (data.elements||[])
    .filter(el => el.tags)
    .map(el => ({ lat:el.lat, lng:el.lon, name: el.tags.name || landmarkLabel(el.tags), tags:el.tags }))
    .map(p => ({ ...p, dist: distToPolyline(p.lat, p.lng, routeCoords), priority: landmarkPriority(p.tags) }))
    .filter(p => p.dist <= 180)
    .sort((a,b)=> (a.priority - b.priority) || (a.dist - b.dist));

  const picked = [];
  for(const c of candidates){
    if(picked.length >= 9) break;
    if(picked.some(p => p.name===c.name && metersBetween(p.lat,p.lng,c.lat,c.lng) < 150)) continue;
    picked.push(c);
  }
  return picked;
}

// 優先順位: トイレ > 宿泊施設 > 道の駅 > 温泉 > 自動販売機 > その他既存カテゴリ
function landmarkPriority(tags){
  if(tags.amenity==='toilets') return 1;
  if(tags.tourism && /hotel|guest_house|motel|hostel|ryokan/.test(tags.tourism)) return 2;
  if(tags.name && tags.name.includes('道の駅')) return 3;
  if(tags.amenity==='public_bath' || tags.natural==='hot_spring' || (tags.name && tags.name.includes('温泉'))) return 4;
  if(tags.amenity==='vending_machine') return 5;
  return 9;
}

function landmarkLabel(tags){
  if(tags.amenity==='toilets') return t('landmark_toilet');
  if(tags.tourism && /hotel|guest_house|motel|hostel|ryokan/.test(tags.tourism)) return t('landmark_lodging');
  if(tags.name && tags.name.includes('道の駅')) return t('landmark_roadside');
  if(tags.amenity==='public_bath' || tags.natural==='hot_spring' || (tags.name && tags.name.includes('温泉'))) return t('landmark_onsen');
  if(tags.amenity==='vending_machine') return t('landmark_vending');
  if(tags.amenity==='place_of_worship') return t('landmark_temple');
  if(tags.shop) return t('landmark_shop');
  if(tags.amenity==='cafe' || tags.amenity==='restaurant') return t('landmark_dining');
  if(tags.railway==='station') return t('landmark_station');
  if(tags.highway==='bus_stop') return t('landmark_busstop');
  if(tags.historic) return t('landmark_historic');
  if(tags.tourism) return t('landmark_tourism');
  return t('landmark_other');
}

function landmarkColor(tags){
  const p = landmarkPriority(tags);
  if(p===1) return '#2E7D32'; // トイレ: 緑
  if(p===2) return '#1D2B4F'; // 宿泊: 紺
  if(p===3) return '#AD8A50'; // 道の駅: 金
  if(p===4) return '#C0472C'; // 温泉: 朱
  if(p===5) return '#5B6B4F'; // 自販機: 落ち着いた緑
  if(tags.amenity==='place_of_worship') return '#7B4B94'; // 寺社: 紫
  if(tags.shop) return '#B5651D'; // 商店: 茶
  if(tags.amenity==='cafe' || tags.amenity==='restaurant') return '#D08A2E'; // 飲食: 橙
  if(tags.railway==='station') return '#2C6E8C'; // 駅: 青
  if(tags.highway==='bus_stop') return '#8C6E2C'; // バス停: 黄土色
  if(tags.historic) return '#5C4A3D'; // 史跡: こげ茶
  if(tags.tourism) return '#3C7A6E'; // 観光: 深緑がかった青
  return '#8a8578';
}

// 全カテゴリに絵文字アイコンを割り当て、地図上で一目でジャンルが分かるようにする
function landmarkGlyph(tags){
  const p = landmarkPriority(tags);
  if(p===1) return '🚻';
  if(p===2) return '🛏️';
  if(p===3) return '🛣️';
  if(p===4) return '♨️';
  if(p===5) return '🥤';
  if(tags.amenity==='place_of_worship') return '卍'; // 地図記号でおなじみの寺院マーク
  if(tags.shop) return '🏪';
  if(tags.amenity==='cafe' || tags.amenity==='restaurant') return '🍴';
  if(tags.railway==='station') return '🚉';
  if(tags.highway==='bus_stop') return '🚏';
  if(tags.historic) return '🏯';
  if(tags.tourism) return '📷';
  return '📍';
}

function drawPolyline(coords, color, dashed){
  const path = coords.map(c=>({lat:c[0], lng:c[1]}));
  const lineSymbol = { path:'M 0,-1 0,1', strokeOpacity:1, scale:3 };
  const line = new google.maps.Polyline({
    path,
    strokeColor: color,
    strokeOpacity: dashed ? 0 : 0.9,
    strokeWeight: 4,
    icons: dashed ? [{ icon: lineSymbol, offset:'0', repeat:'10px' }] : undefined,
    map: googleMap,
  });
  mapOverlays.push(line);
  return line;
}

// ピンの右横に、常に見えるラベルを表示するための軽量なOverlayView。
// InfoWindow(吹き出し)と違い、地図の拡大縮小・移動に追従しつつ、
// ピンのすぐ横にシンプルなラベルとして表示され続ける。
// google.maps.OverlayViewはスクリプト読み込み完了後にしか参照できないため、
// クラス自体を遅延生成する(トップレベルでいきなりextendsすると、
// Google Maps読み込み前にスクリプト全体がエラーで止まってしまうため)。
let _PinLabelOverlayClass = null;
function getPinLabelOverlayClass(){
  if(_PinLabelOverlayClass) return _PinLabelOverlayClass;
  _PinLabelOverlayClass = class extends google.maps.OverlayView {
    constructor(position, text, map){
      super();
      this.position = new google.maps.LatLng(position.lat, position.lng);
      this.text = text;
      this.div = null;
      this.setMap(map);
    }
    onAdd(){
      this.div = document.createElement('div');
      Object.assign(this.div.style, {
        position:'absolute',
        background:'#fff',
        border:'1px solid rgba(43,40,37,0.15)',
        borderRadius:'10px',
        padding:'2px 7px',
        fontSize:'11px',
        fontFamily:"'Noto Sans JP', sans-serif",
        whiteSpace:'nowrap',
        boxShadow:'0 1px 4px rgba(0,0,0,0.25)',
        transform:'translate(10px, -10px)', // ピンの右横・少し上にオフセット
      });
      this.div.textContent = this.text;
      this.getPanes().overlayLayer.appendChild(this.div);
    }
    draw(){
      const projection = this.getProjection();
      if(!projection || !this.div) return;
      const point = projection.fromLatLngToDivPixel(this.position);
      if(point){
        this.div.style.left = point.x + 'px';
        this.div.style.top = point.y + 'px';
      }
    }
    onRemove(){
      if(this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
  };
  return _PinLabelOverlayClass;
}

function addPinMarker(position, color, label, title, scale, labelFontSize, showPersistentName){
  const marker = new google.maps.Marker({
    position, map: googleMap, title,
    label: label ? { text:label, color:'#fff', fontSize: labelFontSize || '11px', fontWeight:'700' } : undefined,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: scale || 9,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
    },
  });
  mapOverlays.push(marker);
  // バス停名など、常に地図上に名前を出しておきたい場合はピンの横にラベルを添える
  if(showPersistentName && title){
    const PinLabelOverlay = getPinLabelOverlayClass();
    const overlay = new PinLabelOverlay(position, title, googleMap);
    mapOverlays.push(overlay); // OverlayViewもsetMap(null)で消せるのでそのままclearMapOverlaysに乗る
  }
  return marker;
}

function addLandmarkMarker(lm){
  const color = landmarkColor(lm.tags);
  const glyph = landmarkGlyph(lm.tags);
  const marker = addPinMarker({lat:lm.lat, lng:lm.lng}, color, glyph, lm.name, 10, '12px');
  marker.addListener('click', ()=>{
    new google.maps.InfoWindow({
      content: `<div style="font-family:'Noto Sans JP',sans-serif;font-size:12px;">${lm.name}</div>`
    }).open(googleMap, marker);
  });
}

function fitBoundsToCoords(coords){
  const bounds = new google.maps.LatLngBounds();
  coords.forEach(c=> bounds.extend({lat:c[0], lng:c[1]}));
  googleMap.fitBounds(bounds, 40);
}

// 徒歩区間の標高プロファイルを取得し、獲得標高(上り)・下り標高を計算する
async function fetchElevationProfile(coords, cachedTemple){
  // 事前計算済みのキャッシュ(temples_88.jsonのelevations)があれば、そちらを優先して使う
  // (区間は固定なので、毎回Elevation APIを呼ぶ必要が無い)
  if(cachedTemple && cachedTemple.elevations && cachedTemple.elevations.length){
    const elevations = cachedTemple.elevations;
    const totalDist = cachedTemple.distanceKm * 1000;
    const distances = elevations.map((_, i)=> totalDist * i/(elevations.length-1));
    return { elevations, distances, totalDist };
  }

  const { ElevationService } = await google.maps.importLibrary('elevation');
  const elevator = new ElevationService();
  const path = coords.map(c=>({lat:c[0], lng:c[1]}));
  const samples = Math.min(60, Math.max(2, coords.length));
  const response = await elevator.getElevationAlongPath({ path, samples });
  if(!response || !response.results) throw new Error('Elevation request returned no results');
  const elevations = response.results.map(r=>r.elevation);

  // サンプルは経路全体に等間隔に取られるため、経路の総距離から各点の距離を逆算する
  let totalDist = 0;
  for(let i=1;i<coords.length;i++){
    totalDist += metersBetween(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  }
  const distances = elevations.map((_, i)=> totalDist * i/(elevations.length-1));
  return { elevations, distances, totalDist };
}
function elevationGainLoss(elevations){
  let gain=0, loss=0;
  for(let i=1;i<elevations.length;i++){
    const diff = elevations[i]-elevations[i-1];
    if(diff>0) gain+=diff; else loss += -diff;
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

// 一番大きな「連続した上り」区間を探す（横ばい・微小な上りは1つの区間としてまとめる）
function findBiggestClimb(elevations, distances){
  let best = { gain:0, startIdx:0, endIdx:0 };
  let i = 0;
  while(i < elevations.length-1){
    if(elevations[i+1] > elevations[i]){
      let j = i;
      while(j < elevations.length-1 && elevations[j+1] >= elevations[j]) j++;
      const gain = elevations[j] - elevations[i];
      if(gain > best.gain) best = { gain, startIdx:i, endIdx:j };
      i = j;
    } else {
      i++;
    }
  }
  return best;
}

// 標高プロファイルをシンプルな折れ線グラフ(SVG)として描画する
function buildElevationSvg(elevations, distances){
  const w=280, h=88, padX=6, padY=6, labelH=14, padLeft=30; // padLeft: 左側に標高目盛り表示用のスペースを確保
  const chartH = h - labelH;
  const minE = Math.min(...elevations), maxE = Math.max(...elevations);
  const range = Math.max(1, maxE-minE);
  const totalDist = distances[distances.length-1] || 1;
  const chartLeft = padX + padLeft;

  const xForIdx = (i)=> chartLeft + (distances[i]/totalDist) * (w-padLeft-padX*2);
  const yForE = (e)=> (chartH-padY) - ((e-minE)/range) * (chartH-2*padY);

  const pts = elevations.map((e,i)=> `${xForIdx(i).toFixed(1)},${yForE(e).toFixed(1)}`);
  const area = `${chartLeft},${chartH-padY} ${pts.join(' ')} ${w-padX},${chartH-padY}`;

  // 標高(Y軸)の目盛り: 最低・中間・最高の3段階
  const midE = (minE+maxE)/2;
  const yTicks = [minE, midE, maxE];
  let yGrid = '', yLabels = '';
  yTicks.forEach(e=>{
    const y = yForE(e);
    yGrid += `<line x1="${chartLeft}" y1="${y.toFixed(1)}" x2="${w-padX}" y2="${y.toFixed(1)}" stroke="rgba(43,40,37,0.08)" stroke-width="1"></line>`;
        yLabels += `<text x="${(chartLeft-4).toFixed(1)}" y="${(y+3).toFixed(1)}" font-size="8.5" fill="#8a8578" font-family="Noto Sans JP, sans-serif" text-anchor="end">${Math.round(e)}m</text>`;
  });

  // 距離(X軸)目盛り: 基本は1km刻み。区間が長い場合はラベルが重ならないよう間隔を自動で広げる(2/5/10/20km)
  const totalKm = totalDist/1000;
  const stepCandidates = [1,2,5,10,20,50];
  const stepKm = stepCandidates.find(s => totalKm/s <= 6) ?? 50;

  const xForKm = (km)=> chartLeft + ((km*1000)/totalDist) * (w-padLeft-padX*2);
  let xGrid = '', xLabels = '';
  for(let km=0; km<=totalKm + 0.001; km+=stepKm){
    const x = xForKm(km);
    xGrid += `<line x1="${x.toFixed(1)}" y1="${padY}" x2="${x.toFixed(1)}" y2="${chartH}" stroke="rgba(43,40,37,0.08)" stroke-width="1"></line>`;
    const anchor = km===0 ? 'start' : (km>=totalKm-0.001 ? 'end' : 'middle');
      xLabels += `<text x="${x.toFixed(1)}" y="${h-2}" font-size="9" fill="#8a8578" font-family="Noto Sans JP, sans-serif" text-anchor="${anchor}">${km}km</text>`;
  }
  if(totalKm - Math.floor(totalKm/stepKm)*stepKm > stepKm*0.3){
    const x = xForKm(totalKm);
    xLabels += `<text x="${x.toFixed(1)}" y="${h-2}" font-size="9" fill="#8a8578" font-family="Noto Sans JP, sans-serif" text-anchor="end">${totalKm.toFixed(1)}km</text>`;
  }

  // このアプリらしい演出: 最高地点に金色のマーカーと標高ラベルを表示する
  let peakMark = '';
  const peakIdx = elevations.indexOf(maxE);
  if(range > 5){ // ほぼ平坦な区間ではわざわざ強調しない
    const px = xForIdx(peakIdx), py = yForE(maxE);
    const labelAbove = py > 16; // 上端に近い場合はラベルを下に出す
    peakMark = `
      <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="#AD8A50" stroke="#fff" stroke-width="1.2"></circle>
        <text x="${px.toFixed(1)}" y="${(labelAbove ? py-7 : py+13).toFixed(1)}" font-size="9" fill="#AD8A50" font-family="Noto Sans JP, sans-serif" font-weight="700" text-anchor="middle">${Math.round(maxE)}m</text>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;margin-top:6px;">
    <polygon points="${area}" fill="rgba(91,107,79,0.22)"></polygon>
    <polyline points="${pts.join(' ')}" fill="none" stroke="#5B6B4F" stroke-width="1.6"></polyline>
    <line x1="${chartLeft}" y1="${chartH}" x2="${w-padX}" y2="${chartH}" stroke="rgba(43,40,37,0.15)" stroke-width="1"></line>
    ${yGrid}
    ${xGrid}
    ${yLabels}
    ${xLabels}
    ${peakMark}
  </svg>`;
}

let currentLocationMarker = null;
let currentLocationHaloMarker = null;
let currentDirectionMarker = null;
let currentAccuracyCircle = null;
let compassListenerAdded = false;
let latestDeviceHeading = null;
let headingVectorX = null;
let headingVectorY = null;
let lastHeadingUpdateAt = 0;
let lastRenderedDeviceHeading = null;
let absoluteHeadingSeen = false;
let mapHeadingMode = 'north';

// 上向きの矢印(向き0度=北)のGoogle Maps Symbol定義。rotationプロパティで回転させる。
function currentLocationIcon(heading){
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#4285F4',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale: 8,
  };
}
function currentLocationHaloIcon(){
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#4285F4',
    fillOpacity: 0.18,
    strokeColor: '#4285F4',
    strokeOpacity: 0.3,
    strokeWeight: 1,
    scale: 18,
  };
}
function currentDirectionIcon(heading){
  return {
    path: 'M 0,0 L -12,-28 A 31,31 0 0 1 12,-28 Z',
    fillColor: '#4285F4',
    fillOpacity: 0.24,
    strokeColor: '#4285F4',
    strokeOpacity: 0.38,
    strokeWeight: 1,
    scale: 1,
    rotation: heading || 0,
    anchor: new google.maps.Point(0, 0),
  };
}
function renderCurrentLocation(pos){
  const { latitude, longitude, accuracy } = pos.coords;
  const position = {lat:latitude, lng:longitude};
  if(currentLocationMarker) currentLocationMarker.setMap(null);
  if(currentLocationHaloMarker) currentLocationHaloMarker.setMap(null);
  if(currentDirectionMarker) currentDirectionMarker.setMap(null);
  if(currentAccuracyCircle) currentAccuracyCircle.setMap(null);

  currentAccuracyCircle = new google.maps.Circle({
    center: position,
    radius: Math.max(Number(accuracy) || 0, 15),
    map: googleMap,
    fillColor: '#4285F4',
    fillOpacity: 0.12,
    strokeColor: '#4285F4',
    strokeOpacity: 0.28,
    strokeWeight: 1,
    clickable: false,
    zIndex: 10,
  });
  currentDirectionMarker = new google.maps.Marker({
    position,
    map: googleMap,
    icon: currentDirectionIcon(0),
    clickable: false,
    visible: false,
    zIndex: 998,
  });
  currentLocationHaloMarker = new google.maps.Marker({
    position,
    map: googleMap,
    icon: currentLocationHaloIcon(),
    clickable: false,
    zIndex: 997,
  });
  currentLocationMarker = new google.maps.Marker({
    position,
    map: googleMap,
    icon: currentLocationIcon(0),
    title: t('current_location'),
    zIndex: 999,
  });
  mapOverlays.push(currentAccuracyCircle, currentLocationHaloMarker, currentDirectionMarker, currentLocationMarker);
  enableCompassHeading();
  updateDirectionMarkerForMap();
  return position;
}

// Android側(MainActivity.kt)から、位置情報の許可が完全にブロックされている
// (システムの許可ダイアログではもう出せない)場合に呼ばれる。
// アプリの設定画面を開くボタン付きのメッセージを出す。
window.__onLocationPermanentlyDenied = function(){
  const openSettings = window.AndroidBridge && typeof window.AndroidBridge.openAppSettings === 'function';
  if(openSettings && confirm(t('zukan_locate_failed') + '\n\n' + t('location_open_settings_confirm'))){
    window.AndroidBridge.openAppSettings();
  }else if(!openSettings){
    showToast(t('zukan_locate_failed'));
  }
};

// 地図右下の「現在地」ボタン：押した瞬間だけ現在地を取得して地図を移動する(常時監視はしない)
function mapLocateMe(){
  if(!googleMap) return;
  if(!isLocationUsageEnabled()){
    showToast(t('location_app_disabled'));
    return;
  }
  if(!navigator.geolocation){
    showToast(t('zukan_locate_unsupported'));
    return;
  }
  const btn = document.getElementById('mapLocateBtn');
  const original = btn.innerHTML;
  btn.textContent = '…';
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      btn.innerHTML = original;
      const position = renderCurrentLocation(pos);
      googleMap.panTo(position);
      if(googleMap.getZoom() < 15) googleMap.setZoom(15);
    },
    (err)=>{
      btn.innerHTML = original;
      console.warn('現在地の取得に失敗しました', err);
      showToast(t('zukan_locate_failed'));
    },
    { enableHighAccuracy:true, timeout:8000, maximumAge:0 }
  );
}

// 地図右下の「コンパス」ボタン：2本指ジェスチャー等で回転した地図の向きを北向きに戻す
function normalizeHeading(value){
  return (Number(value) % 360 + 360) % 360;
}
function headingDifference(a, b){
  return Math.abs(((a - b + 540) % 360) - 180);
}
function updateDirectionMarkerForMap(){
  if(!currentDirectionMarker || latestDeviceHeading == null) return;
  const mapHeading = Number(googleMap?.getHeading?.() || 0);
  currentDirectionMarker.setIcon(currentDirectionIcon(normalizeHeading(latestDeviceHeading - mapHeading)));
  currentDirectionMarker.setVisible(true);
}
// コンパスボタンは常時見えるようにしているため、回転非対応の地図でタップされた場合は
// ボタンを消す代わりに理由を説明するメッセージを出す(仕様書27節)。
function updateCompassAvailability(){
  const compassBtn = document.getElementById('mapCompassBtn');
  if(!compassBtn || !googleMap) return;
  const isVector = googleMap.getRenderingType?.() === google.maps.RenderingType.VECTOR;
  mapVectorCapable = !!isVector;
  compassBtn.classList.toggle('is-unsupported', !mapVectorCapable);
  compassBtn.setAttribute('aria-disabled', String(!mapVectorCapable));
}
function toggleMapHeadingMode(){
  if(!googleMap) return;
  if(!mapVectorCapable){
    showToast(t('compass_unsupported'));
    return;
  }
  if(mapHeadingMode === 'device'){
    mapHeadingMode = 'north';
    try{ googleMap.setHeading(0); }catch(e){}
  }else if(latestDeviceHeading != null){
    mapHeadingMode = 'device';
    try{ googleMap.setHeading(latestDeviceHeading); }catch(e){}
  }else{
    showToast(t('compass_waiting'));
  }
  try{ googleMap.setTilt(0); }catch(e){}
  updateMapCompassIcon();
}
function updateMapCompassIcon(){
  const btn = document.getElementById('mapCompassBtn');
  const icon = document.querySelector('#mapCompassBtn svg');
  if(!icon || !googleMap) return;
  const heading = Number(googleMap.getHeading?.() || 0);
  icon.style.transform = `rotate(${-heading}deg)`;
  if(btn){
    const headingUp = mapHeadingMode === 'device';
    btn.classList.toggle('is-heading-up', headingUp);
    btn.title = headingUp ? '北を上に戻す' : '向いている方向を上にする';
    btn.setAttribute('aria-label', btn.title);
  }
  updateDirectionMarkerForMap();
}

function showCurrentLocation(){
  if(!isLocationUsageEnabled()) return;
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      const position = renderCurrentLocation(pos);
      const bounds = googleMap.getBounds();
      if(bounds){
        bounds.extend(position);
        googleMap.fitBounds(bounds, 40);
      }
    },
    (err)=> console.warn('現在地の取得に失敗しました（権限が許可されていない可能性があります）', err),
    { enableHighAccuracy:true, timeout:8000, maximumAge:30000 }
  );
}

// 端末のコンパスセンサーと連動し、現在地マーカーの矢印を実際に向いている方角へ回転させる
function enableCompassHeading(){
  if(compassListenerAdded) return;
  compassListenerAdded = true;

  const handleOrientation = (event)=>{
    if(event.type === 'deviceorientationabsolute') absoluteHeadingSeen = true;
    if(event.type === 'deviceorientation' && absoluteHeadingSeen) return;
    let heading = null;
    if(typeof event.webkitCompassHeading === 'number'){
      heading = event.webkitCompassHeading; // iOS Safari
    } else if(typeof event.alpha === 'number'){
      heading = 360 - event.alpha; // Android: alphaは反時計回りのため向きを反転
    }
    if(heading == null) return;
    const now = performance.now();
    if(now - lastHeadingUpdateAt < 100) return;
    lastHeadingUpdateAt = now;

    const radians = normalizeHeading(heading) * Math.PI / 180;
    const alpha = 0.14;
    if(headingVectorX == null || headingVectorY == null){
      headingVectorX = Math.cos(radians);
      headingVectorY = Math.sin(radians);
    }else{
      headingVectorX = (1 - alpha) * headingVectorX + alpha * Math.cos(radians);
      headingVectorY = (1 - alpha) * headingVectorY + alpha * Math.sin(radians);
    }
    const smoothed = normalizeHeading(Math.atan2(headingVectorY, headingVectorX) * 180 / Math.PI);
    if(lastRenderedDeviceHeading != null && headingDifference(smoothed, lastRenderedDeviceHeading) < 2.5) return;
    latestDeviceHeading = smoothed;
    lastRenderedDeviceHeading = smoothed;
    updateDirectionMarkerForMap();
  };

  // iOS 13+ ではジェスチャー起点での許可要求が必要。Androidでは通常不要。
  if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    DeviceOrientationEvent.requestPermission().then(state=>{
      if(state === 'granted'){
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    }).catch(()=>{});
  } else if(window.DeviceOrientationEvent){
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

function openMapForIndex(idx){
  const a = lastArrival[idx];
  const prev = lastArrival[idx-1];
  if(!a || !prev) return;
  openMap(prev.no, a.no, a.mode, a.note, a.distanceKm, a.busResult);
}

async function openMap(fromNo, toNo, mode, note, distanceKm, busResult){
  const from = temples.find(t=>t.no===fromNo);
  const to = temples.find(t=>t.no===toNo);
  const myToken = ++mapReqToken;

  document.getElementById('mapTitle').textContent = `${templeDisplayName(from)} → ${templeDisplayName(to)}`;
  const noLabel = currentLang==='en' ? '#' : '番';
  document.getElementById('mapSub').textContent = `${noLabel}${String(from.no).padStart(2,'0')} → ${noLabel}${String(to.no).padStart(2,'0')}｜${distanceKm}km`;
  document.getElementById('mapFoot').innerHTML =
    `<span class="badge-mode ${mode}">${mode==='bus'?'BUS':'WALK'}</span>${note}<br><span style="color:#8a8578;">${t('loading_route')}</span>`;

  document.getElementById('mapOverlay').classList.add('open');

  await waitForGoogleMaps();
  if(myToken !== mapReqToken) return;

  setTimeout(async ()=>{
    clearMapOverlays();
    googleMap = new google.maps.Map(document.getElementById('mapCanvas'), {
      center: { lat: from.lat, lng: from.lng },
      zoom: 13,
      mapId: '{{GOOGLE_MAPS_MAP_ID}}',
      headingInteractionEnabled: true,
      tiltInteractionEnabled: false,
      disableDefaultUI: true,
      zoomControl: true,
      // 独自のコンパス・現在地ボタンは右上(.map-fab-group)へ移したため、
      // Google Maps標準のズームボタンは右下のままで重ならない(仕様書26節)。
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      gestureHandling: 'greedy', // 1本指パン・ピンチズーム・2本指回転を全て地図側で処理する
    });
    mapHeadingMode = 'north';
    googleMap.addListener('heading_changed', updateMapCompassIcon);
    // 地図初期化直後(Rendering Typeがまだ確定していない場合が多い)にも一度状態を
    // 更新しておき、tilesloaded確定後にもう一度更新する(仕様書27節)。
    updateCompassAvailability();
    google.maps.event.addListenerOnce(googleMap, 'tilesloaded', ()=>{
      updateCompassAvailability();
      if(mapVectorCapable) googleMap.setHeadingInteractionEnabled?.(true);
      // Google Maps標準のズームボタン等、コントロールのレイアウトを地図表示後に
      // 再計算させる(モーダル表示アニメーション等でサイズが変わっているため)。
      google.maps.event.trigger(googleMap, 'resize');
    });

    addPinMarker({lat:from.lat, lng:from.lng}, '#1D2B4F', String(from.no).padStart(2,'0'), templeDisplayName(from), 13);
    addPinMarker({lat:to.lat, lng:to.lng}, '#A63A2A', String(to.no).padStart(2,'0'), templeDisplayName(to), 13);

    // 直通バスで、かつ停留所座標が両方揃っている場合だけ「徒歩→バス→徒歩」の3区間で描画。
    // 乗り換えルートは現状、乗換停留所の座標をAPIが返していないため簡易表示にフォールバック。
    const useBusStops = mode==='bus' && busResult && busResult.transfers !== 1
      && busResult.from_stop_lat && busResult.to_stop_lat;

    let allCoords = [];
    let walkOnlyCoords = []; // 標高計算の対象（徒歩区間のみ。バス乗車中の区間は対象外）
    let routeOk = false, routeErr = null;

    if(useBusStops){
      const fromStop = { lat:Number(busResult.from_stop_lat), lng:Number(busResult.from_stop_lon) };
      const toStop   = { lat:Number(busResult.to_stop_lat),   lng:Number(busResult.to_stop_lon) };
      try{
        // 札所⇔バス停の徒歩ルートは、事前計算済みキャッシュがあればそれを使い、
        // 無ければその場でDirections APIに問い合わせる(フォールバック)。
        const cachedWalk1 = cachedStopWalkRoute(fromNo, busResult.agency_key, busResult.from_stop_id, false);
        const cachedWalk2 = cachedStopWalkRoute(toNo, busResult.agency_key, busResult.to_stop_id, true);
        // バスの乗車区間は、GTFSのshapes.txt由来の実際の走行経路があればそれを使う。
        // 無い場合のみ、Directionsで「車で行くとしたら」の仮のルートにフォールバックする
        // (この場合、実際にバスがループ・迂回するような経路とは異なる場合がある)。
        const hasRealShape = busResult.busShapeCoords && busResult.busShapeCoords.length >= 2;

        const [walk1, busLeg, walk2] = await Promise.all([
          cachedWalk1 ? Promise.resolve({coords:cachedWalk1}) : fetchRoute(from, fromStop, 'WALKING').catch(()=>({coords:[[from.lat,from.lng],[fromStop.lat,fromStop.lng]]})),
          hasRealShape ? Promise.resolve({coords:busResult.busShapeCoords}) : fetchRoute(fromStop, toStop, 'DRIVING').catch(()=>({coords:[[fromStop.lat,fromStop.lng],[toStop.lat,toStop.lng]]})),
          cachedWalk2 ? Promise.resolve({coords:cachedWalk2}) : fetchRoute(toStop, to, 'WALKING').catch(()=>({coords:[[toStop.lat,toStop.lng],[to.lat,to.lng]]})),
        ]);
        if(myToken !== mapReqToken) return;
        drawPolyline(walk1.coords, '#5B6B4F', false);
        drawPolyline(busLeg.coords, '#A63A2A', true);
        drawPolyline(walk2.coords, '#5B6B4F', false);
        addPinMarker(fromStop, '#A63A2A', null, busResult.from_stop_name || 'バス停', 7, null, true);
        addPinMarker(toStop, '#A63A2A', null, busResult.to_stop_name || 'バス停', 7, null, true);
        allCoords = [...walk1.coords, ...busLeg.coords, ...walk2.coords];
        walkOnlyCoords = [...walk1.coords, ...walk2.coords];
        routeOk = true;
      }catch(e){
        routeErr = e.message;
        allCoords = [[from.lat,from.lng],[to.lat,to.lng]];
        drawPolyline(allCoords, '#A63A2A', true);
      }
    } else {
      try{
        const travelMode = mode==='bus' ? 'DRIVING' : 'WALKING';
        const r = await fetchRoute(from, to, travelMode);
        if(myToken !== mapReqToken) return;
        allCoords = r.coords;
        if(mode!=='bus') walkOnlyCoords = allCoords; // バス(driving)区間は標高計算の対象外
        routeOk = true;
      }catch(e){
        routeErr = e.message;
        allCoords = [[from.lat,from.lng],[to.lat,to.lng]];
      }
      drawPolyline(allCoords, mode==='bus' ? '#A63A2A' : '#5B6B4F', mode==='bus');
    }

    fitBoundsToCoords(allCoords);
    // 現在地の自動取得はしない。ボタンを押した時だけ取得する(mapLocateMe)。

    let elevationNote = '';
    if(walkOnlyCoords.length >= 2){
      try{
        // 乗り換え等の部分徒歩ではなく「札所間をまるごと徒歩」の区間のみ、
        // 事前計算済みキャッシュ(temples_88.jsonのelevations)が使える
        const cachedTemple = (!useBusStops && mode!=='bus')
          ? temples.find(t=>t.no===Math.max(fromNo,toNo))
          : null;
        const { elevations, distances } = await fetchElevationProfile(walkOnlyCoords, cachedTemple);
        if(myToken !== mapReqToken) return;
        const { gain, loss } = elevationGainLoss(elevations);
        const climb = findBiggestClimb(elevations, distances);

        let climbText = '';
        if(climb.gain >= 20){ // 20m未満の小さな起伏は「最大の上り」として案内しない
          const startKm = (distances[climb.startIdx]/1000).toFixed(1);
          const endKm = (distances[climb.endIdx]/1000).toFixed(1);
          const lengthKm = ((distances[climb.endIdx]-distances[climb.startIdx])/1000).toFixed(1);
          climbText = t('elevation_climb', startKm, endKm, lengthKm, Math.round(climb.gain));
        }
        const svg = buildElevationSvg(elevations, distances);

        elevationNote = `<br><span style="color:#5a564f;">${t('elevation_stats', gain, loss)}　${climbText}</span>${svg}`;
      }catch(e){
        console.warn('elevation fetch failed', e);
      }
    }

    let landmarksOk = false, landmarks = [], lmErr = null;
    try{
      landmarks = await fetchLandmarks(allCoords);
      if(myToken !== mapReqToken) return;
      landmarksOk = true;
      // 出発・到着の札所自体は既に大きいピンで表示済みなので、目印一覧からは除外する
      landmarks = landmarks.filter(lm =>
        metersBetween(lm.lat, lm.lng, from.lat, from.lng) > 60 &&
        metersBetween(lm.lat, lm.lng, to.lat, to.lng) > 60
      );
      landmarks.forEach(addLandmarkMarker);
    }catch(e){
      lmErr = e.message;
    }

    const routeNote = routeOk
      ? (useBusStops ? t('route_shown_bus') : t('route_shown_direct'))
      : `<span style="color:#A63A2A;">${t('route_fail', routeErr)}</span>`;
    const lmNote = landmarksOk
      ? (landmarks.length ? t('landmarks_found', landmarks.length, landmarks.map(l=>{
          const label = landmarkLabel(l.tags);
          // トイレ・自販機など固有名称が無いものは name===label になるため、括弧書きの重複を避ける
          return l.name === label ? l.name : `${l.name}(${label})`;
        }).join(currentLang==='en' ? ', ' : '、'))
                           : t('landmarks_none'))
      : `<span style="color:#A63A2A;">${t('landmarks_fail', lmErr)}</span>`;

    document.getElementById('mapFoot').innerHTML =
      `<span class="badge-mode ${mode}">${mode==='bus'?'BUS':'WALK'}</span>${note}<br>
       <span style="color:#5a564f;">${routeNote}</span>${elevationNote}<br>
       <span style="color:#5a564f;">${lmNote}</span><br>
       <span style="color:#b0aa9c;font-size:10.5px;">Landmark data: &copy; OpenStreetMap contributors (ODbL)</span>`;
  }, 60);
}

function closeMap(){
  document.getElementById('mapOverlay').classList.remove('open');
}
