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
    if(n < 100){
      const tens = Math.floor(n/10);
      const ones = n%10;
      return `${tens===1?'':digits[tens]}十${ones?digits[ones]:''}`;
    }
    // 3桁(100以上)。和暦の年数が三桁に達するケース(例: 令和百年)向け。
    // "一百"ではなく"百"、"一千"ではなく"千"のように先頭の1は省略する慣習に合わせる。
    const hundreds = Math.floor(n/100);
    const rest = n%100;
    const hundredsText = `${hundreds===1?'':digits[hundreds]}百`;
    return rest ? hundredsText + toKanjiNumber(rest) : hundredsText;
  }

  // 御朱印の縦書き日付表示が、長い和暦文字列で表示領域からはみ出さないようにする
  // ためのCSSクラス名を返す(境界値は仕様書 docs/CSS_AND_SERVER_PROTECTION_SPEC.md 23節)。
  // 空白を除いた文字数のみで判定する純粋関数。
  function warekiDateLengthClass(text){
    const length = String(text ?? '').replace(/\s/g, '').length;
    if(length >= 12) return 'goshuin-date-extra-long';
    if(length >= 10) return 'goshuin-date-long';
    return '';
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

  return { toKanjiNumber, getWarekiDate, toMinutes, toHHMM, warekiDateLengthClass };
});
