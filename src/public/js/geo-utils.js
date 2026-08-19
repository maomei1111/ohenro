// index.htmlから切り出した距離計算まわりの純粋関数。
// ブラウザ(<script>タグ)とNode(Vitest等)の両方から使えるUMD形式。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OhenroApp = root.OhenroApp || {};
    Object.assign(root.OhenroApp, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function metersBetween(lat1, lng1, lat2, lng2){
    const R = 6371000;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLng = (lng2-lng1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function distToPolyline(lat, lng, coords){
    let min = Infinity;
    for(const [clat, clng] of coords){
      const d = metersBetween(lat, lng, clat, clng);
      if(d < min) min = d;
    }
    return min;
  }

  function formatDistance(meters){
    const value = Math.max(0, Math.round(Number(meters) || 0));
    if(value < 1000) return `${value}m`;
    const km = Number((value / 1000).toFixed(1));
    return `${km}km`;
  }

  // 御朱印の現在地チェック(checkTempleProximity)で使っている「取得した位置情報が
  // 御朱印を受け取ってよい距離内か」の判定ロジック。index.html側の挙動を変えずに
  // 切り出したもの。minRadiusM/maxRadiusMはindex.html側の
  // ZUKAN_VISIT_MIN_RADIUS_M(100) / ZUKAN_VISIT_MAX_RADIUS_M(200) に対応する。
  function evaluateVisitProximity({ accuracy, distanceMeters, minRadiusM, maxRadiusM }){
    if(!Number.isFinite(accuracy) || accuracy > maxRadiusM){
      return { ok: false, reason: 'invalid_accuracy', allowedDistance: null };
    }
    const allowedDistance = Math.min(maxRadiusM, Math.max(minRadiusM, accuracy));
    const distance = Math.round(distanceMeters);
    if(distance <= allowedDistance){
      return { ok: true, reason: null, allowedDistance };
    }
    return { ok: false, reason: 'too_far', allowedDistance };
  }

  return { metersBetween, distToPolyline, formatDistance, evaluateVisitProximity };
});
