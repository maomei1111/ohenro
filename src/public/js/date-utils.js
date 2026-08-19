// index.htmlから切り出した和暦変換・時刻変換の純粋関数。
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

  function toKanjiNumber(value){
    const digits = ['〇','一','二','三','四','五','六','七','八','九'];
    const n = Number(value);
    if(n < 10) return digits[n];
    if(n === 10) return '十';
    if(n < 20) return `十${digits[n-10]}`;
    return `${digits[Math.floor(n/10)]}十${n%10 ? digits[n%10] : ''}`;
  }

  // 2019年(1月始まり)以降を令和として扱う。実際の改元は2019年5月1日だが、
  // index.html側の元々のロジックが年単位でしか判定していないため、その挙動を
  // そのまま踏襲している(2019年1〜4月分の平成表記は non-goal)。
  function getWarekiDate(dateStr){
    if(!dateStr) return '';
    const [year,month,day] = dateStr.split('-').map(Number);
    let era = '令和';
    let eraYear = year - 2018;
    if(year < 2019){ era = '平成'; eraYear = year - 1988; }
    const yearText = eraYear === 1 ? '元' : toKanjiNumber(eraYear);
    return `${era}${yearText}年${toKanjiNumber(month)}月${toKanjiNumber(day)}日`;
  }

  function toMinutes(hhmm){
    const [h,m] = hhmm.split(':').map(Number);
    return h*60+m;
  }

  function toHHMM(mins){
    mins = Math.round(mins);
    const h = Math.floor(mins/60)%24;
    const m = mins%60;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }

  return { toKanjiNumber, getWarekiDate, toMinutes, toHHMM };
});
