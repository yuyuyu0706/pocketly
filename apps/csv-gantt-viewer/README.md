# CSV to Gantt Viewer Green

このリポジトリは CSV をもとにガントチャートを表示するビューアです。

## 起動方法

標準のローカル開発起動は、リポジトリルートで依存関係を準備してから workspace を指定します。

```bash
npm ci
npm run dev --workspace=csv-gantt-viewer
```

その後、`http://127.0.0.1:8000/` を開いてください。停止は起動中の terminal で `Ctrl+C` です。

## カテゴリ表示順のカスタマイズ

`config.json` にカテゴリ表示順の設定を記述すると、必要に応じて既定の並びを上書きできます。設定が無効な場合や `config.json` が存在しない場合は、アプリ既定の順序が利用されます。

- `categoryOrderEnabled`: `true` で設定を有効化します。`false` の場合は既定の順番が使われます。
- `categoryOrder`: 表示順に並べたカテゴリ名の配列です。ここに記載されていないカテゴリは既定の並びの末尾に表示されます。

```json
{
  "categoryOrderEnabled": true,
  "categoryOrder": [
    "マイルストーン",
    "PMO",
    "構築",
    "テスト",
    "リリース"
  ]
}
```

> **メモ:** `categoryOrder` の配列を空にするか、設定ファイルが取得できない場合は既定値にフォールバックします。

## 開発・テスト

依存関係の準備は app directory ではなく、リポジトリルートの `npm ci` に統一しています。

```bash
npm ci
npm test --workspace=csv-gantt-viewer
```

Chromium を準備して root から既存テストを実行する場合は、以下を使用します。

```bash
npm run test:browser:install
npm run test:list
npm test
```

Playwright はこの workspace の `npm run dev` を自動で起動・停止し、`http://127.0.0.1:8000/` へ接続します。実行前に手動起動中の port 8000 server を停止してください。
