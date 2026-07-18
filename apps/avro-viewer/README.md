# Avro Viewer White

ローカルの `.avro` (Avro OCF) をブラウザだけで読み込み、表形式で確認する静的Webアプリです。

## 起動方法

標準のローカル開発起動は、リポジトリルートで依存関係を準備してから workspace を指定します。

```bash
npm ci
npm run dev --workspace=avro-viewer
```

その後、`http://127.0.0.1:8000/` を開いてください。停止は起動中の terminal で `Ctrl+C` です。

`index.html` の直接オープンや `python -m http.server` は Pocketly の標準起動手順ではありません。ブラウザ設定や `file://` の制約による差異を避けるため、共通の HTTP server で起動します。

## 使い方

1. **ファイル読み込み**
   - ヘッダの「ファイル選択」またはドラッグ&ドロップで `.avro` を読み込みます。
2. **Schema表示**
   - 左の `Schema` にファイル埋め込み schema が表示されます。
3. **レコード閲覧**
   - 先頭N件（初期200件）をテーブル表示します。
4. **列切替**
   - 左の `Columns` で表示/非表示を切替します。
5. **検索・フィルタ・ソート**
   - 上部検索ボックス: 部分一致検索。
   - Filter: `contains`, `==`, `exists`。
   - テーブルヘッダクリック: 単一列の昇順/降順ソート。
6. **詳細表示**
   - 行をクリックすると `Row Detail` にJSON整形表示します。
7. **エクスポート**
   - `Export JSON`: 現在の絞り込み結果を JSON 配列でダウンロード。
   - `Export CSV`: 表示列のみで CSV をダウンロード。
8. **Profile（列プロファイル）**
   - `Profile` タブで全列の NULL率、TopK、（該当列は）min/max を確認できます。
   - `TopK` のK値を変更すると再計算されます。
   - 怪しい列ランキングから列を選択すると詳細プロファイルが表示されます。

## 制限事項

- Avroのデコードに `vendor/avsc.js` を同梱しています（オフライン利用可）。
- 大容量ファイル対応として、初期表示は「先頭N件」のみを保持・描画します。
- ページングは1ページ100件です。
- 複雑な logicalType の人間可読変換は現状未対応です（値は文字列化して表示）。
- TopKはユニーク値が非常に多い列では精度が低下する場合があります（上限50,000件）。
- mixed列は数値割合が閾値未満の場合、min/maxを算出しません。

## 依存ライブラリ

- [`avsc` v5.7.7](https://www.npmjs.com/package/avsc) (同梱: `vendor/avsc.js`)
  - License: MIT (`vendor/avsc-LICENSE.txt`)

## ファイル構成

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `vendor/avsc.js`
- `vendor/avsc-LICENSE.txt`
