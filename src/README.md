# GTFS実データ統合 — 進め方

## 1. データ取得
以下から対象事業者のGTFS ZIPをダウンロードする。

- 徳島市交通局: https://opendata.pref.tokushima.lg.jp/dataset/2649.html
- 四国交通: https://opendata.pref.tokushima.lg.jp/dataset/2651.html
  （URLは事業者側の更新で変わることがあるため、最新は四国交通公式サイトの
   お知らせ https://yonkoh.co.jp/archives/info-cat/gtfsjp も確認）

## 2. セットアップ

```bash
npm install typeorm pg adm-zip csv-parse
npm install -D @types/adm-zip ts-node typescript
```

PostgreSQLの接続情報は環境変数で指定（未設定時はlocalhost想定）:
```
PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
```

## 3. 実行順序

```bash
# 1) GTFSデータの取り込み（事業者ごとに実行）
npx ts-node src/import-gtfs.ts ./downloads/tokushima_city.zip tokushima_city
npx ts-node src/import-gtfs.ts ./downloads/yonkoh.zip yonkoh

# 2) 札所と最寄り停留所の紐付け
npx ts-node src/match-temple-stops.ts

# 3) 動作確認（例: 4番→5番、9:00以降の次の便）
npx ts-node src/query-next-bus.ts 4 5 09:00
```

## 4. アプリ側との接続

`ohenro_route_planner.html` 内でハードコードしていた `bus.departures` 配列を、
`findNextBus()` を呼び出す簡易APIサーバ（Express等）経由の結果に置き換える。
WebViewからのfetch先をこの自前APIに向ける形。

## 5. 残タスク・注意点

- **calendar_dates.txt 未対応**：祝日・特定日の運休/増便はこのファイルで
  上書きされる。正確な祝日対応には取り込みが必要。
- **運賃情報（fare_attributes.txt / fare_rules.txt）は未取り込み**：
  現金/ICカード案内を出すなら追加対応が必要。
- **停留所マッチングは直線距離ベース**：実際の徒歩経路とは誤差があるため、
  OSRMのdistance結果で上書きする方がより正確。
- **四国交通・徳島市交通局以外の路線が絡む区間**：現状は2事業者のみ対応。
  ことでんバス等、他エリアへの展開時は agency_key を追加するだけで
  スキーマ変更なしに拡張できる設計にしてある。
