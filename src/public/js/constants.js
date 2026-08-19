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
  kotosan_seiline: { ja:'琴参バス（坂出瀬居線）', en:'Kotosan Bus (Sakaide-Sei Line)' },
  ozu: { ja:'大洲市内循環バス「ぐるりんおおず」', en:'Ozu City Loop Bus (Gururin Ozu)' },
  iyo: { ja:'伊予市コミュニティバス「あいくる」', en:'Iyo City Community Bus (Aikuru)' },
  tokushima_city: { ja:'徳島市交通局', en:'Tokushima City Transportation Bureau' },
  iyotetsu_bus: { ja:'伊予鉄バス', en:'Iyotetsu Bus' },
  kaiyocho: { ja:'海陽町営バス', en:'Kaiyo Town Bus' },
  kamiyamacho: { ja:'神山町コミュニティバス', en:'Kamiyama Town Community Bus' },
  kanonji: { ja:'観音寺市のりあいバス', en:'Kanonji City Noriai Bus' },
  kitagawamura: { ja:'北川村コミュニティバス', en:'Kitagawa Village Community Bus' },
  mima: { ja:'美馬市コミュニティバス', en:'Mima City Community Bus' },
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
  tokushima_anan: { ja:'徳島バス阿南', en:'Tokushima Bus Anan' },
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
    TEMPLE_NAMES_EN, ROMANIZED_LANGS, TEMPLE_HONZON, HONZON_EN,
    MAX_AUTO_START_DISTANCE_M, DATE_FIELD_ORDER, INTL_LOCALES, AGENCY_NAMES,
  };
});
