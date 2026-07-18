# reStructuredText Editor

ブラウザだけで reStructuredText を編集し、HTML プレビューを確認できる静的 Web アプリです。

## 起動方法

標準のローカル開発起動は、リポジトリルートで依存関係を準備してから workspace を指定します。

```bash
npm ci
npm run dev --workspace=restructuredtext-editor
```

その後、`http://127.0.0.1:8000/` を開いてください。停止は起動中の terminal で `Ctrl+C` です。

## 構成

- `index.html`: アプリ画面と CDN 由来ライブラリの import map を定義します。
- `app.js`: エディタ、プレビュー、保存、HTML エクスポート、印刷連携を実装します。
- `style.css`: レイアウトとテーマを定義します。
- `assets/sample.rst`: 初期表示・動作確認用のサンプル reStructuredText です。
- `images/icons.png`: アプリのアイコン画像です。

## 外部依存

このアプリは npm パッケージや vendored ファイルを同梱していません。実行時に `index.html` の import map と stylesheet から以下を CDN 経由で読み込みます。

- es-module-shims
- Shiki / vscode-oniguruma / vscode-textmate
- KaTeX / KaTeX auto-render

## 備考

Pocketly モノリポでは `apps/restructuredtext-editor/` を正式な配置として管理します。
