# 本番リリース作業仕様・チェックリスト

## 1. 目的

「お遍路みちしるべ」をRailway上の本番WebサービスおよびAndroidアプリとして安全に公開し、公開後も障害・料金・データ消失へ対応できる状態にする。

初回リリースではRailwayを継続利用する。利用者が少ない段階で他クラウドへ移行する必要はない。

## 2. 作業区分

本文では各作業を次の記号で区別する。

| 記号 | 担当 | 内容 |
|---|---|---|
| `[CODE]` | コード修正 | リポジトリ内の実装、設定、テストで対応する |
| `[MANUAL]` | 手動作業 | Railway、Google Cloud、Google Play、DNS等の管理画面で実施する |
| `[DEVICE]` | 実機確認 | Androidスマートフォンで操作して確認する |
| `[OPS]` | 運用作業 | 公開後も定期的に確認・更新する |

## 3. リリース判定

次の条件をすべて満たすまで本番公開しない。

- [ ] 対応中のコンパス修正が`main`へマージされ、Android実機で動作する
- [ ] `docs/POST_JMA_QUALITY_FIX_SPEC.md`のP1項目が完了している
- [ ] 気象庁の短期予報と3～7日先の週間予報を取得できる
- [ ] 見どころページから押した札所付近へ戻る
- [ ] DBの` synchronize: true`が本番で無効になっている
- [ ] DBバックアップと復元手順が確認済み
- [ ] Google Maps APIキーが用途別に分離・制限されている
- [ ] 本番環境変数が確認済み
- [ ] GitHub Actionsの全チェックが成功している
- [ ] Railwayのヘルスチェック、再起動、監視、料金通知が設定済み
- [ ] プライバシーポリシーとGoogle Playデータセーフティが最新
- [ ] Android内部テスト版で主要機能の実機確認が完了している

## 4. フェーズ1：既知不具合の完了

### 4.1 コード対応

- [ ] `[CODE]` コンパス判定の別対応ブランチを取り込む
- [ ] `[CODE]` 気象庁週間予報を`regular_l.xml`から取得する
- [ ] `[CODE]` 見どころから戻った札所位置を復元する
- [ ] `[CODE]` 天気文言、予報区域、対象時間帯、気象庁発表をスマホ画面上へ表示する
- [ ] `[CODE]` Open-Meteoを前提とする旧仕様記載を整理する
- [ ] `[CODE]` 上記の自動テストを追加する

詳細は`docs/POST_JMA_QUALITY_FIX_SPEC.md`を参照する。

### 4.2 実機確認

- [ ] `[DEVICE]` ルート計算結果から地図を開ける
- [ ] `[DEVICE]` ピンチ操作で拡大・縮小できる
- [ ] `[DEVICE]` 2本指で地図を回転できる
- [ ] `[DEVICE]` コンパスボタンで端末方向へ地図が向く
- [ ] `[DEVICE]` 現在地マーカー、精度円、方向扇形が表示される
- [ ] `[DEVICE]` 見どころから押した札所位置へ戻る
- [ ] `[DEVICE]` 気象庁の天気、気温、降水確率、対象時間帯を確認できる

## 5. フェーズ2：データベースの本番化

### 5.1 `synchronize`の廃止

現在の`src/data-source.ts`では本番DBでもTypeORMの`synchronize: true`が指定されている。起動時にDB構造が自動変更されるため、本番公開前に廃止する。

- [ ] `[CODE]` 本番では`synchronize: false`にする
- [ ] `[CODE]` ローカル開発でも原則`synchronize: false`へ揃える
- [ ] `[CODE]` TypeORMマイグレーションの作成・実行コマンドを`package.json`へ追加する
- [ ] `[CODE]` 現在のDB構造を初期マイグレーションとして定義する
- [ ] `[CODE]` 新規の空DBへマイグレーションだけで全テーブルを作成できることをテストする
- [ ] `[CODE]` 本番起動前またはデプロイ処理でマイグレーションを安全に実行する
- [ ] `[CODE]` マイグレーション失敗時はアプリを起動せず、ログへ原因を残す

既存の本番DBにはすでにテーブルがあるため、初期マイグレーションをそのまま実行して衝突させない。現在の構造をベースラインとして登録する手順を用意する。

### 5.2 バックアップ

- [ ] `[MANUAL]` Railway PostgreSQLのバックアップを有効にする
- [ ] `[MANUAL]` バックアップ頻度と保持期間を決める
- [ ] `[MANUAL]` 本番公開直前に手動バックアップを取得する
- [ ] `[MANUAL]` 別DBへ復元できることを1回確認する
- [ ] `[OPS]` 月1回、最新バックアップの取得状況を確認する
- [ ] `[OPS]` 大きなGTFS更新やマイグレーション前に手動バックアップを取得する

### 5.3 Railway内部接続

- [ ] `[MANUAL]` WebサービスとPostgreSQLを同じRailwayプロジェクト・環境に配置する
- [ ] `[MANUAL]` Railwayが提供する内部接続用`DATABASE_URL`を使用する
- [ ] `[MANUAL]` 不要なPublic NetworkingをDBへ公開しない、または管理作業時だけ使用する
- [ ] `[CODE]` DB接続失敗時に秘密情報をログへ出さない

## 6. フェーズ3：Google Maps Platformの保護

### 6.1 APIキーの分離

現在の`GOOGLE_MAPS_API_KEY`はブラウザのMaps JavaScript APIと、サーバー側のPlaces画像取得に共用されている。ブラウザへ埋め込まれるキーは秘密にできないため、用途別に分ける。

```text
GOOGLE_MAPS_BROWSER_API_KEY
GOOGLE_MAPS_SERVER_API_KEY
GOOGLE_MAPS_MAP_ID
```

- [ ] `[CODE]` ブラウザへは`GOOGLE_MAPS_BROWSER_API_KEY`だけを埋め込む
- [ ] `[CODE]` サーバー側処理は`GOOGLE_MAPS_SERVER_API_KEY`を使用する
- [ ] `[CODE]` サーバー用キーをHTML、JSON、画像URL、ログへ出さない
- [ ] `[CODE]` Places写真はサーバー側プロキシで取得するか、安全なブラウザ用キーだけで配信する
- [ ] `[CODE]` クライアントが任意のGoogle API URLを中継できないよう、写真プロキシの入力を札所番号等に限定する

### 6.2 Google Cloud Console

- [ ] `[MANUAL]` ブラウザ用APIキーを新規作成する
- [ ] `[MANUAL]` ブラウザ用キーへ本番ドメインのHTTPリファラー制限を設定する
- [ ] `[MANUAL]` ステージングを使う場合はステージングドメインも追加する
- [ ] `[MANUAL]` ブラウザ用キーをMaps JavaScript API等、必要なAPIだけに制限する
- [ ] `[MANUAL]` サーバー用APIキーを新規作成する
- [ ] `[MANUAL]` サーバー用キーをPlaces API、Routes API等、実際に使うAPIだけに制限する
- [ ] `[MANUAL]` Railwayの固定送信元IPを利用できる場合だけIP制限を設定する
- [ ] `[MANUAL]` 使われていないAPIを無効化する
- [ ] `[MANUAL]` Google Cloud Billingの予算アラートを設定する
- [ ] `[MANUAL]` APIごとの1日・1分あたり上限を設定する
- [ ] `[MANUAL]` 新キーで本番動作を確認してから旧キーを無効化する

Android WebViewがRailway上のHTTPSページを開く構成では、ブラウザ用キーのリファラーは本番Webドメインを基準に設定する。

## 7. フェーズ4：Railway本番設定

### 7.1 プランとリージョン

- [ ] `[MANUAL]` FreeではなくHobby以上のプランを使用する
- [ ] `[MANUAL]` WebサービスとPostgreSQLをSingaporeリージョンへ配置する
- [ ] `[MANUAL]` WebサービスとDBが同じリージョンであることを確認する

初期リリースはHobby・1レプリカで開始してよい。利用者増加や停止時間の短縮が必要になった時点でPro・複数レプリカを検討する。

### 7.2 環境変数

本番環境で次を確認する。

```text
DATABASE_URL=<Railway PostgreSQLの内部接続URL>
GOOGLE_MAPS_BROWSER_API_KEY=<ブラウザ用キー>
GOOGLE_MAPS_SERVER_API_KEY=<サーバー用キー>
GOOGLE_MAPS_MAP_ID=75b8f3f04b0ac15a904e6d31
CORS_ALLOWED_ORIGINS=https://本番ドメイン
ALLOW_NULL_ORIGIN=false
TRUST_PROXY_HOPS=1
DISABLE_GOSHUIN_LOCATION_CHECK=false
NODE_ENV=production
```

- [ ] `[MANUAL]` 上記をRailway Production環境へ設定する
- [ ] `[MANUAL]` 変数値の前後に空白や引用符が入っていないことを確認する
- [ ] `[MANUAL]` `DISABLE_GOSHUIN_LOCATION_CHECK`が`true`でないことを確認する
- [ ] `[DEVICE]` Android実機から通信できない場合だけ`ALLOW_NULL_ORIGIN`の必要性を調査する
- [ ] `[MANUAL]` 必要性を確認せず`ALLOW_NULL_ORIGIN=true`にしない

### 7.3 デプロイ設定

- [ ] `[MANUAL]` Healthcheck Pathを`/health`に設定する
- [ ] `[MANUAL]` Restart Policyを`On Failure`に設定する
- [ ] `[MANUAL]` デプロイ失敗時に以前の正常バージョンへ戻せることを確認する
- [ ] `[MANUAL]` GitHub Actions成功後だけ本番デプロイする設定にする
- [ ] `[MANUAL]` Production Branchを`main`に限定する
- [ ] `[MANUAL]` 独自ドメインとTLSを設定する
- [ ] `[MANUAL]` DNS切替前にRailway提供ドメインで全機能を確認する

### 7.4 料金管理

- [ ] `[MANUAL]` Railwayの使用量通知を設定する
- [ ] `[MANUAL]` ソフト上限を月予算の50%、75%、90%付近に設定する
- [ ] `[MANUAL]` ハード上限到達時はサービスが停止し得ることを理解して金額を決める
- [ ] `[OPS]` 公開後1週間は毎日、以後は週1回料金を確認する

## 8. フェーズ5：CI・ステージング

### 8.1 GitHub Actions

- [ ] `[CODE]` `.github/workflows/ci.yml`を追加する
- [ ] `[CODE]` `main`向けPRと`main`へのpushで実行する
- [ ] `[CODE]` Node.jsバージョンを固定する
- [ ] `[CODE]` `npm ci`を実行する
- [ ] `[CODE]` `npm run typecheck`を実行する
- [ ] `[CODE]` `npm test`を実行する
- [ ] `[CODE]` 気象庁など外部ネットワークへ依存せず、モックでテストする
- [ ] `[MANUAL]` GitHubのBranch protectionまたはRulesetでCI成功をマージ条件にする

### 8.2 ステージング

- [ ] `[MANUAL]` RailwayにStaging環境を作る
- [ ] `[MANUAL]` Stagingは本番とは別DBを使う
- [ ] `[MANUAL]` Staging用Google Mapsリファラーを許可する
- [ ] `[MANUAL]` Stagingでは`DISABLE_GOSHUIN_LOCATION_CHECK=true`を使用してよい
- [ ] `[MANUAL]` Productionでは必ず位置判定を有効にする

## 9. フェーズ6：監視・障害対応

### 9.1 監視

- [ ] `[MANUAL]` 外部監視サービスから`/health`を5分間隔程度で監視する
- [ ] `[MANUAL]` RailwayのCPU、メモリ、再起動回数、DB容量を確認できるようにする
- [ ] `[MANUAL]` 500エラーやDB接続エラーを通知する仕組みを用意する
- [ ] `[MANUAL]` Google Maps API使用量と請求額の通知を設定する
- [ ] `[MANUAL]` Androidクラッシュレポートを確認できるようにする

### 9.2 `/health`の改善

現在の`/health`は常に`{ ok: true }`を返す。プロセスの起動確認には使えるが、DB接続までは確認できない。

- [ ] `[CODE]` Railway用の軽量なLiveness確認は現在の`/health`として維持する
- [ ] `[CODE]` DBへ軽量クエリを行う`/ready`を追加する
- [ ] `[CODE]` `/ready`で秘密情報や詳細な内部エラーを返さない
- [ ] `[MANUAL]` 外部監視では`/health`と`/ready`を用途に応じて使い分ける

### 9.3 障害対応手順

`docs/OPERATIONS_RUNBOOK.md`を追加し、最低限次を記載する。

- [ ] `[CODE]` Railwayで直前のデプロイへ戻す方法
- [ ] `[CODE]` PostgreSQLバックアップから復元する方法
- [ ] `[CODE]` Google APIキー漏えい時の交換方法
- [ ] `[CODE]` 気象庁データ取得失敗時の確認箇所
- [ ] `[CODE]` GTFSデータ更新失敗時の戻し方
- [ ] `[CODE]` 障害告知を掲載する場所

## 10. フェーズ7：セキュリティと法務表示

### 10.1 Webセキュリティ

- [ ] `[CODE]` 依存パッケージの脆弱性を確認する
- [ ] `[CODE]` GitHub Dependabotまたは同等の依存更新通知を有効にする
- [ ] `[CODE]` 秘密情報がGit履歴へ含まれていないことを確認する
- [ ] `[CODE]` CSPをReport-Onlyで導入し、違反内容を確認してから強制へ移行する
- [ ] `[CODE]` レート制限がRailwayのプロキシ構成で正しいIPを使用していることを確認する
- [ ] `[CODE]` エラー応答へスタックトレースや秘密情報を含めない

### 10.2 表示・文書

- [ ] `[CODE]` `/privacy`の内容を現在の位置情報利用と外部サービス利用に合わせる
- [ ] `[CODE]` Google Maps、気象庁、GTFS、寺院画像等のクレジットを確認する
- [ ] `[CODE]` 問い合わせ先またはサポート窓口を掲載する
- [ ] `[CODE]` 必要に応じて利用規約・免責事項を追加する
- [ ] `[CODE]` バス時刻・徒歩時間・納経時間・天気が参考情報である旨を明記する

## 11. フェーズ8：Android／Google Play公開

### 11.1 Androidビルド

- [ ] `[MANUAL]` 本番用アプリIDを確定する
- [ ] `[MANUAL]` `versionCode`と`versionName`を更新する
- [ ] `[MANUAL]` Play App Signingを設定する
- [ ] `[MANUAL]` 署名済みAndroid App Bundle（AAB）を作成する
- [ ] `[MANUAL]` 署名鍵・アップロード鍵を安全な場所へバックアップする
- [ ] `[CODE]` 本番URL以外への不要な通信を削除する
- [ ] `[CODE]` HTTP通信を許可せずHTTPSだけを使用する

### 11.2 Google Play Console

- [ ] `[MANUAL]` アプリ名、説明、アイコン、スクリーンショットを登録する
- [ ] `[MANUAL]` 公開されているプライバシーポリシーURLを登録する
- [ ] `[MANUAL]` データセーフティへ位置情報の利用目的を正確に回答する
- [ ] `[MANUAL]` 位置情報権限が訪問済み判定・現在地表示に必要であることを説明する
- [ ] `[MANUAL]` 対象年齢、広告、コンテンツレーティングを回答する
- [ ] `[MANUAL]` サポート用メールアドレスを登録する
- [ ] `[MANUAL]` 内部テストへAABをアップロードする
- [ ] `[MANUAL]` 必要なクローズドテスト要件を確認・実施する
- [ ] `[MANUAL]` 審査前にプレリリースレポートを確認する

### 11.3 実機テスト

最低限、次を実際のAndroid端末で確認する。

- [ ] `[DEVICE]` 初回起動
- [ ] `[DEVICE]` 位置情報の許可・拒否・再許可
- [ ] `[DEVICE]` 現在地からの札所設定
- [ ] `[DEVICE]` ルート計算
- [ ] `[DEVICE]` バス・徒歩案内
- [ ] `[DEVICE]` 地図の拡大、縮小、回転、コンパス、現在地
- [ ] `[DEVICE]` 見どころページと戻る位置
- [ ] `[DEVICE]` 御朱印の訪問範囲内・範囲外・取得失敗
- [ ] `[DEVICE]` 長い和暦日付の表示
- [ ] `[DEVICE]` 日本語と各対応言語の切り替え
- [ ] `[DEVICE]` ライト・ダークテーマ
- [ ] `[DEVICE]` 文字サイズを大きくした状態
- [ ] `[DEVICE]` Wi-Fi、モバイル回線、オフライン、低速回線
- [ ] `[DEVICE]` アプリ更新後に既存の訪問記録が残る

## 12. フェーズ9：公開手順

### 12.1 公開前日

- [ ] `[MANUAL]` PostgreSQLの手動バックアップを取得する
- [ ] `[MANUAL]` Google MapsとRailwayの料金通知を確認する
- [ ] `[MANUAL]` Production環境変数を二人またはチェックリストで再確認する
- [ ] `[MANUAL]` `DISABLE_GOSHUIN_LOCATION_CHECK=false`を確認する
- [ ] `[MANUAL]` `main`のCIが成功していることを確認する
- [ ] `[DEVICE]` Production URLを使った最終実機確認を行う

### 12.2 公開当日

- [ ] `[MANUAL]` Railwayの最新デプロイと`/health`を確認する
- [ ] `[MANUAL]` Android本番リリースを段階公開する
- [ ] `[MANUAL]` 最初は少ない割合で公開し、問題がなければ拡大する
- [ ] `[OPS]` Railwayログ、DB、Google Maps使用量、クラッシュを監視する

### 12.3 公開後

- [ ] `[OPS]` 公開後24時間は定期的にエラーと料金を確認する
- [ ] `[OPS]` 1週間後に不具合、クラッシュ、利用状況をレビューする
- [ ] `[OPS]` GTFSの更新日と有効期限を定期確認する
- [ ] `[OPS]` 月1回、バックアップ・依存関係・Google Maps料金・Railway料金を確認する

## 13. Railwayを継続する判断基準

初期リリースはRailwayのままでよい。次のいずれかが発生した場合に移行またはProプランを検討する。

- 利用者増加によりCPU・メモリ・DB負荷が継続的に高い
- 1レプリカの再起動時間を許容できない
- 日本国内リージョンが必須になる
- 可用性保証、複数リージョン、厳格な監査要件が必要になる
- Railway費用が他サービスより継続的に高くなる
- 固定送信元IP等、必要なネットワーク機能が現在のプランで不足する

## 14. 手動作業の要約

ユーザーが管理画面や実機で行う必要がある主な作業は次のとおり。

1. RailwayをHobby以上へ変更する
2. Railwayのリージョン、環境変数、`/health`、再起動ポリシーを設定する
3. Railway PostgreSQLのバックアップを有効化し、復元確認を行う
4. Railwayの独自ドメイン、TLS、料金通知を設定する
5. Google Cloudでブラウザ用・サーバー用APIキーを作成し、制限を設定する
6. Google Cloudの料金アラートとAPI上限を設定する
7. GitHubでCI成功をマージ条件にする
8. RailwayにStaging環境を作り、本番DBと分離する
9. 外部監視とAndroidクラッシュ確認を設定する
10. Google Play Consoleのプライバシー、データセーフティ、ストア情報を入力する
11. AABの署名、内部テスト、クローズドテスト、段階公開を行う
12. Android実機で本チェックリストの操作確認を行う

コード修正が完了した後も、上記の手動作業が終わるまでは本番リリース完了としない。
