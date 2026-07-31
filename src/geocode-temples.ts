/**
 * 四国八十八ヶ所、全88札所の緯度経度をNominatim(OpenStreetMap)で一括取得する。
 *
 * ※以前は国土地理院APIを使っていたが、住所検索専用のため寺院名を認識できず、
 *   多くの札所で市役所・役場の座標が誤って返ってくる問題が発覚したため、
 *   施設名(POI)検索に強いNominatimに切り替えた。
 *
 * Nominatimの利用ポリシー: 1秒1リクエストまで、User-Agent必須、商用等の大量利用は自前ホスト推奨。
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * 使い方: npx tsx src/geocode-temples.ts
 * 出力  : temples_88.json （札所番号・名前・都道府県・市区町村・緯度経度）
 *
 * 注意:
 *  - OSM上に寺院として登録されていない札所は見つからない場合がある。
 *    その場合は failed リストに出るので、地図で目視して手動で座標を補う。
 *  - 結果は出力後に必ず地図で目視確認することを推奨（特に同名の札所や山間部）。
 */

interface TempleSeed {
  no: number;
  name: string;
  pref: string;
  city: string;
}

// 札所番号・名前・都道府県・市区町村（ジオコーディングの曖昧さ解消用）
const temples: TempleSeed[] = [
  { no: 1, name: '霊山寺', pref: '徳島県', city: '鳴門市' },
  { no: 2, name: '極楽寺', pref: '徳島県', city: '鳴門市' },
  { no: 3, name: '金泉寺', pref: '徳島県', city: '板野郡板野町' },
  { no: 4, name: '大日寺', pref: '徳島県', city: '板野郡板野町' },
  { no: 5, name: '地蔵寺', pref: '徳島県', city: '板野郡板野町' },
  { no: 6, name: '安楽寺', pref: '徳島県', city: '板野郡上板町' },
  { no: 7, name: '十楽寺', pref: '徳島県', city: '阿波市' },
  { no: 8, name: '熊谷寺', pref: '徳島県', city: '阿波市' },
  { no: 9, name: '法輪寺', pref: '徳島県', city: '阿波市' },
  { no: 10, name: '切幡寺', pref: '徳島県', city: '阿波市' },
  { no: 11, name: '藤井寺', pref: '徳島県', city: '吉野川市' },
  { no: 12, name: '焼山寺', pref: '徳島県', city: '名西郡神山町' },
  { no: 13, name: '大日寺', pref: '徳島県', city: '徳島市' },
  { no: 14, name: '常楽寺', pref: '徳島県', city: '徳島市' },
  { no: 15, name: '国分寺', pref: '徳島県', city: '徳島市' },
  { no: 16, name: '観音寺', pref: '徳島県', city: '徳島市' },
  { no: 17, name: '井戸寺', pref: '徳島県', city: '徳島市' },
  { no: 18, name: '恩山寺', pref: '徳島県', city: '小松島市' },
  { no: 19, name: '立江寺', pref: '徳島県', city: '小松島市' },
  { no: 20, name: '鶴林寺', pref: '徳島県', city: '勝浦郡勝浦町' },
  { no: 21, name: '太龍寺', pref: '徳島県', city: '阿南市' },
  { no: 22, name: '平等寺', pref: '徳島県', city: '阿南市' },
  { no: 23, name: '薬王寺', pref: '徳島県', city: '海部郡美波町' },
  { no: 24, name: '最御崎寺', pref: '高知県', city: '室戸市' },
  { no: 25, name: '津照寺', pref: '高知県', city: '室戸市' },
  { no: 26, name: '金剛頂寺', pref: '高知県', city: '室戸市' },
  { no: 27, name: '神峯寺', pref: '高知県', city: '安芸郡安田町' },
  { no: 28, name: '大日寺', pref: '高知県', city: '香南市' },
  { no: 29, name: '国分寺', pref: '高知県', city: '南国市' },
  { no: 30, name: '善楽寺', pref: '高知県', city: '高知市' },
  { no: 31, name: '竹林寺', pref: '高知県', city: '高知市' },
  { no: 32, name: '禅師峰寺', pref: '高知県', city: '南国市' },
  { no: 33, name: '雪蹊寺', pref: '高知県', city: '高知市' },
  { no: 34, name: '種間寺', pref: '高知県', city: '高知市' },
  { no: 35, name: '清瀧寺', pref: '高知県', city: '土佐市' },
  { no: 36, name: '青龍寺', pref: '高知県', city: '土佐市' },
  { no: 37, name: '岩本寺', pref: '高知県', city: '四万十市' },
  { no: 38, name: '金剛福寺', pref: '高知県', city: '土佐清水市' },
  { no: 39, name: '延光寺', pref: '高知県', city: '宿毛市' },
  { no: 40, name: '観自在寺', pref: '愛媛県', city: '南宇和郡愛南町' },
  { no: 41, name: '龍光寺', pref: '愛媛県', city: '宇和島市' },
  { no: 42, name: '佛木寺', pref: '愛媛県', city: '宇和島市' },
  { no: 43, name: '明石寺', pref: '愛媛県', city: '西予市' },
  { no: 44, name: '大寶寺', pref: '愛媛県', city: '上浮穴郡久万高原町' },
  { no: 45, name: '岩屋寺', pref: '愛媛県', city: '上浮穴郡久万高原町' },
  { no: 46, name: '浄瑠璃寺', pref: '愛媛県', city: '松山市' },
  { no: 47, name: '八坂寺', pref: '愛媛県', city: '松山市' },
  { no: 48, name: '西林寺', pref: '愛媛県', city: '松山市' },
  { no: 49, name: '浄土寺', pref: '愛媛県', city: '松山市' },
  { no: 50, name: '繁多寺', pref: '愛媛県', city: '松山市' },
  { no: 51, name: '石手寺', pref: '愛媛県', city: '松山市' },
  { no: 52, name: '太山寺', pref: '愛媛県', city: '松山市' },
  { no: 53, name: '円明寺', pref: '愛媛県', city: '松山市' },
  { no: 54, name: '延命寺', pref: '愛媛県', city: '今治市' },
  { no: 55, name: '南光坊', pref: '愛媛県', city: '今治市' },
  { no: 56, name: '泰山寺', pref: '愛媛県', city: '今治市' },
  { no: 57, name: '栄福寺', pref: '愛媛県', city: '今治市' },
  { no: 58, name: '仙遊寺', pref: '愛媛県', city: '今治市' },
  { no: 59, name: '国分寺', pref: '愛媛県', city: '今治市' },
  { no: 60, name: '横峰寺', pref: '愛媛県', city: '西条市' },
  { no: 61, name: '香園寺', pref: '愛媛県', city: '西条市' },
  { no: 62, name: '宝寿寺', pref: '愛媛県', city: '西条市' },
  { no: 63, name: '吉祥寺', pref: '愛媛県', city: '西条市' },
  { no: 64, name: '前神寺', pref: '愛媛県', city: '西条市' },
  { no: 65, name: '三角寺', pref: '愛媛県', city: '四国中央市' },
  { no: 66, name: '雲辺寺', pref: '徳島県', city: '三好市' },
  { no: 67, name: '大興寺', pref: '香川県', city: '三豊市' },
  { no: 68, name: '神恵院', pref: '香川県', city: '観音寺市' },
  { no: 69, name: '観音寺', pref: '香川県', city: '観音寺市' },
  { no: 70, name: '本山寺', pref: '香川県', city: '三豊市' },
  { no: 71, name: '弥谷寺', pref: '香川県', city: '三豊市' },
  { no: 72, name: '曼荼羅寺', pref: '香川県', city: '善通寺市' },
  { no: 73, name: '出釈迦寺', pref: '香川県', city: '善通寺市' },
  { no: 74, name: '甲山寺', pref: '香川県', city: '善通寺市' },
  { no: 75, name: '善通寺', pref: '香川県', city: '善通寺市' },
  { no: 76, name: '金倉寺', pref: '香川県', city: '善通寺市' },
  { no: 77, name: '道隆寺', pref: '香川県', city: '仲多度郡多度津町' },
  { no: 78, name: '郷照寺', pref: '香川県', city: '綾歌郡宇多津町' },
  { no: 79, name: '天皇寺', pref: '香川県', city: '坂出市' },
  { no: 80, name: '国分寺', pref: '香川県', city: '高松市' },
  { no: 81, name: '白峯寺', pref: '香川県', city: '坂出市' },
  { no: 82, name: '根香寺', pref: '香川県', city: '高松市' },
  { no: 83, name: '一宮寺', pref: '香川県', city: '高松市' },
  { no: 84, name: '屋島寺', pref: '香川県', city: '高松市' },
  { no: 85, name: '八栗寺', pref: '香川県', city: '高松市' },
  { no: 86, name: '志度寺', pref: '香川県', city: 'さぬき市' },
  { no: 87, name: '長尾寺', pref: '香川県', city: 'さぬき市' },
  { no: 88, name: '大窪寺', pref: '香川県', city: 'さぬき市' },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocode(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=jp`;
  const res = await fetch(url, {
    headers: {
      // Nominatimの利用ポリシーでUser-Agent必須
      'User-Agent': 'ohenro-route-planner-geocoding/1.0 (personal project; contact: dev)',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), displayName: data[0].display_name };
}

// 「市役所」「町役場」「村役場」に一致してしまっている疑いのある結果を検出する簡易チェック
function looksLikeCityOffice(displayName: string): boolean {
  return /市役所|町役場|村役場|支所/.test(displayName);
}

async function main() {
  const results: any[] = [];
  const failed: any[] = [];
  const suspicious: any[] = [];

  for (const t of temples) {
    // 寺院名だけで検索し、都道府県・市区町村は補助的なヒントとして付与
    const query = `${t.name}, ${t.city}, ${t.pref}, Japan`;
    process.stdout.write(`[${t.no}番] ${query} を検索中... `);
    try {
      const geo = await geocode(query);
      if (geo) {
        results.push({ no: t.no, name: t.name, pref: t.pref, city: t.city, lat: geo.lat, lng: geo.lng });
        console.log(`→ ${geo.lat}, ${geo.lng}`);
        if (looksLikeCityOffice(geo.displayName)) {
          suspicious.push({ ...t, displayName: geo.displayName });
          console.log(`  ⚠ 市役所/役場らしき結果です: ${geo.displayName}`);
        }
      } else {
        failed.push(t);
        console.log('→ 見つかりませんでした');
      }
    } catch (e) {
      failed.push(t);
      console.log(`→ エラー: ${(e as Error).message}`);
    }
    await sleep(1100); // Nominatimの利用ポリシー(1秒1リクエスト)を守るため余裕をもって間隔を空ける
  }

  const fs = await import('fs');
  fs.writeFileSync('temples_88.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n完了: ${results.length}件成功 / ${failed.length}件失敗 / ${suspicious.length}件は市役所等の疑いあり`);
  if (failed.length) {
    console.log('見つからなかった札所（手動で座標を補う必要あり）:');
    failed.forEach((t) => console.log(`  ${t.no}番 ${t.name}（${t.pref}${t.city}）`));
  }
  if (suspicious.length) {
    console.log('市役所/役場らしき結果が出た札所（要目視確認）:');
    suspicious.forEach((t) => console.log(`  ${t.no}番 ${t.name}: ${t.displayName}`));
  }
  console.log('→ temples_88.json に保存しました');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});