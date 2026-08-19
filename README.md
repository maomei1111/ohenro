# GTFS実データ統合 — 進め方

四国八十八ヶ所遍路バス経路プランナー用に、四国4県のバス事業者・自治体が公開する
GTFS-JPデータを取り込んで、`src/query-next-bus.ts` の経路検索と札所⇔バス停の
紐付け（`temple_stop_links`）に使っている。

## 1. 現在取り込み済みの事業者（50事業者）

`agency_key` はフロントエンド `src/public/index.html` の `AGENCY_NAMES` および
`src/public/credits.html` のクレジット表記と対応させている。新しい事業者を
追加する際は、この3箇所（DB取り込み・`AGENCY_NAMES`・`credits.html`）をセットで
更新すること。

| agency_key | 事業者名 | 都道府県 |
|---|---|---|
| tokushimabus | 徳島バス | 徳島県 |
| tokushima_city | 徳島市交通局 | 徳島県 |
| tokushima_anan | 徳島バス阿南 | 徳島県 |
| tokushima_nanbu | 徳島バス南部 | 徳島県 |
| yonkoh | 四国交通 | 徳島県 |
| kaiyocho | 海陽町営バス | 徳島県 |
| kamiyamacho | 神山町コミュニティバス | 徳島県 |
| mima | 美馬市コミュニティバス | 徳島県 |
| naruto | 鳴門市地域バス | 徳島県 |
| miyoshi | 三好市営バス | 徳島県 |
| nakatown | 那賀町営バス | 徳島県 |
| kamihachiman | 上八万コミュニティバス | 徳島県 |
| tsurugitown | つるぎ町コミュニティバス | 徳島県 |
| minamitown_hospital | 美波病院連絡バス | 徳島県 |
| kamikatsutown | 上勝町営バス | 徳島県 |
| yoshinogawacity | 吉野川市代替バス | 徳島県 |
| higashimiyoshitown | 東みよし町町営バス | 徳島県 |
| matsushigetown | 松茂町地域コミュニティバス | 徳島県 |
| murotocity | 室戸市営バス「むろはぴ号」 | 高知県 |
| yasudatown | 安田町「やすら号」 | 高知県 |
| konancity | 香南市営バス | 高知県 |
| nankokucity | 南国市「NACOバス」 | 高知県 |
| tosaden | とさでん交通 | 高知県 |
| myyubus | MY遊バス | 高知県 |
| tosacity | 土佐市「ドラゴンバス」 | 高知県 |
| shimantocity | 四万十市営バス | 高知県 |
| shimantotown | 四万十町コミュニティバス | 高知県 |
| sukumo_yururin / sukumo_hana | 宿毛市（ゆるりんバス／はなちゃんバス） | 高知県 |
| tosashimizucity | 土佐清水市デマンド交通「おでかけ号」 | 高知県 |
| kochi_seinan_kotsu | 高知西南交通 | 高知県 |
| kotoden | ことでんバス | 香川県 |
| mitoyo | 三豊市コミュニティバス | 香川県 |
| sanuki | さぬき市バス | 香川県 |
| kotosan_sakaide / kotosan_seiline | 琴参バス | 香川県 |
| kanonji | 観音寺市のりあいバス | 香川県 |
| takamatsu | 高松市コミュニティバス | 香川県 |
| zentsuji | 善通寺市コミュニティバス | 香川県 |
| iyo | 伊予市コミュニティバス「あいくる」 | 愛媛県 |
| iyotetsu_bus | 伊予鉄バス | 愛媛県 |
| ozu | 大洲市内循環バス「ぐるりんおおず」 | 愛媛県 |
| kumakogen | 久万高原町コミュニティバス | 愛媛県 |
| uchiko | 内子町コミュニティバス | 愛媛県 |
| uwajima | 宇和島市コミュニティバス | 愛媛県 |
| shikokuchuo | 四国中央市コミュニティバス | 愛媛県 |
| kitagawamura | 北川村コミュニティバス | 高知県 |
| ochicho | 越知町コミュニティバス | 高知県 |
| tanocho | 田野町コミュニティバス | 高知県 |
| tonosho | 土庄町コミュニティバス | 香川県 |

各事業者のGTFS-JP公開元は、徳島県は徳島県オープンデータポータル
（`https://opendata.pref.tokushima.lg.jp/`）、その他多くは公共交通オープンデータ
センター（`https://api.gtfs-data.jp/v2/organizations/{組織スラッグ}/feeds/{フィード名}/files/feed.zip`
形式）で公開されている。事業者ごとの実際のURLは各自治体・事業者の公式サイトの
「オープンデータ」「GTFS」ページから確認するのが確実（データセット一覧ページは
JavaScript描画のことが多く、機械的な網羅取得はしづらい）。

## 2. セットアップ

```bash
npm install
```

PostgreSQLの接続情報は環境変数で指定する。ローカル開発時は個別変数
（未設定時はlocalhost想定）、クラウド（Railway等）では `DATABASE_URL` 1本:
```
PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
# または
DATABASE_URL
```

## 3. 実行順序

```bash
# 1) GTFSデータの取り込み（事業者ごとに実行。zipは downloads/ に配置）
npx tsx src/import-gtfs.ts ./downloads/tokushimabus.zip tokushimabus
npx tsx src/import-gtfs.ts ./downloads/yonkoh.zip yonkoh
# ...事業者の数だけ繰り返す（agency_keyは上表と一致させる）

# 2) 札所と最寄り停留所の紐付け（既存事業者を追加・更新した後は必ず再実行）
npx tsx src/match-temple-stops.ts

# 3) 札所⇔バス停の徒歩ルートを事前計算（Directions API、リファラー制限なしのキーが必要）
$env:GOOGLE_MAPS_API_KEY="..."
npx tsx src/precompute-stop-walk-routes.ts

# 4) 動作確認（例: 4番→5番、9:00以降の次の便）
npx tsx src/query-next-bus.ts 4 5 09:00
```

`match-temple-stops.ts` は実行のたびに対象札所の既存リンクを削除してから
作り直す仕様のため、実行後は `precompute-stop-walk-routes.ts` の再実行も必要
（既存の徒歩ルートキャッシュが失われるため）。ただしキャッシュが無くても
アプリ側はその場でDirections APIを呼ぶフォールバックがあるので機能自体は壊れない。

## 4. アプリ側との接続

`src/server.ts` が `findNextBus()`（`src/query-next-bus.ts`）を呼び出すAPIサーバーで、
`GET /next-bus?from=<札所番号>&to=<札所番号>&time=HH:MM&date=YYYY-MM-DD` を提供する。
`src/public/index.html` はこのAPIをfetchして経路を表示する（実装済み・完了）。

## 5. 実装済みの機能

- calendar.txt / calendar_dates.txt（祝日・特定日の運休/増便）に対応済み
- fare_attributes.txt / fare_rules.txt（運賃）に対応済み、運賃額を経路結果に付与
- shapes.txt（実際の走行経路）に対応済み、地図に実経路を描画
- 同一事業者内での乗り換え1回まで対応（事業者をまたぐ乗り換えは非対応。理由は
  `src/query-next-bus.ts` のコメント参照）

## 6. 残タスク・既知の制約

- **札所⇔バス停の紐付けは直線距離1.5km以内・上位3件をベース**：現状88札所中
  約6割強のみ紐付いている。未紐付けの札所は主に以下の理由による:
  - 実際に山岳部・僻地でバスアクセスが現実的に無い（例: 60番横峰寺、66番雲辺寺
    〈主要アクセスはロープウェイ〉、45番岩屋寺、77番道隆寺〈多度津町はデマンド
    交通のみ〉）
  - 最寄り停留所は存在するが1.5kmをわずかに超えている（7,11,12,20,27,34,46,65,
    81,82,85番など。1.6〜2.6km圏内に実在の停留所はあるため、閾値の調整や
    個別対応で救える可能性がある）
  - 事業者・路線は実在するがGTFS-JP自体が非公開、またはデマンド型で通常の
    GTFS形式に馴染まない（今治市周辺〈54〜59番〉、愛南町〈40番〉、西予市
    〈43番〉、阿波市「あわめぐり」〈8,9,10番〉など。今治市・愛南町・西予市は
    今後GTFS-Flex等の形で公開される可能性があるため定期的な再確認が望ましい）
- **停留所マッチングは直線距離ベース**：実際の徒歩経路とは誤差があるため、
  OSRM等の実距離で上書きする方がより正確。
- **徒歩ルート事前計算（`precompute-stop-walk-routes.ts`）にはリファラー制限
  なしのGoogle Maps APIキーが必要**：ブラウザ用のリファラー制限付きキーでは
  `REQUEST_DENIED` になる。
