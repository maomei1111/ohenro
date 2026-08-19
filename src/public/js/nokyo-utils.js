// index.htmlから切り出した納経時間まわりの純粋関数。
// ブラウザ(<script>タグ)とNode(Vitest等)の両方から使えるUMD形式。
// 文言(t())はi18n側の責務のままとし、ここでは数値計算だけを扱う。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OhenroApp = root.OhenroApp || {};
    Object.assign(root.OhenroApp, factory());
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // renderResult()内のnokyoOver/nokyoDiff計算をそのまま切り出したもの。
  // closeMin(納経所の受付終了時刻、分単位)に対して、到着時刻arrivalMinが
  // 何分前/後かを判定する。showCountdownは「終了30分前以内」の表示条件。
  function nokyoStatus(arrivalMin, closeMin){
    const over = arrivalMin > closeMin;
    const diffMin = closeMin - arrivalMin; // 正=まだ余裕あり、負=超過
    const showCountdown = !over && diffMin <= 30;
    return { over, diffMin, showCountdown };
  }

  // formatDurationMinutes()内の分岐条件(60分未満か以上か)をそのまま切り出したもの。
  function durationParts(minutes){
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if(value < 60) return { isHours: false, hours: 0, minutes: value, value };
    return { isHours: true, hours: Math.floor(value / 60), minutes: value % 60, value };
  }

  return { nokyoStatus, durationParts };
});
