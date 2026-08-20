# 御朱印位置判定 環境変数化仕様書

## 1. 目的

現在 `src/public/js/settings.js` に固定値で記載されている御朱印取得時の位置判定切り替えを、Railway等の実行環境に設定した環境変数から変更できるようにする。

現在の設定:

```js
const DISABLE_GOSHUIN_LOCATION_CHECK = true;
```

実装後は、ソースコードを編集・再コミットせずにテスト用と本番用を切り替えられるようにする。

## 2. 環境変数

環境変数名は次のとおりとする。

```env
DISABLE_GOSHUIN_LOCATION_CHECK=true
```

| 設定値 | 動作 |
|---|---|
| `true` | 位置情報を確認せず御朱印を取得できる。開発・テスト用 |
| `false` | 現在地と札所の距離・位置精度を確認する。本番用 |
| 未設定 | `false` として扱う |
| 上記以外の値 | 警告を出し、`false` として扱う |

安全側へ倒すため、未設定や不正値で位置判定を無効にしてはならない。

## 3. 実装方針

ブラウザ上のJavaScriptからサーバーの環境変数は直接取得できない。そのため、既にGoogle Maps APIキーを動的に埋め込んでいる `src/server.ts` の `/` レスポンス生成処理を利用し、公開可能な真偽値だけをHTMLへ埋め込む。

環境変数の値や `process.env` 全体をブラウザへ返してはならない。

### 3.1 サーバー側

環境変数を安全に真偽値へ変換する関数を用意する。

推奨例:

```ts
export function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  console.warn('[config] DISABLE_GOSHUIN_LOCATION_CHECK has an invalid value; using false');
  return false;
}
```

`src/server.ts` の `/` ハンドラーで、既存のHTMLテンプレート置換に次の処理を追加する。

```ts
const disableGoshuinLocationCheck = parseBooleanEnv(
  process.env.DISABLE_GOSHUIN_LOCATION_CHECK,
  false,
);

html = html.replaceAll(
  '{{DISABLE_GOSHUIN_LOCATION_CHECK}}',
  String(disableGoshuinLocationCheck),
);
```

環境変数の変更が古いHTMLキャッシュに残らないよう、`/` のレスポンスには次のヘッダーを付ける。

```ts
res.setHeader('Cache-Control', 'no-store');
```

### 3.2 HTML側

`src/public/index.html` のアプリJavaScript読込より前に、公開用設定を定義する。

```html
<script>
  window.OHENRO_CONFIG = Object.freeze({
    disableGoshuinLocationCheck:
      '{{DISABLE_GOSHUIN_LOCATION_CHECK}}' === 'true'
  });
</script>
```

テンプレートがサーバーを通らず直接開かれた場合、未置換文字列は `true` と一致しないため、位置判定が有効になる。

必要に応じて型・エディター警告を避けるため、公開設定の初期化処理を独立した小さなファイルへ分離してもよい。ただし、設定は `settings.js` より先に読み込むこと。

### 3.3 フロント側

`src/public/js/settings.js` にある固定値を削除し、公開設定から読み込む。

```js
const DISABLE_GOSHUIN_LOCATION_CHECK =
  window.OHENRO_CONFIG?.disableGoshuinLocationCheck === true;
```

`checkTempleProximity()` の距離判定、100～200mの許容距離、位置精度エラー、表示文言は変更しない。

テスト用に位置判定を無効化した場合も、既存の訪問日保存、和暦表示、御朱印表示処理はそのまま利用する。

## 4. Railwayでの設定

### テスト環境

Railwayの対象サービスで、Variablesへ次を設定する。

```env
DISABLE_GOSHUIN_LOCATION_CHECK=true
```

### 本番環境

次のどちらかにする。

```env
DISABLE_GOSHUIN_LOCATION_CHECK=false
```

または環境変数を削除する。未設定時は位置判定を有効にする。

環境変数変更後はRailwayの再デプロイまたは再起動を行い、ブラウザ・Androidアプリを開き直して確認する。

## 5. テスト

### 5.1 自動テスト

環境変数変換処理について、最低限次のケースを追加する。

| 入力 | 期待値 |
|---|---:|
| `true` | `true` |
| `TRUE` | `true` |
| 前後に空白がある ` true ` | `true` |
| `false` | `false` |
| 未設定 | `false` |
| 空文字 | `false` |
| `1`、`yes`、任意の誤記 | `false` |

既存の以下のテストも引き続き成功すること。

```powershell
npm run check
```

### 5.2 手動確認

#### `true` の場合

- 札所から離れた場所でも「訪問済みにする」が成功する。
- 訪問日が保存される。
- 御朱印画像と和暦日付が表示される。

#### `false` または未設定の場合

- 札所の許容範囲外では取得できない。
- 位置情報を取得できない場合は既存の取得失敗メッセージが出る。
- 位置精度が許容値を超える場合は既存の精度エラーメッセージが出る。
- 許容範囲内では御朱印を取得できる。

#### 共通

- PCブラウザ、スマートフォンChrome、Android WebViewで確認する。
- 日本語以外の表示や既存の位置情報設定を壊していないことを確認する。

## 6. ログ

起動時に現在のモードが分かるログを1行だけ出してよい。

```text
[config] goshuin location check: enabled
```

または

```text
[config] goshuin location check: disabled (test mode)
```

座標、環境変数一覧、秘密情報はログへ出さない。

## 7. セキュリティ上の注意

この変更は、開発・テスト・本番の動作を切り替えやすくするためのものであり、不正取得を完全に防止する仕組みではない。

位置判定と訪問済み保存はクライアント側で実行されるため、利用者がブラウザのJavaScriptや `localStorage` を操作すれば回避できる。厳密な取得制限が必要になった場合は、ログイン、サーバー側での位置検証、取得履歴のサーバー保存を別仕様として検討する。

## 8. 変更対象

想定する主な変更対象は以下とする。

- `src/server.ts`
- `src/public/index.html`
- `src/public/js/settings.js`
- 環境変数変換処理の新規ファイル（必要な場合）
- 環境変数変換処理のテスト
- `README.md` または運用ドキュメント

## 9. 対象外

- 御朱印の許容距離変更
- 位置情報取得方法の変更
- 訪問済みデータのサーバー保存
- ログイン機能
- 御朱印画像・日付デザインの変更
- Androidの権限ダイアログや `MainActivity.kt` の変更

## 10. 完了条件

- ソースコード内の固定値 `DISABLE_GOSHUIN_LOCATION_CHECK = true` が削除されている。
- 環境変数で位置判定の有効・無効を切り替えられる。
- 未設定および不正値では位置判定が有効になる。
- ブラウザへ秘密情報を公開していない。
- `npm run check` が成功する。
- テスト環境と本番相当環境の両方で手動確認が完了する。
- READMEへ環境変数名、既定値、Railwayでの設定方法が記載されている。
