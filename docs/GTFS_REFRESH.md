# バス時刻データ（GTFS）の更新手順

## 1. 背景

GTFS-JPの `calendar.txt` には運行の**有効期間**（`start_date`〜`end_date`）があり、事業者は通常1年前後で
データを更新する。期限が過ぎた事業者は、経路検索から静かに「バスなし」になる（エラーにはならない）。
そのため、取り込み済みのデータを定期的に点検し、期限切れ・まもなく期限切れの事業者を更新する必要がある。

2026-09-26の点検では、取り込み済み50事業者のうち21社が期限切れ、7社が1週間以内に期限切れだった。

## 2. 点検（読み取りのみ）

```bash
# 本番DBへは、Railwayの Postgres サービスの DATABASE_PUBLIC_URL を DATABASE_URL に設定して実行する
npm run gtfs:check              # 期限切れと、30日以内に期限が切れる事業者を表示
npm run gtfs:check -- --days=60
```

**月に1回**は実行し、期限切れ・期限が近い事業者があれば次節の手順で更新する。

## 3. 更新手順

1. **最新フィードを探す。** 公共交通オープンデータセンター（gtfs-data.jp）の一覧に、各フィードの
   最新の有効期間（`latest_feed_start_date` / `latest_feed_end_date`）と、廃止フラグ
   （`feed_is_discontinued`）がある。
   ```bash
   curl -s https://api.gtfs-data.jp/v2/feeds -o feeds.json   # 全フィードの一覧(JSON)
   # 最新のZIP:
   #   https://api.gtfs-data.jp/v2/organizations/{organization_id}/feeds/{feed_id}/files/feed.zip
   ```
   公開元の有効期間が既に切れているフィードは、取り込んでも意味がない（下記5節）。
2. **ダウンロード** して `downloads/` に置く（`downloads/` は `.gitignore` 対象）。
3. **取り込み**（事業者ごと。既存データを置き換える）:
   ```bash
   npx tsx src/import-gtfs.ts ./downloads/new_naruto.zip naruto
   ```
   - その事業者の既存データを削除してから入れ直す。**1つのトランザクション**なので、途中で失敗した場合は
     元のデータのまま何も変わらない。
   - フィードが期限切れ、または `stops/trips/stop_times` のいずれかが空の場合は、DBに触れず中止する。
     期限切れを意図的に取り込む場合だけ `--allow-expired` を付ける。
   - 事業者が別の `agency_key` になる（停留所IDが体系ごと変わる）ことは珍しくない。取り込み前に、
     旧データと停留所名が共通しているかで、同じ事業者のフィードか確認するとよい。
4. **札所との紐付けを作り直す**（全札所。期限切れ事業者は既定で対象外）:
   ```bash
   npx tsx src/match-temple-stops.ts
   ```
   札所ごとの入れ替えは1つのトランザクションで行うため、稼働中のアプリの検索に「リンクなし」の状態は見えない。
5. **確認する。** `npm run gtfs:check` で期限を確認し、本番の `/next-bus`（例:
   `/next-bus?from=1&to=2&time=10:00&date=YYYY-MM-DD`）で、対象事業者の区間にバスが出ることを確認する。
6. 事業者名・ライセンス表記が変わった場合は `src/public/credits.html` も更新する。

## 4. agency_key と公開元の対応（2026-09-26時点で確認できたもの）

| agency_key | 公開元（gtfs-data.jp の `organization_id/feed_id`） | 有効期間（公開元の最新） |
|---|---|---|
| naruto | narutocity/narutocitychiikibus | 2026-04-07 〜 2027-04-06 |
| tanocho | tanotown/GTFS-Tanotown_Bus | 2026-09-01 〜 2027-10-01 |
| kitagawamura | kitagawavillage/GTFS-Kitagawavill_Bus | 2026-04-01 〜 2027-03-31 |
| kaiyocho | kaiyotown/kaiyotownbus | 2026-04-01 〜 2027-03-31 |
| mitoyo | mitoyocity/mitoyocommunitybus | 2026-04-01 〜 2027-03-31 |

上の5社は2026-09-26に最新版へ置き換え済み。

## 5. 期限切れのまま残っている事業者（2026-09-26時点）

公開元にも最新版が見つからなかった、または入手に別の手続きが必要なもの。調査は
gtfs-data.jp の全フィード一覧、香川県・愛媛県・徳島県のオープンデータポータルの検索で行った。
「見当たらない」は調査した範囲での結果で、他の公開元がある可能性は残る。

| agency_key | 事業者 | 状況 |
|---|---|---|
| kamikatsutown | 上勝町営バス | 公開元の最新も 2026-03-31 で期限切れ |
| minamitown_hospital | 美波病院連絡バス | 公開元の最新も 2026-03-20 で期限切れ |
| tokushima_anan | 徳島バス阿南 | 廃止（2023-10に徳島バスと合併）。徳島バスのデータに統合済みのため、削除してよい |
| kotosan_seiline | 琴参バス | 公開元（琴平路線・丸亀コミュニティバス）の最新は 2026-09-30 まで。西讃線に相当するフィードは未確認 |
| iyotetsu_bus | 伊予鉄バス | 公共交通オープンデータセンター（ODPT）で公開。ダウンロードには開発者登録（キー）が必要。ライセンスは「公共交通オープンデータ基本ライセンス」 |
| iyo | 伊予市 | 公開元の最新も 2025-03-31 で期限切れ |
| kumakogen | 久万高原町 | 公開元の最新も 2025-03-31 で期限切れ |
| uchiko | 内子町 | 公開元の最新も 2026-05-31 で期限切れ |
| uwajima | 宇和島市 | 最新版が見当たらない |
| shikokuchuo | 四国中央市 | 最新版が見当たらない |
| takamatsu | 高松市コミュニティバス | 最新版が見当たらない |
| zentsuji | 善通寺市 | 最新版が見当たらない |
| tonosho | 土庄町 | 最新版が見当たらない（香川県ポータルの小豆島オリーブバスは2022年更新） |
| mima | 美馬市 | 最新版が見当たらない |
| kamiyamacho | 神山町 | 最新版が見当たらない |
| ochicho | 越知町 | 最新版が見当たらない |

これらは、公開元が更新するか、別の入手先が見つかるまで「バスなし」のまま（徒歩で計算される）。
公開元の更新は `curl -s https://api.gtfs-data.jp/v2/feeds` の `latest_feed_end_date` などで定期的に確認する。

## 6. 注意

- 本番DBを直接操作する作業になる。取り込み前に、対象事業者の件数と `temple_stop_links` の内容を控えておく。
- `match-temple-stops.ts` は札所ごとに上位3件の停留所を選ぶ。同じ札所の近くに同じ事業者の停留所が複数
  あると、他の事業者の停留所が候補から漏れることがある（事業者ごとに上位を取る変更は未実施）。
