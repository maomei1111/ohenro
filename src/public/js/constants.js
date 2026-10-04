// index.htmlから切り出した静的定数・辞書。
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

const TEMPLE_NAMES_EN = {
  1:'Ryozenji', 2:'Gokurakuji', 3:'Konsenji', 4:'Dainichiji', 5:'Jizoji', 6:'Anrakuji',
  7:'Jurakuji', 8:'Kumadaniji', 9:'Horinji', 10:'Kirihataji', 11:'Fujiidera', 12:'Shosanji',
  13:'Dainichiji', 14:'Jorakuji', 15:'Kokubunji', 16:'Kannonji', 17:'Idoji', 18:'Onzanji',
  19:'Tatsueji', 20:'Kakurinji', 21:'Tairyuji', 22:'Byodoji', 23:'Yakuoji', 24:'Hotsumisakiji',
  25:'Shinshoji', 26:'Kongochoji', 27:'Kounomineji', 28:'Dainichiji', 29:'Kokubunji', 30:'Zenrakuji',
  31:'Chikurinji', 32:'Zenjibuji', 33:'Sekkeiji', 34:'Tanemaji', 35:'Kiyotakiji', 36:'Shoryuji',
  37:'Iwamotoji', 38:'Kongofukuji', 39:'Enkoji', 40:'Kanjizaiji', 41:'Ryukoji', 42:'Butsumokuji',
  43:'Meisekiji', 44:'Daihoji', 45:'Iwayaji', 46:'Jorurinji', 47:'Yasakaji', 48:'Sairinji',
  49:'Jodoji', 50:'Hantaji', 51:'Ishiteji', 52:'Taisanji', 53:'Enmyoji', 54:'Enmeiji',
  55:'Nankobo', 56:'Taisanji', 57:'Eifukuji', 58:'Senyuji', 59:'Kokubunji', 60:'Yokomineji',
  61:'Kouonji', 62:'Hojuji', 63:'Kichijoji', 64:'Maegamiji', 65:'Sankakuji', 66:'Unpenji',
  67:'Daikoji', 68:'Jinneiin', 69:'Kannonji', 70:'Motoyamaji', 71:'Iyadaniji', 72:'Mandaraji',
  73:'Shusshakaji', 74:'Koyamaji', 75:'Zentsuji', 76:'Konzoji', 77:'Doryuji', 78:'Goshoji',
  79:'Tennoji', 80:'Kokubunji', 81:'Shiromineji', 82:'Negoroji', 83:'Ichinomiyaji', 84:'Yashimaji',
  85:'Yakuriji', 86:'Shidoji', 87:'Nagaoji', 88:'Okuboji',
};

const ROMANIZED_LANGS = ['en', 'de', 'pt'];

// 韓国語の札所名(ハングル表記)。国立国語院の日本語表記法に沿い、長音は表記しない。
const TEMPLE_NAMES_KO = {
  1:'료젠지', 2:'고쿠라쿠지', 3:'곤센지', 4:'다이니치지', 5:'지조지', 6:'안라쿠지',
  7:'주라쿠지', 8:'구마다니지', 9:'호린지', 10:'기리하타지', 11:'후지이데라', 12:'쇼산지',
  13:'다이니치지', 14:'조라쿠지', 15:'고쿠분지', 16:'간온지', 17:'이도지', 18:'온잔지',
  19:'다쓰에지', 20:'가쿠린지', 21:'다이류지', 22:'뵤도지', 23:'야쿠오지', 24:'호쓰미사키지',
  25:'신쇼지', 26:'곤고초지', 27:'고노미네지', 28:'다이니치지', 29:'고쿠분지', 30:'젠라쿠지',
  31:'지쿠린지', 32:'젠지부지', 33:'셋케이지', 34:'다네마지', 35:'기요타키지', 36:'쇼류지',
  37:'이와모토지', 38:'곤고후쿠지', 39:'엔코지', 40:'간지자이지', 41:'류코지', 42:'부쓰모쿠지',
  43:'메이세키지', 44:'다이호지', 45:'이와야지', 46:'조루리지', 47:'야사카지', 48:'사이린지',
  49:'조도지', 50:'한타지', 51:'이시테지', 52:'다이산지', 53:'엔묘지', 54:'엔메이지',
  55:'난코보', 56:'다이산지', 57:'에이후쿠지', 58:'센유지', 59:'고쿠분지', 60:'요코미네지',
  61:'고온지', 62:'호주지', 63:'기치조지', 64:'마에가미지', 65:'산카쿠지', 66:'운펜지',
  67:'다이코지', 68:'진네인', 69:'간논지', 70:'모토야마지', 71:'이야다니지', 72:'만다라지',
  73:'슛샤카지', 74:'고야마지', 75:'젠쓰지', 76:'곤조지', 77:'도류지', 78:'고쇼지',
  79:'덴노지', 80:'고쿠분지', 81:'시로미네지', 82:'네고로지', 83:'이치노미야지', 84:'야시마지',
  85:'야쿠리지', 86:'시도지', 87:'나가오지', 88:'오쿠보지',
};

// 中国語の札所名。日本の新字体を、簡体字・繁体字それぞれの字体に直したもの。
const TEMPLE_NAMES_ZH_CN = {
  1:'灵山寺', 2:'极乐寺', 3:'金泉寺', 4:'大日寺', 5:'地藏寺', 6:'安乐寺',
  7:'十乐寺', 8:'熊谷寺', 9:'法轮寺', 10:'切幡寺', 11:'藤井寺', 12:'烧山寺',
  13:'大日寺', 14:'常乐寺', 15:'国分寺', 16:'观音寺', 17:'井户寺', 18:'恩山寺',
  19:'立江寺', 20:'鹤林寺', 21:'太龙寺', 22:'平等寺', 23:'药王寺', 24:'最御崎寺',
  25:'津照寺', 26:'金刚顶寺', 27:'神峰寺', 28:'大日寺', 29:'国分寺', 30:'善乐寺',
  31:'竹林寺', 32:'禅师峰寺', 33:'雪蹊寺', 34:'种间寺', 35:'清泷寺', 36:'青龙寺',
  37:'岩本寺', 38:'金刚福寺', 39:'延光寺', 40:'观自在寺', 41:'龙光寺', 42:'佛木寺',
  43:'明石寺', 44:'大宝寺', 45:'岩屋寺', 46:'净瑠璃寺', 47:'八坂寺', 48:'西林寺',
  49:'净土寺', 50:'繁多寺', 51:'石手寺', 52:'太山寺', 53:'圆明寺', 54:'延命寺',
  55:'南光坊', 56:'泰山寺', 57:'荣福寺', 58:'仙游寺', 59:'国分寺', 60:'横峰寺',
  61:'香园寺', 62:'宝寿寺', 63:'吉祥寺', 64:'前神寺', 65:'三角寺', 66:'云边寺',
  67:'大兴寺', 68:'神惠院', 69:'观音寺', 70:'本山寺', 71:'弥谷寺', 72:'曼荼罗寺',
  73:'出释迦寺', 74:'甲山寺', 75:'善通寺', 76:'金仓寺', 77:'道隆寺', 78:'乡照寺',
  79:'天皇寺', 80:'国分寺', 81:'白峰寺', 82:'根香寺', 83:'一宫寺', 84:'屋岛寺',
  85:'八栗寺', 86:'志度寺', 87:'长尾寺', 88:'大洼寺',
};

const TEMPLE_NAMES_ZH_TW = {
  1:'靈山寺', 2:'極樂寺', 3:'金泉寺', 4:'大日寺', 5:'地藏寺', 6:'安樂寺',
  7:'十樂寺', 8:'熊谷寺', 9:'法輪寺', 10:'切幡寺', 11:'藤井寺', 12:'燒山寺',
  13:'大日寺', 14:'常樂寺', 15:'國分寺', 16:'觀音寺', 17:'井戶寺', 18:'恩山寺',
  19:'立江寺', 20:'鶴林寺', 21:'太龍寺', 22:'平等寺', 23:'藥王寺', 24:'最御崎寺',
  25:'津照寺', 26:'金剛頂寺', 27:'神峯寺', 28:'大日寺', 29:'國分寺', 30:'善樂寺',
  31:'竹林寺', 32:'禪師峰寺', 33:'雪蹊寺', 34:'種間寺', 35:'清瀧寺', 36:'青龍寺',
  37:'岩本寺', 38:'金剛福寺', 39:'延光寺', 40:'觀自在寺', 41:'龍光寺', 42:'佛木寺',
  43:'明石寺', 44:'大寶寺', 45:'岩屋寺', 46:'淨瑠璃寺', 47:'八坂寺', 48:'西林寺',
  49:'淨土寺', 50:'繁多寺', 51:'石手寺', 52:'太山寺', 53:'圓明寺', 54:'延命寺',
  55:'南光坊', 56:'泰山寺', 57:'榮福寺', 58:'仙遊寺', 59:'國分寺', 60:'橫峰寺',
  61:'香園寺', 62:'寶壽寺', 63:'吉祥寺', 64:'前神寺', 65:'三角寺', 66:'雲邊寺',
  67:'大興寺', 68:'神惠院', 69:'觀音寺', 70:'本山寺', 71:'彌谷寺', 72:'曼荼羅寺',
  73:'出釋迦寺', 74:'甲山寺', 75:'善通寺', 76:'金倉寺', 77:'道隆寺', 78:'鄉照寺',
  79:'天皇寺', 80:'國分寺', 81:'白峯寺', 82:'根香寺', 83:'一宮寺', 84:'屋島寺',
  85:'八栗寺', 86:'志度寺', 87:'長尾寺', 88:'大窪寺',
};

// 表示言語に合わせた札所名を返す(該当が無ければ日本語名)。
function templeNameForLang(no, jaName, lang) {
  if (ROMANIZED_LANGS.includes(lang)) return TEMPLE_NAMES_EN[no] || jaName;
  if (lang === 'ko') return TEMPLE_NAMES_KO[no] || jaName;
  if (lang === 'zh-CN') return TEMPLE_NAMES_ZH_CN[no] || jaName;
  if (lang === 'zh-TW') return TEMPLE_NAMES_ZH_TW[no] || jaName;
  return jaName;
}

// 札所番号の表記(選択肢などで「1番 霊山寺」のように名前の前へ付ける)。
function templeNoPrefix(no, lang) {
  if (ROMANIZED_LANGS.includes(lang)) return `${no}. `;
  if (lang === 'ko') return `${no}번 `;
  return `${no}番 `;
}

// 気象庁の予報区域名(サーバーは日本語で返す)の各言語表記。
const FORECAST_AREA_NAMES = {
  '徳島県': { en:'Tokushima', ko:'도쿠시마현', 'zh-CN':'德岛县', 'zh-TW':'德島縣', de:'Tokushima', pt:'Tokushima' },
  '徳島県北部': { en:'Northern Tokushima', ko:'도쿠시마현 북부', 'zh-CN':'德岛县北部', 'zh-TW':'德島縣北部', de:'Tokushima (Nord)', pt:'Norte de Tokushima' },
  '徳島県南部': { en:'Southern Tokushima', ko:'도쿠시마현 남부', 'zh-CN':'德岛县南部', 'zh-TW':'德島縣南部', de:'Tokushima (Süd)', pt:'Sul de Tokushima' },
  '高知県': { en:'Kochi', ko:'고치현', 'zh-CN':'高知县', 'zh-TW':'高知縣', de:'Kochi', pt:'Kochi' },
  '高知県東部': { en:'Eastern Kochi', ko:'고치현 동부', 'zh-CN':'高知县东部', 'zh-TW':'高知縣東部', de:'Kochi (Ost)', pt:'Leste de Kochi' },
  '高知県中部': { en:'Central Kochi', ko:'고치현 중부', 'zh-CN':'高知县中部', 'zh-TW':'高知縣中部', de:'Kochi (Mitte)', pt:'Centro de Kochi' },
  '高知県西部': { en:'Western Kochi', ko:'고치현 서부', 'zh-CN':'高知县西部', 'zh-TW':'高知縣西部', de:'Kochi (West)', pt:'Oeste de Kochi' },
  '愛媛県': { en:'Ehime', ko:'에히메현', 'zh-CN':'爱媛县', 'zh-TW':'愛媛縣', de:'Ehime', pt:'Ehime' },
  '愛媛県東予': { en:'Toyo, Ehime', ko:'에히메현 도요', 'zh-CN':'爱媛县东予', 'zh-TW':'愛媛縣東予', de:'Ehime (Toyo)', pt:'Toyo, Ehime' },
  '愛媛県中予': { en:'Chuyo, Ehime', ko:'에히메현 주요', 'zh-CN':'爱媛县中予', 'zh-TW':'愛媛縣中予', de:'Ehime (Chuyo)', pt:'Chuyo, Ehime' },
  '愛媛県南予': { en:'Nanyo, Ehime', ko:'에히메현 난요', 'zh-CN':'爱媛县南予', 'zh-TW':'愛媛縣南予', de:'Ehime (Nanyo)', pt:'Nanyo, Ehime' },
  '香川県': { en:'Kagawa', ko:'가가와현', 'zh-CN':'香川县', 'zh-TW':'香川縣', de:'Kagawa', pt:'Kagawa' },
};
function forecastAreaNameForLang(jaName, lang) {
  if (!jaName || lang === 'ja') return jaName;
  const entry = FORECAST_AREA_NAMES[jaName];
  return (entry && entry[lang]) || jaName;
}

const TEMPLE_HONZON = {
  1:'釈迦如来', 2:'阿弥陀如来', 3:'釈迦如来', 4:'大日如来', 5:'延命地蔵・勝軍地蔵菩薩',
  6:'薬師如来', 7:'阿弥陀如来', 8:'千手観世音菩薩', 9:'涅槃釈迦如来', 10:'千手観世音菩薩',
  11:'薬師如来', 12:'虚空蔵菩薩', 13:'十一面観世音菩薩', 14:'弥勒菩薩', 15:'薬師如来',
  16:'千手観世音菩薩', 17:'七仏薬師如来', 18:'薬師如来', 19:'延命地蔵菩薩', 20:'地蔵菩薩',
  21:'虚空蔵菩薩', 22:'薬師如来', 23:'厄除薬師如来', 24:'虚空蔵菩薩', 25:'地蔵菩薩(楫取地蔵)',
  26:'薬師如来', 27:'十一面観世音菩薩', 28:'大日如来', 29:'千手観世音菩薩', 30:'阿弥陀如来',
  31:'文殊菩薩', 32:'十一面観世音菩薩', 33:'薬師如来', 34:'薬師如来', 35:'厄除薬師如来',
  36:'波切不動明王', 37:'不動明王・観世音菩薩・阿弥陀如来・薬師如来・地蔵菩薩(五仏)', 38:'三面千手観世音菩薩', 39:'薬師如来', 40:'薬師如来',
  41:'十一面観世音菩薩', 42:'大日如来', 43:'千手観世音菩薩', 44:'十一面観世音菩薩', 45:'不動明王',
  46:'薬師如来', 47:'阿弥陀如来', 48:'十一面観世音菩薩', 49:'釈迦如来', 50:'薬師如来',
  51:'薬師如来', 52:'十一面観世音菩薩', 53:'阿弥陀如来', 54:'不動明王', 55:'大通智勝如来',
  56:'地蔵菩薩', 57:'阿弥陀如来', 58:'千手観世音菩薩', 59:'薬師瑠璃光如来', 60:'大日如来',
  61:'大日如来', 62:'十一面観世音菩薩', 63:'毘沙門天', 64:'阿弥陀如来', 65:'十一面観世音菩薩',
  66:'千手観世音菩薩', 67:'薬師如来', 68:'阿弥陀如来', 69:'聖観世音菩薩', 70:'馬頭観音',
  71:'千手観世音菩薩', 72:'大日如来', 73:'釈迦如来', 74:'薬師如来', 75:'薬師如来',
  76:'薬師如来', 77:'薬師如来', 78:'阿弥陀如来', 79:'十一面観世音菩薩', 80:'十一面千手観世音菩薩',
  81:'千手観世音菩薩', 82:'千手観世音菩薩', 83:'聖観世音菩薩', 84:'十一面千手観世音菩薩', 85:'聖観世音菩薩',
  86:'十一面観世音菩薩', 87:'聖観世音菩薩', 88:'薬師如来',
};

const HONZON_EN = {
  '釈迦如来':'Shaka Nyorai (Shakyamuni Buddha)',
  '阿弥陀如来':'Amida Nyorai (Amitabha Buddha)',
  '大日如来':'Dainichi Nyorai (Mahavairocana Buddha)',
  '薬師如来':'Yakushi Nyorai (Medicine Buddha)',
  '厄除薬師如来':'Yakuyoke Yakushi Nyorai (Medicine Buddha, ward against misfortune)',
  '七仏薬師如来':'Shichibutsu Yakushi Nyorai (Seven Medicine Buddhas)',
  '薬師瑠璃光如来':'Yakushi Ruriko Nyorai (Medicine Buddha of Lapis Lazuli Light)',
  '十一面観世音菩薩':'Juichimen Kannon (Eleven-Faced Avalokiteshvara)',
  '千手観世音菩薩':'Senju Kannon (Thousand-Armed Avalokiteshvara)',
  '聖観世音菩薩':'Sho Kannon (Avalokiteshvara)',
  '十一面千手観世音菩薩':'Juichimen Senju Kannon (Eleven-Faced Thousand-Armed Avalokiteshvara)',
  '三面千手観世音菩薩':'Sanmen Senju Kannon (Three-Faced Thousand-Armed Avalokiteshvara)',
  '延命地蔵・勝軍地蔵菩薩':'Enmei Jizo & Shogun Jizo Bosatsu',
  '延命地蔵菩薩':'Enmei Jizo Bosatsu',
  '地蔵菩薩':'Jizo Bosatsu',
  '地蔵菩薩(楫取地蔵)':'Jizo Bosatsu (Kajitori Jizo)',
  '弥勒菩薩':'Miroku Bosatsu (Maitreya Bodhisattva)',
  '文殊菩薩':'Monju Bosatsu (Manjushri Bodhisattva)',
  '虚空蔵菩薩':'Kokuzo Bosatsu (Akashagarbha Bodhisattva)',
  '不動明王':'Fudo Myoo (Acala)',
  '波切不動明王':'Namikiri Fudo Myoo (Wave-Cutting Acala)',
  '不動明王・観世音菩薩・阿弥陀如来・薬師如来・地蔵菩薩(五仏)':'Five principal images: Fudo Myoo, Kannon, Amida, Yakushi, and Jizo',
  '涅槃釈迦如来':'Nehan Shaka Nyorai (Reclining/Parinirvana Shakyamuni Buddha)',
  '大通智勝如来':'Daitsuchisho Nyorai',
  '毘沙門天':'Bishamonten (Vaisravana)',
  '馬頭観音':'Bato Kannon (Hayagriva, Horse-Headed Avalokiteshvara)',
};

const MAX_AUTO_START_DISTANCE_M = 50000;

const DATE_FIELD_ORDER = {
  ja: ['year','month','day'], ko: ['year','month','day'],
  'zh-CN': ['year','month','day'], 'zh-TW': ['year','month','day'],
  en: ['month','day','year'], de: ['day','month','year'], pt: ['day','month','year'],
};
// Intl.DateTimeFormat用のロケールコード（currentLangの内部表記とほぼ同じだが明示しておく）
const INTL_LOCALES = { ja:'ja', en:'en', ko:'ko', 'zh-CN':'zh-CN', 'zh-TW':'zh-TW', de:'de', pt:'pt' };

// agency_key(内部識別子)→事業者名（日本語・英語）。GTFS取り込み時に付けたキーと対応させている。
const AGENCY_NAMES = {
  tokushimabus: { ja:'徳島バス', en:'Tokushima Bus' },
  yonkoh: { ja:'四国交通', en:'Yonkoh Bus' },
  murotocity: { ja:'室戸市営バス「むろはぴ号」', en:'Muroto City Bus (Murohapi-go)' },
  yasudatown: { ja:'安田町「やすら号」', en:'Yasuda Town Bus (Yasura-go)' },
  konancity: { ja:'香南市営バス', en:'Konan City Bus' },
  nankokucity: { ja:'南国市「NACOバス」', en:'Nankoku City Bus (NACO Bus)' },
  tosaden: { ja:'とさでん交通', en:'Tosaden Kotsu' },
  myyubus: { ja:'MY遊バス', en:'MY-YU Bus' },
  tosacity: { ja:'土佐市「ドラゴンバス」', en:'Tosa City Bus (Dragon Bus)' },
  shimantocity: { ja:'四万十市営バス', en:'Shimanto City Bus' },
  sukumo_yururin: { ja:'宿毛市「ゆるりんバス」', en:'Sukumo City Bus (Yururin Bus)' },
  sukumo_hana: { ja:'宿毛市「はなちゃんバス」', en:'Sukumo City Bus (Hana-chan Bus)' },
  kotoden: { ja:'ことでんバス', en:'Kotoden Bus' },
  mitoyo: { ja:'三豊市コミュニティバス', en:'Mitoyo City Community Bus' },
  sanuki: { ja:'さぬき市バス', en:'Sanuki City Bus' },
  kotosan_sakaide: { ja:'琴参バス（坂出路線）', en:'Kotosan Bus (Sakaide Line)' },
  ozu: { ja:'大洲市内循環バス「ぐるりんおおず」', en:'Ozu City Loop Bus (Gururin Ozu)' },
  iyo: { ja:'伊予市コミュニティバス「あいくる」', en:'Iyo City Community Bus (Aikuru)' },
  tokushima_city: { ja:'徳島市交通局', en:'Tokushima City Transportation Bureau' },
  iyotetsu_bus: { ja:'伊予鉄バス', en:'Iyotetsu Bus' },
  kaiyocho: { ja:'海陽町営バス', en:'Kaiyo Town Bus' },
  kanonji: { ja:'観音寺市のりあいバス', en:'Kanonji City Noriai Bus' },
  kitagawamura: { ja:'北川村コミュニティバス', en:'Kitagawa Village Community Bus' },
  naruto: { ja:'鳴門市地域バス', en:'Naruto City Community Bus' },
  ochicho: { ja:'越知町コミュニティバス', en:'Ochi Town Community Bus' },
  shikokuchuo: { ja:'四国中央市コミュニティバス', en:'Shikokuchuo City Community Bus' },
  takamatsu: { ja:'高松市コミュニティバス', en:'Takamatsu City Community Bus' },
  tanocho: { ja:'田野町コミュニティバス', en:'Tano Town Community Bus' },
  miyoshi: { ja:'三好市営バス', en:'Miyoshi City Bus' },
  tonosho: { ja:'土庄町コミュニティバス', en:'Tonosho Town Community Bus' },
  uchiko: { ja:'内子町コミュニティバス', en:'Uchiko Town Community Bus' },
  uwajima: { ja:'宇和島市コミュニティバス', en:'Uwajima City Community Bus' },
  zentsuji: { ja:'善通寺市コミュニティバス', en:'Zentsuji City Community Bus' },
  kumakogen: { ja:'久万高原町コミュニティバス', en:'Kumakogen Town Community Bus' },
  shimantotown: { ja:'四万十町コミュニティバス', en:'Shimanto Town Community Bus' },
  tokushima_nanbu: { ja:'徳島バス南部', en:'Tokushima Bus Nanbu' },
  tosashimizucity: { ja:'土佐清水市デマンド交通「おでかけ号」', en:'Tosashimizu City Demand Bus (Odekake-go)' },
  kochi_seinan_kotsu: { ja:'高知西南交通', en:'Kochi Seinan Kotsu' },
  nakatown: { ja:'那賀町営バス', en:'Naka Town Bus' },
  kamihachiman: { ja:'上八万コミュニティバス', en:'Kamihachiman Community Bus' },
  tsurugitown: { ja:'つるぎ町コミュニティバス', en:'Tsurugi Town Community Bus' },
  minamitown_hospital: { ja:'美波病院連絡バス', en:'Minami Town Hospital Shuttle Bus' },
  kamikatsutown: { ja:'上勝町営バス', en:'Kamikatsu Town Bus' },
  yoshinogawacity: { ja:'吉野川市代替バス', en:'Yoshinogawa City Bus' },
  higashimiyoshitown: { ja:'東みよし町町営バス', en:'Higashimiyoshi Town Bus' },
  matsushigetown: { ja:'松茂町地域コミュニティバス', en:'Matsushige Town Community Bus' },
};

  return {
    TEMPLE_NAMES_EN, TEMPLE_NAMES_KO, TEMPLE_NAMES_ZH_CN, TEMPLE_NAMES_ZH_TW, ROMANIZED_LANGS,
    templeNameForLang, templeNoPrefix, FORECAST_AREA_NAMES, forecastAreaNameForLang,
    TEMPLE_HONZON, HONZON_EN,
    MAX_AUTO_START_DISTANCE_M, DATE_FIELD_ORDER, INTL_LOCALES, AGENCY_NAMES,
  };
});
