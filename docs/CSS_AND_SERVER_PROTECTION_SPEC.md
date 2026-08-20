# CSS分割・公開サーバー保護 仕様書

## 1. 目的

既存の画面デザインとAndroid WebViewでの動作を維持しながら、次の2項目を改善する。

1. `src/public/css/app.css` を機能別に分割し、保守しやすくする。
2. 公開サーバーへCORS制限、アクセス回数制限、基本的なHTTPセキュリティヘッダーを導入する。

両項目は影響範囲が異なるため、実装時は別ブランチ・別PRに分けることを推奨する。この仕様書を追加するPRではアプリコードを変更しない。

## 2. 共通方針

- 最新の `main` から実装ブランチを作成する。
- UIデザイン、色、余白、文字サイズ、レスポンシブ表示を変更しない。
- DOMのID、CSSクラス名、JavaScriptから付け外しするクラス名を変更しない。
- PCブラウザ、スマートフォンChrome、Android WebViewを確認する。
- `npm run check` を各コミットで成功させる。
- 本番環境へ適用する前にRailwayのテスト環境で確認する。
- 一度に全面変更せず、CSS分割とサーバー保護をそれぞれ独立して検証できる状態にする。

---

# Part A：app.cssの機能別分割

## 3. 現状と目的

`src/public/index.html` からCSSは分離済みだが、スタイルの大部分が `src/public/css/app.css` へ集約されている。

今回の目的はファイルを分けることであり、見た目を変更することではない。重複整理、命名変更、デザイン調整は同時に行わない。

## 4. 推奨ファイル構成

```text
src/public/css/
  tokens.css
  base.css
  layout.css
  components.css
  home.css
  route-result.css
  map.css
  goshuin.css
  settings.css
  themes.css
  responsive.css
```

### 各ファイルの責務

| ファイル | 内容 |
|---|---|
| `tokens.css` | 色、余白、角丸、影、重なり順などのCSSカスタムプロパティ |
| `base.css` | リセット、`html`、`body`、共通フォント、基本要素 |
| `layout.css` | ヘッダー、画面領域、下部ナビゲーション、共通コンテナ |
| `components.css` | ボタン、カード、入力欄、モーダル、バッジ等の共通部品 |
| `home.css` | ルート条件入力、ホーム固有表示 |
| `route-result.css` | ルート結果、タイムライン、移動区間、注意表示 |
| `map.css` | 地図、現在地、コンパス、地図上の操作ボタン、標高表示 |
| `goshuin.css` | 御朱印一覧、カード、詳細、訪問日重ね表示 |
| `settings.css` | 設定画面、トグル、選択UI |
| `themes.css` | ライト・ダーク・自動テーマに関する上書き |
| `responsive.css` | 画面幅、高さ、セーフエリア、スマートフォン固有調整 |

該当ルールが少ない場合は、最初から無理に11ファイルへ分けなくてもよい。最低限、`base/layout/components` と主要画面単位へ分割する。

## 5. 読み込み順

CSSの詳細度や記述順による表示を壊さないため、`src/public/index.html` では次の順番で読み込む。

```html
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/home.css">
<link rel="stylesheet" href="/css/route-result.css">
<link rel="stylesheet" href="/css/map.css">
<link rel="stylesheet" href="/css/goshuin.css">
<link rel="stylesheet" href="/css/settings.css">
<link rel="stylesheet" href="/css/themes.css">
<link rel="stylesheet" href="/css/responsive.css">
```

既存CSS内の順番に意味がある場合は、その前後関係を維持する。`!important` を追加して表示差分を隠してはならない。

## 6. 分割手順

1. 分割前の主要画面をライト・ダーク両方で記録する。
2. `app.css` のルールを上から分類し、内容を変更せず移動する。
3. JavaScript内で参照されるクラスを `rg` 等で確認する。
4. `index.html` のCSS読込を推奨順へ変更する。
5. 使われていないように見えるルールも、この作業では削除しない。
6. 全ルールの移動を確認した後で `app.css` を削除する。

### 禁止事項

- セレクター名の一括変更
- CSSの圧縮・整形を同時に行うこと
- 見た目の微調整を混ぜること
- 複数ルールの統合や重複削除
- `@media` の条件変更
- セーフエリア指定の変更

## 7. CSS分割の確認項目

- ホームのルート条件入力
- ルート結果の寺名、番号、タイムライン、移動カード
- 地図、コンパス、現在地マーカー、現在地精度円
- 御朱印一覧と詳細画面、訪問日の重ね表示
- 設定画面の言語・位置情報・テーマ選択
- 下部ナビゲーション
- モーダル、確認ダイアログ、ローディング表示
- 日本語、英語、韓国語、中国語等で文字がはみ出さないこと
- ライト、ダーク、自動テーマ
- 縦画面、横画面、文字サイズを大きくしたAndroid端末
- Androidのステータスバー、ナビゲーションバー、セーフエリア

## 8. CSS分割の完了条件

- `app.css` の全ルールが責務別ファイルへ移動している。
- 分割前後で意図しない画面差分がない。
- CSSクラス、DOM ID、JavaScriptの動作を変更していない。
- PCブラウザ、スマートフォン、Android WebViewで主要画面を確認済みである。
- `npm run check` が成功する。

---

# Part B：CORS・アクセス回数制限・HTTP保護

## 9. 現状と目的

現在の `src/server.ts` は次の設定により、すべてのオリジンからのCORSアクセスを許可している。

```ts
app.use(cors());
```

また、外部APIやDBへ接続するエンドポイントに利用者単位のアクセス回数制限がない。

公開アプリの正常利用を妨げず、次のリスクを軽減する。

- 外部サイトからの無制限なAPI利用
- 自動化された大量リクエスト
- 天気・地図・DB等の外部依存先への過剰アクセス
- 一般的なHTTPヘッダー不足

## 10. 追加パッケージ

```powershell
npm install helmet express-rate-limit
npm install -D supertest @types/supertest
```

`package-lock.json` も更新する。

## 11. Railway環境変数

```env
CORS_ALLOWED_ORIGINS=https://本番ドメイン,https://テスト環境ドメイン
ALLOW_NULL_ORIGIN=true
TRUST_PROXY_HOPS=1
```

### 意味

| 環境変数 | 既定値 | 内容 |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | 空 | カンマ区切りの許可オリジン。完全一致で判定する |
| `ALLOW_NULL_ORIGIN` | `false` | `file://` 由来のAndroid WebViewを許可する場合だけ `true` |
| `TRUST_PROXY_HOPS` | `1` | Railwayのプロキシ経由で正しいクライアントIPを取得する |

`CORS_ALLOWED_ORIGINS=*` は禁止する。末尾スラッシュ、パス、ワイルドカードを含めず、`https://example.com` の形式で指定する。

Android WebViewが実際に `Origin: null` を送信するかは実機で確認する。不要であれば `ALLOW_NULL_ORIGIN=false` にする。

## 12. CORS方針

許可するリクエストは次のとおりとする。

1. `Origin` ヘッダーがない同一サイト・ネイティブ相当のリクエスト
2. `CORS_ALLOWED_ORIGINS` に完全一致するオリジン
3. `ALLOW_NULL_ORIGIN=true` の場合だけ文字列 `null` のオリジン

それ以外はCORSを許可しない。エラー本文へ許可オリジン一覧を出してはならない。

推奨実装イメージ:

```ts
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin === 'null' && allowNullOrigin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  methods: ['GET', 'OPTIONS'],
};
```

既存アプリは参照系APIのみのため、許可メソッドは `GET` と `OPTIONS` を基本とする。将来POST等が必要になった場合は、そのAPIの仕様と合わせて追加する。

CORSはブラウザからの利用制限であり、認証や不正アクセス防止そのものではない点に注意する。

## 13. プロキシ設定

Railway等のリバースプロキシ配下で利用者IPを正しく扱うため、アクセス回数制限より前に設定する。

```ts
app.set('trust proxy', trustProxyHops);
```

値を無制限な `true` にしない。環境変数が不正な場合は起動時に警告を出し、既定値1を利用する。

## 14. アクセス回数制限

静的画像、CSS、JavaScript、フォント、トップ画面、`/health` には一律制限をかけない。DB・外部APIへ負荷を与える動的エンドポイントへ個別に適用する。

推奨初期値:

| 対象 | 制限 | 理由 |
|---|---:|---|
| `/next-bus` | 1 IPあたり1分120回 | ルート再計算を許容しつつDBを保護 |
| `/weather-proxy` | 1 IPあたり1分30回 | Open-Meteoへの代理アクセスを保護 |
| `/overpass-proxy` | 1 IPあたり1分30回 | DB検索・地図関連処理を保護 |
| `/stop-walk-routes` | 1 IPあたり1分60回 | DB参照を保護 |
| `/temples`、`/temple-places` | 1 IPあたり1分120回 | マスタ取得を保護 |

実測前の初期値であるため、通常操作で429が出る場合はログを確認して調整する。制限値をコード内定数としてまとめ、理由をコメントに残す。

429時はJSONで返す。

```json
{
  "error": "too_many_requests",
  "message": "しばらく待ってから再度お試しください"
}
```

`Retry-After` と標準RateLimitヘッダーを有効にする。クライアント側では429を通信障害と区別し、既存デザインに合うメッセージを表示する。

## 15. 入力件数と外部通信の保護

アクセス回数だけでなく、1リクエストの大きさも制限する。

- `/weather-proxy` の `points` は最大100件とする。
- `bbox`、緯度経度、日付、札所番号、時刻の既存バリデーションを維持・強化する。
- 外部API通信にはタイムアウトを設定する。
- 同じ天気データのキャッシュ処理は維持する。
- エラーログへ位置情報、APIキー、環境変数一覧を出さない。

本アプリにJSON POST APIを追加する場合は、次のようなサイズ制限を適用する。

```ts
app.use(express.json({ limit: '32kb' }));
```

## 16. HelmetとHTTPヘッダー

Google Maps、Google Fonts、インラインスクリプト、Android WebViewとの互換性を考慮し、初回は次のように導入する。

```ts
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
```

これにより基本的なヘッダーを先に有効化する。CSPはGoogle Maps等の必要ドメインとインライン処理を調査してから、別段階で `Content-Security-Policy-Report-Only` を導入し、問題がないことを確認後に強制する。

CSPを調査せず一度に強制し、地図やフォントを表示不能にしてはならない。

## 17. サーバー構成とテスト容易性

可能であればExpressアプリ生成と待受開始を分ける。

```text
src/
  app.ts       Express設定・ルート登録
  server.ts    app.listenのみ
```

テストから `app` を読み込んでもポート待受やDB初期化が勝手に始まらない構成にする。大規模な分割になる場合は、最初は `createApp()` の切り出しだけでもよい。

## 18. サーバー保護の自動テスト

`supertest` を利用し、最低限次を確認する。

### CORS

- 許可オリジンへ `Access-Control-Allow-Origin` が付く。
- 未許可オリジンへ許可ヘッダーが付かない。
- `Origin` なしのリクエストが成功する。
- `ALLOW_NULL_ORIGIN=true` の場合だけ `Origin: null` が許可される。
- 許可されていないメソッドがCORSで許可されない。

### Rate Limit

- 制限未満は正常応答する。
- 制限超過で429になる。
- 429に `Retry-After` とRateLimitヘッダーが付く。
- `/health` と静的ファイルは対象外である。
- プロキシ経由のIPを正しく区別できる。

### HTTPヘッダー

- Helmetの基本ヘッダーが付く。
- CSPを無理に強制していない。

## 19. サーバー保護の手動確認

- Railway本番URLでホームが表示される。
- 地図、Google Fonts、御朱印画像が表示される。
- ルート計算、バス検索、天気、見どころが利用できる。
- Android WebViewでCORSエラーが発生しない。
- 許可していない別ドメインからのブラウザfetchが拒否される。
- 通常操作では429が発生しない。
- 短時間の大量リクエストで429になる。
- RailwayログへAPIキーや正確な現在地が出ていない。

## 20. サーバー保護の完了条件

- 無条件の `app.use(cors())` が削除されている。
- 許可オリジンが環境変数で管理されている。
- Android WebViewの `null` オリジンを明示的に切り替えられる。
- Railway向けの `trust proxy` が安全な値で設定されている。
- 動的APIに個別のアクセス回数制限がある。
- 429を利用者が理解できる形で処理できる。
- Helmetの基本ヘッダーが有効である。
- CORS・Rate Limit・ヘッダーの自動テストがある。
- `npm run check` が成功する。
- PC、スマートフォン、Android WebViewで主要機能を確認済みである。

---

## 21. 推奨実装PR

### PR 1：CSS分割

- `app.css` の責務別分割
- `index.html` の読込順変更
- 見た目の回帰確認

### PR 2：公開サーバー保護

- CORS許可リスト
- Railwayプロキシ設定
- 動的APIのRate Limit
- Helmet基本ヘッダー
- 入力件数制限
- `supertest` による自動テスト
- READMEへの環境変数・運用方法追記

CSS分割とサーバー保護を同じ実装PRへ混在させない。問題発生時に原因を特定しやすくし、個別に差し戻せる状態を維持する。
