# Markdown Editor – 現状構成と既知課題の原因箇所

> 状態: **確定版**（Lv2-B にて実コードとの突き合わせ検証・行番号確認・未調査領域の補完を完了）
> 配置先: `apps/markdown-editor/docs/refine-02-current-state.md`
> 調査基準コミット: `6801ff51c30ae20dfbd65bd225c83459ebf5b88e`（2026-07-27）
> 親 Issue: #49 / 対応 Lv2: Lv2-B（Issue #53）

**行番号はすべて上記コミット時点のもの。** 本コミットで全行参照を実コードと照合済み（アプリコードに差分なし）。

---

## 1. ファイル構成と規模

```text
apps/markdown-editor/
├── index.html            134 行   アプリシェル、ツールバー、ヘルプ、依存の読み込み
├── style.css             484 行   レイアウトと視覚スタイル（全用途が 1 枚に同居）
├── script.js           2,769 行   エディタ・装飾・目次・エクスポート・レイアウト
├── config.js               2 行   既定言語のみ
├── i18n.js               506 行   翻訳ヘルパー
├── i18n/                          en.json / ja.json
├── js/
│   ├── bus.js             76 行   イベントバス
│   ├── state.js          233 行   アプリ状態と localStorage
│   ├── slug.js            44 行   見出し ID 生成
│   └── preview.js        918 行   プレビュー描画、Mermaid、スクロール同期
├── template/                      Markdown テンプレート 5 種
├── images/icons.png
├── tests/
│   ├── actions.spec.js   341 行   8 テスト
│   └── render.spec.js    568 行   14 テスト
├── package.json                   Playwright のみ
├── playwright.config.js
└── docs/ci-failure-analysis.md
```

合計 5,166 行（`index.html` / `style.css` / `script.js` / `config.js` / `i18n.js` / `js/*`）。

---

## 2. アーキテクチャ

### 2-1. モジュール構造

ビルドステップを持たない静的アプリ。`index.html` が以下の順にスクリプトを読み込む。

```text
marked (CDN) → mermaid (CDN) → config.js → i18n.js
  → js/bus.js → js/state.js → js/slug.js → js/preview.js → script.js
```

すべて `window` 上のグローバル（`marked` / `mermaid` / `APP_CONFIG` / `i18n` / `Bus` / `AppState` / `Preview`）で連携する。ES Modules は未使用。

### 2-2. 責務の分布

| モジュール | 責務 | 状態 |
| --- | --- | --- |
| `js/bus.js` | pub/sub イベントバス | 適切に分離済み |
| `js/state.js` | 本文・設定・カーソルの保持、localStorage 永続化 | 分離済み。ただし undo/redo は空実装 |
| `js/slug.js` | 見出しから ID を生成 | 適切に分離済み |
| `js/preview.js` | Markdown 描画、Mermaid 変換、スクロール同期、チェックボックス書き戻し | 分離済み |
| `script.js` | **上記以外のすべて** | 未分離 |

`script.js` は `bootstrap()` → `startApp()` の単一クロージャ内に以下がすべて同居している。

- エディタのハイライトオーバーレイ（`script.js:75-337`）
- ファイル入出力・ダウンロード（`script.js:339-479`）
- テンプレートメニュー（`script.js:480-898`）
- クリップボード操作（`script.js:899-977`）
- 装飾処理（`script.js:1038-1488`）
- 右クリックメニューの構築と制御（`script.js:1489-1655`）
- 行番号ガター・ペイン幅のドラッグ制御（`script.js:1656-1795`）
- 目次の構築と見出し追従（`script.js:1824-2299`）
- リスト自動継続（`script.js:2300-2452`）
- エクスポート（`script.js:2427-2686`）

**この構造が、後続のすべての改修コストを押し上げている**（→ `MDE-009`）。

### 2-3. データフロー

```text
[textarea#editor] --input--> AppState.setText() --Bus.emit('text:changed')-->
    ├─→ Preview.render()        （プレビュー描画）
    ├─→ buildTOC()              （目次再構築）
    ├─→ updateEditorHighlight() （ハイライトオーバーレイ更新）
    └─→ updateLineNumbers()     （行番号更新）

[プレビューのチェックボックス] --click--> editorEl.value 直接書き換え
                                        --> AppState.setText()
[目次クリック] --Bus.emit('toc:jump')--> エディタ選択 + プレビュースクロール
```

**重要な制約**: 装飾・貼り付け・リスト継続・チェックボックス操作はいずれも `editor.value` への直接代入で本文を書き換えている。この経路は `input` イベントを発火せず、ブラウザのネイティブ undo スタックも更新しない（→ `MDE-004` / `MDE-023`）。

該当箇所は 12 箇所。

```text
script.js:434    ファイル読み込み時
script.js:545    テンプレート適用時
script.js:992    insertTextAtCursor()（貼り付け）
script.js:1194   applyInlineCodeFormatting()
script.js:1249   applyExternalLinkFormatting()
script.js:1313   applyBoldFormatting()
script.js:1428   cutEditorSelection()
script.js:1806   handleTextStateChange()
script.js:2365   continueListOnEnter()
script.js:2419   continueListOnEnter()（別分岐）
js/preview.js:477  チェックボックス書き戻し
js/preview.js:481  チェックボックス書き戻し（別分岐）
```

---

## 3. スタイルシートの構造

`style.css` 484 行に、**用途の異なる 3 種のスタイルが未分離のまま同居**している。

| 用途 | 該当範囲（おおよそ） | 問題 |
| --- | --- | --- |
| アプリシェル（レイアウト） | `style.css:1-330` 前後 | ビューポート固定前提 |
| プレビュー内容（文書の見た目） | `style.css:329-477` の一部 | シェルと混在し切り出せない |
| 印刷 | `style.css:478-483` | `pre` の折り返し指定のみ。実質未整備 |

ビューポート固定を作っている記述。

```text
style.css:1-6     body { display: flex; flex-direction: column; height: 100vh; }
style.css:177     main { display: flex; flex: 1; overflow: hidden; }
style.css:329-335 #preview { flex: 1; height: 100%; overflow: auto; }
```

エクスポート時にこの CSS 全文が埋め込まれるため、印刷が 1 ページで打ち切られる（→ `MDE-001` / `MDE-024`）。

**表に関するスタイルは 1 行も存在しない**（`table` / `th` / `td` / `thead` の記述なし）。ブラウザ既定の枠なし表がそのまま表示される（→ `MDE-006`）。

---

## 4. エクスポート・印刷の実装

### 4-1. Export HTML（`script.js:2617-2686`）

```text
getInlineStylesheetContent()  script.js:2527-2615
  ├─ link[rel=stylesheet].sheet.cssRules から全ルールを取得（HTTP 経由時）
  ├─ 失敗時: fetch → XHR の順でフォールバック
  └─ 最終フォールバック: EXPORT_STYLESHEET_FALLBACK（script.js:2453-2525）

exportHtmlBtn click ハンドラ
  └─ <div id="preview" class="export-preview"> で preview.innerHTML を包み、
     取得した CSS を <style> として埋め込んだ単一 HTML を生成しダウンロード
```

**注目点 2 つ。**

1. HTTP 経由で開いた場合は `style.css` 全文が埋め込まれる。`body { height: 100vh }` と `#preview { height: 100%; overflow: auto }` により印刷が 1 ページで切れる
2. `EXPORT_STYLESHEET_FALLBACK` には `height: 100vh` が含まれない。**`file://` でフォールバックした場合のみ印刷が正常に動く**。症状が環境によって異なる原因がこれ

`.export-preview` クラスは付与されているが、`style.css` にも `EXPORT_STYLESHEET_FALLBACK` にも定義がない。**エクスポート専用スタイルのフックとして未使用のまま残っている。**

### 4-2. Export PDF（`script.js:2428-2451`）

```javascript
const win = window.open('', '', 'width=800,height=600');
// ...
win.document.write(`...<link rel="stylesheet" href="${cssHref}">...<body>${preview.innerHTML}</body>...`);
win.document.close();
win.onload = () => { win.focus(); win.print(); win.close(); };
```

問題が 3 点重なっている（→ `MDE-002`）。

1. `style.css` を `<link>` で読み込むため、`body { height: 100vh }` が適用され 1 ページで切れる。加えて `preview.innerHTML` が `<body>` 直下に置かれ、`#preview` のセレクタが効かないためプレビュー用スタイルも当たらない
2. `document.write()` → `document.close()` の後に `win.onload` を登録しており、環境によっては既に load 済みでハンドラが発火しない
3. `win.print()` の直後の `win.close()` は、印刷ダイアログが非同期な環境で処理を中断させる

### 4-3. 印刷指定の不足

`@page` 指定、改ページ制御（`break-inside` / `break-after`）、表ヘッダの繰り返し（`thead { display: table-header-group }`）がいずれも存在しない。

---

## 5. 外部依存

| 依存 | 取得元 | 固定 | SRI |
| --- | --- | --- | --- |
| marked | `index.html:123` cdn.jsdelivr.net/npm/marked/marked.min.js | **なし** | なし |
| mermaid | `index.html:124` cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js | **なし** | なし |
| @playwright/test | npm（devDependency） | `^1.42.1` | – |

バージョン未指定の CDN 参照は常に最新版を取得する。上流の破壊的変更でアプリが予告なく壊れる可能性があり、オフラインでは起動してもプレビューが描画されない（→ `MDE-008`）。

`apps/avro-viewer/vendor/` にライブラリ同梱の前例がある（`AGENTS.md` の vendor / license 節を参照。既存 vendor 資材は削除・置換しないこと）。

---

## 6. 状態管理と永続化

`js/state.js` の構造。

```text
STORAGE_KEYS = { text: 'md:text', settings: 'md:settings' }   state.js:4-7
state = { docText, settings, cursor, history: { undo: [], redo: [] } }  state.js:14-18
```

**注意すべき点 2 つ。**

1. `history.undo` / `history.redo` の器は存在するが、`undo()` / `redo()` / `applyPatch()` は空実装（`state.js:225` / `227` / `229`）。呼んでも何も起きず、エラーも出ない（→ `MDE-010`）
2. 本文は `md:text` に保存されるが、起動時にクリアされる仕様。既存テスト `startup shows Welcome and clears md:text` がこの挙動を保証している。**現状、リロードで作業内容は失われる**（→ `MDE-011`）

---

## 7. テストのカバー範囲

Playwright 22 件（`actions.spec.js` 8 件 / `render.spec.js` 14 件）。

**カバーされている領域**

- 起動時の初期化と localStorage クリア挙動（5 件）
- 言語切替（3 件）
- ファイル入出力（Open / Save）（3 件）
- Export PDF / Export HTML の**ボタン動作**（2 件）
- 画像挿入、Mermaid 描画（2 件）
- ペイン幅のドラッグと永続化（2 件）
- プレビューのチェックボックス書き戻し、スクロール保持（2 件）
- ヘルプ、テンプレートメニュー（2 件）

**カバーされていない領域**（Phase 2 以降でテスト追加を検討する対象）

- エクスポート結果の**印刷時ページ数**。Export 系のテストはボタンが動くことのみ確認しており、成果物の妥当性は見ていない（→ `MDE-017`）
- 装飾処理（bold / inline code / link）の結果とトグル挙動
- Undo / Redo の挙動
- 右クリックメニューの表示位置と項目状態
- 表の描画結果
- 目次の構築と見出し追従
- リスト自動継続
- 狭幅ビューポートでの表示

---

## 8. 未調査領域の調査結果（Lv2-B 完了）

Lv2-B にて全 8 項目を調査済み。新規検出候補は各項末尾に記載する。

### 8-1. i18n キー網羅性（優先調査）

- `i18n/en.json` と `i18n/ja.json` は同一の 42 キーを保持しており、キー差分はゼロ。
- `i18n.js` 内の埋め込みフォールバック辞書も同一キーセット（fetch 失敗時に使用）。
- キー参照経路は 3 種類：`i18n.t('key')` 直接呼び出し（`script.js` 内）、HTML の `data-i18n="key"` 属性（`index.html`）、`dataset.i18n` へ動的代入後に `i18n.applyToDOM()` で解決（テンプレートボタン、`script.js:493`）。
- `toolbar.hideLineNumbers` / `toolbar.showLineNumbers` は変数経由で動的参照（`script.js:861-862`）。
- **新規検出候補**: `dialogs.replaceFile` と `dialogs.saveFilenamePrompt` の 2 キーは、en.json / ja.json / i18n.js 埋め込み辞書に定義されているが、`script.js` / `index.html` のいずれからも参照されていない（デッドキー候補）。正式付番と優先度判定は Lv2-C に委ねる。

### 8-2. スクロール同期ロジックの安定性（軽微確認）

`preview.js:630-680` 付近を確認。ポインタイベント・タッチ・ホイールによる手動スクロール意図を `editorManualScrollIntentUntil` / `previewManualScrollIntentUntil` で管理し、自動スクロールと干渉しない設計になっている。`compositionstart/update/end` も `attachEditorEvents()` に登録済みで、IME 変換中のスクロール同期は考慮されている（`preview.js:649-653`）。実機テストは未実施（ブラウザ環境なし）。構造上の問題は読解範囲では確認されなかった。

### 8-3. 画像 Base64 メモリ挙動（軽微確認）

`preview.js` 内の `imageMap` オブジェクトに `preview:image` イベントごとにファイル名をキーとして Base64 データを格納する（`preview.js:671-682`）。エビクション処理はなく、挿入した画像はセッション中メモリに保持され続ける。大きな画像を繰り返し挿入した場合のメモリ増大は現実的な懸念だが、ページリロードでリセットされる。現状のユースケースでは許容範囲内と判断するが、将来的な改善候補として記録しておく（新規検出候補・Lv2-C で優先度判定）。

### 8-4. Mermaid 初期化オプション（軽微確認）

`preview.js:88-93` にて以下のオプションで初期化。

```javascript
{ startOnLoad: false, securityLevel: 'loose', flowchart: { htmlLabels: true } }
```

`securityLevel: 'loose'` は Mermaid 内で HTML のレンダリングを許可する設定で、XSS リスクを持つ。Markdown のサニタイズ未実施（`preview.js:717-718`）と組み合わさると、悪意ある Markdown を貼り付けた場合に任意スクリプトが実行可能。テーマ設定は未指定（Mermaid のデフォルトが適用）。セキュリティリスクとして Lv2-C の優先度判定に委ねる。

### 8-5. CI 失敗分析（軽微確認）

`docs/ci-failure-analysis.md` を確認。Azure Static Web Apps のステージング環境上限超過（`BadRequest`）が原因。複数回再現が確認済みで未解決のまま（quota 未解放）。アプリコードとは無関係の基盤課題。

### 8-6. テンプレート整合性（軽微確認）

`template/` 配下の 5 ファイル（`meeting-notes.md` / `readme.md` / `release-notes.md` / `system-change-checklist.md` / `system-change-overview.md`）が実際に存在し、`script.js:381-385` の定義と一致していることを確認。整合性に問題なし。

### 8-7. IME 入力時のハイライト追従（優先調査）

`script.js` のエディタハイライトオーバーレイは `input` イベントのみをリッスンしており（`script.js:2289`）、`compositionstart` / `compositionend` の登録はない。ブラウザは IME 変換中にも `input` イベントを発火するため、`isComposing` チェックなしで `updateEditorHighlight()` が呼ばれる。変換候補文字列がオーバーレイに反映される過程でちらつきや同期ずれが生じる可能性がある。一方、スクロール同期側（`preview.js`）は `compositionstart/update/end` を正しく登録済み（§8-2 参照）。ハイライトオーバーレイへの `compositionstart` / `compositionend` 対応は改善候補（新規検出候補・Lv2-C で優先度判定）。実機テストは未実施（ブラウザ環境なし）。

### 8-8. Playwright 設定（軽微確認）

`playwright.config.js` にタイムアウト・リトライの明示設定なし（Playwright デフォルトが適用：テストタイムアウト 30 秒、リトライ 0 回）。レポータは `list` のみ。`webServer.reuseExistingServer: false` のため、毎回 `npm run dev` を起動する。CI 環境での安定性に影響する可能性があるが、現状テストが通る範囲では許容範囲内。

---

## 9. 主要な行番号リファレンス

コミット `6801ff51` にて全件照合済み。

| 対象 | 位置 |
| --- | --- |
| ビューポート固定（body） | `style.css:1-6` |
| ビューポート固定（main / preview） | `style.css:177`, `style.css:329-335` |
| エディタ幅 40% 固定 | `style.css:186` |
| 目次の無効な sticky | `style.css:347`（親が `overflow:hidden` の flex のため効かない） |
| 印刷スタイル | `style.css:478-483` |
| CDN 読み込み | `index.html:123-124` |
| 装飾: インラインコード | `script.js:1142-1207` |
| 装飾: 外部リンク | `script.js:1210-1262` |
| 装飾: 太字 | `script.js:1265-1326` |
| 右クリックメニュー構築 | `script.js:1545-1655` |
| Export PDF | `script.js:2428-2451` |
| エクスポート用 CSS フォールバック | `script.js:2453-2525` |
| CSS インライン化 | `script.js:2527-2615` |
| Export HTML | `script.js:2617-2686` |
| プレビュー描画（サニタイズなし） | `js/preview.js:717-718` |
| Mermaid 初期化 | `js/preview.js:88` |
| undo/redo 空実装 | `js/state.js:225-229` |
