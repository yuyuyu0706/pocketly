# Markdown Editor Workspace（MEW）– 現状構成と引き継ぎ資産の棚卸し

> 配置先: `apps/markdown-editor2/docs/workspace-02-current-state.md`
> 調査基準コミット: `7dab89118866854162e302f995f05593e2db799a`（2026-08-08）
> 親 Issue: #134 / 対応 Lv2: Lv2-2（Issue #138）
> 調査基準: 上記コミット時点の実コードと全行を照合済み

**行番号はすべて上記コミット時点のもの。** 本文書は `refine-02-current-state.md`（コミット `6801ff51` 基準）を流用せず、現行コードの全面再調査に基づく。

---

## 1. ファイル構成と規模

```text
apps/markdown-editor2/
├── index.html             168 行   アプリシェル、ツールバー、依存の読み込み
├── app.css                792 行   レイアウト・UI スタイル
├── document.css            35 行   エディタペインの文書スタイル
├── preview.css             84 行   プレビューペインのスタイル
├── script.js              925 行   メインオーケストレーター（bootstrap / startApp）
├── config.js                2 行   既定言語のみ
├── i18n.js                506 行   翻訳ヘルパー（埋め込み辞書 + JSON 読み込み）
├── i18n/
│   ├── en.json                     英語辞書
│   └── ja.json                     日本語辞書
├── js/
│   ├── bus.js              76 行   pub/sub イベントバス
│   ├── state.js           259 行   アプリ状態・localStorage / sessionStorage 永続化
│   ├── slug.js             44 行   見出し ID 生成
│   ├── preview.js         927 行   Markdown 描画・Mermaid・スクロール同期
│   ├── export.js          345 行   HTML / PDF / Markdown ファイル出力
│   ├── layout.js          906 行   ハイライトオーバーレイ・行番号・PiP・ペイン幅
│   ├── formatting.js      957 行   装飾・クリップボード・右クリックメニュー
│   └── toc.js             569 行   目次構築・見出し追従
├── vendor/
│   ├── marked.min.js       79 行   marked v18.0.7（MIT）
│   ├── marked-LICENSE.txt          ライセンス文
│   ├── mermaid.min.js    3587 行   mermaid（MIT）※バージョンはファイル内で確認要
│   └── mermaid-LICENSE.txt        ライセンス文
├── template/                       Markdown テンプレート 5 種
│   ├── meeting-notes.md
│   ├── readme.md
│   ├── release-notes.md
│   ├── system-change-checklist.md
│   └── system-change-overview.md
├── tests/
│   ├── actions.spec.js    354 行
│   ├── export-regression.spec.js 138 行
│   ├── floating-panel.spec.js   199 行
│   ├── line-number-wrap.spec.js 232 行
│   ├── lv4-4-logic.spec.js      202 行
│   ├── mde004-verification.spec.js 155 行
│   ├── mode-switch.spec.js      148 行
│   ├── pip-fallback.spec.js      53 行
│   ├── pip-window-persistence.spec.js 99 行
│   ├── render.spec.js           600 行
│   ├── save-file-api.spec.js    317 行
│   └── toc-accordion.spec.js    180 行
├── images/icons.png
├── package.json
├── playwright.config.js
└── docs/                           本ドキュメント等
```

**アプリコード合計（index.html / CSS×3 / script.js / config.js / i18n.js / js/*）**: 6,595 行
**テスト合計**: 2,677 行（12 ファイル）

---

## 2. アーキテクチャ

### 2-1. モジュール構造

ビルドステップを持たない静的アプリ。`index.html` が以下の順にスクリプトを読み込む（`index.html:153-165`）。

```text
vendor/marked.min.js → vendor/mermaid.min.js → config.js → i18n.js
  → js/bus.js → js/state.js → js/slug.js → js/preview.js
  → js/export.js → js/layout.js → js/formatting.js → js/toc.js
  → script.js
```

すべて `window` 上のグローバルで連携する（ES Modules 未使用）。`refine-02` 時点（4 モジュール）から **8 モジュール**（+export / formatting / layout / toc）に増加済み。

### 2-2. 責務の分布

| モジュール | 責務 | 分離状態 |
| --- | --- | --- |
| `js/bus.js` | pub/sub イベントバス（`Bus.on/off/emit`） | 適切に分離済み |
| `js/state.js` | 本文・設定・カーソルの保持、localStorage / sessionStorage 永続化 | 分離済み |
| `js/slug.js` | 見出しから URL 安全 ID を生成 | 適切に分離済み |
| `js/preview.js` | Markdown 描画・Mermaid 変換・スクロール同期・チェックボックス書き戻し | 分離済み |
| `js/export.js` | HTML / PDF / Markdown ファイル出力 | 分離済み |
| `js/layout.js` | ハイライトオーバーレイ・行番号ガター・ペイン幅ドラッグ・PiP 状態管理 | 分離済み |
| `js/formatting.js` | 装飾処理・クリップボード・右クリックメニュー | 分離済み |
| `js/toc.js` | 目次構築・見出しハイライト追従 | 分離済み |
| `script.js` | bootstrap / startApp・イベント配線・PiP ウィンドウ管理・ファイル I/O | オーケストレーター |

`refine-02` 時点で `script.js` に同居していた大部分の責務が各 `js/` モジュールへ分離済み。

### 2-3. データフロー

```text
[textarea#editor] --input--> AppState.setText() --Bus.emit('text:changed')-->
    ├─→ Preview.render()                  （プレビュー描画）
    ├─→ Layout.updateEditorHighlight()    （ハイライトオーバーレイ更新）
    └─→ Layout.scheduleUpdateLineNumbers() （行番号更新）

[プレビューのチェックボックス] --click--> editor.value 直接書き換え
                                        --> AppState.setText()
[目次クリック] --Bus.emit('toc:jump')--> エディタ選択 + プレビュースクロール
[画像ドロップ] --Bus.emit('preview:image')--> imageMap に Base64 格納
```

### 2-4. 主要エントリポイント

| 関数/変数 | ファイル:行 | 役割 |
| --- | --- | --- |
| `bootstrap()` | `script.js:1` | DOMContentLoaded 時に i18n 初期化後 startApp を呼び出す |
| `startApp()` | `script.js:12` | DOM 取得・モジュール初期化・イベント配線 |
| `Preview.init()` | `script.js:441` | プレビューモジュール初期化 |
| `Formatting.init()` | `script.js:444` | 装飾モジュール初期化 |
| `Layout.init()` | `script.js:447` | レイアウトモジュール初期化 |
| `Export.init()` | `script.js:553` | エクスポートモジュール初期化 |
| `AppState.init()` | `js/state.js:153` | 状態初期化（sessionStorage 復元含む） |
| `AppState.STORAGE_KEYS` | `js/state.js:4` | `md:text`（sessionStorage）/ `md:settings`（localStorage）|
| `ensureImageMap()` | `js/preview.js:49` | `window.__previewImageMap` の初期化 |
| `setupMermaid()` | `js/preview.js:84` | mermaid 初期設定（`securityLevel:'loose'`）|
| `isDocumentPiPSupported()` | `js/layout.js:862` | Document PiP 対応判定 |

---

## 3. CSS 構造

| ファイル | 行数 | 役割 |
| --- | --- | --- |
| `app.css` | 792 | ツールバー・ペイン分割・モード切替・PiP 対応など UI 全体 |
| `document.css` | 35 | エディタ `<textarea>` の文書スタイル（フォント・行高） |
| `preview.css` | 84 | プレビュー領域のコンテンツスタイル（見出し・コード・テーブル） |

`refine-02` 時点の `style.css` 1 枚（484 行）から 3 ファイル分割済み。合計 911 行。

---

## 4. エクスポート・印刷

`js/export.js` が担う（`export.js:200` に `init()` 関数）。パイプラインは単一プレビューの `innerHTML` 前提。

- **HTML エクスポート**: `preview.innerHTML` をラップして `<html>` ドキュメントを生成（`export.js:313`）。CSS は `preview.css` / `document.css` をフェッチして埋め込む（フォールバックあり）
- **PDF エクスポート**: プレビュー DOM を複製して印刷ダイアログを呼び出す（`export.js:285-286`）
- **Markdown 保存**: File System Access API（`showSaveFilePicker`）を使用。非対応環境ではダウンロードにフォールバック（`script.js:558`）

---

## 5. 外部依存（vendor/）

| ライブラリ | バージョン | ライセンス | 同梱方式 |
| --- | --- | --- | --- |
| marked | v18.0.7 | MIT | `vendor/marked.min.js`（79 行） |
| mermaid | 不明（要確認） | MIT | `vendor/mermaid.min.js`（3587 行） |

CDN 参照を廃止し `vendor/` ディレクトリへ同梱済み。バージョン固定によりネットワーク断でも動作する。

---

## 6. 状態管理と永続化

| 状態 | 保持先 | キー | 詳細 |
| --- | --- | --- | --- |
| 編集テキスト | `sessionStorage` | `md:text` | `state.js:5`。デバウンス 300ms で保存（`state.js:16`）。リロード時に復元 |
| 設定（言語・行番号・モード） | `localStorage` | `md:settings` | `state.js:6`。`AppState.setSetting()` 呼び出し時に即時保存 |
| ペイン幅比率 | `localStorage` | `md:layout:editorWidthRatio` | `layout.js:36` |
| PiP ウィンドウ位置 | `localStorage` | `md:layout:pipWindow` | `script.js:616` |

`state.js` が保持するドキュメント状態は **単一文書シングルトン**（`docText` 1 変数）。複数文書の並行保持は設計上不可。

---

## 7. テストカバー範囲

| テストファイル | 対象範囲 |
| --- | --- |
| `tests/actions.spec.js` | エディタ操作（入力・選択・装飾） |
| `tests/export-regression.spec.js` | HTML / PDF エクスポートのリグレッション |
| `tests/floating-panel.spec.js` | フローティングパネル動作 |
| `tests/line-number-wrap.spec.js` | 行番号ガターの折り返し対応 |
| `tests/lv4-4-logic.spec.js` | Lv4-4 課題対応ロジック |
| `tests/mde004-verification.spec.js` | MDE-004 検証 |
| `tests/mode-switch.spec.js` | 読み取り / 編集モード切替 |
| `tests/pip-fallback.spec.js` | PiP 非対応環境フォールバック |
| `tests/pip-window-persistence.spec.js` | PiP ウィンドウ位置の永続化 |
| `tests/render.spec.js` | Markdown レンダリング |
| `tests/save-file-api.spec.js` | File System Access API 保存 |
| `tests/toc-accordion.spec.js` | 目次アコーディオン |

CI 環境（`navigator.webdriver === true`）では PiP 系テストが自動スキップされる（`layout.js:863`）。

---

## 8. 主要な行番号リファレンス

| 記号/関数 | ファイル:行 |
| --- | --- |
| `Bus.on/off/emit` | `js/bus.js:16/32/46` |
| `STORAGE_KEYS` | `js/state.js:4` |
| `AppState.init()` | `js/state.js:153` |
| `AppState.getText/setText` | `js/state.js:169/179` |
| `Slug.slugify` | `js/slug.js:24` |
| `Slug.createGenerator` | `js/slug.js:36` |
| `imageMap` 宣言 | `js/preview.js:21` |
| `ensureImageMap()` | `js/preview.js:49` |
| `setupMermaid()` | `js/preview.js:84` |
| `mermaid.initialize({securityLevel:'loose'})` | `js/preview.js:88-90` |
| `imageMap[trimmedFilename]`（参照） | `js/preview.js:365` |
| `imageMap[trimmed] = payload.data`（書き込み） | `js/preview.js:690` |
| `compositionstart` 登録 | `js/preview.js:658` |
| `compositionend` 登録 | `js/preview.js:660` |
| `Export.init()` | `js/export.js:200` |
| `preview.innerHTML`（PDF） | `js/export.js:286` |
| `preview.innerHTML`（HTML） | `js/export.js:313` |
| `_isPiP` 宣言 | `js/layout.js:40` |
| `isDocumentPiPSupported()` | `js/layout.js:862` |
| `Layout.setPiPMode()` | `js/layout.js:903` |
| `event.isComposing`（IME ガード） | `js/formatting.js:730` |
| `editor.addEventListener('input',…)` | `script.js:507` |
| `documentPictureInPicture.requestWindow()` | `script.js:828` |
| `PIP_WINDOW_KEY` | `script.js:616` |

---

## 9. MEWレンズ評価（複数文書化の観点：①〜⑩）

### ① 「0秒で読める」資産の現状と毀損リスク

**事実**: ビルドステップなし・インデックス構築なし。`index.html` を開いた瞬間、`bootstrap()` → `startApp()` → `AppState.init()` が走り、`sessionStorage` から前回テキストを復元してプレビューを表示する（`script.js:1-3` / `state.js:153`）。

**確認**: 外部ネットワーク参照は廃止済み（`vendor/` 同梱）。単一ファイルを開く限り、オフライン・ネットワーク断でも即時表示が保証される。

**制約**: 現状はフォルダ読み込み機能がなく単一ファイル前提。フォルダ全読み込みを素朴に実装すると、最初の表示がインデックス完了待ちになりこの優位が失われる。

`→Phase 2設計事項`（フォルダ対応時の「表示優先・インデックス遅延構築」原則を設計書に明文化）

---

### ② 状態モデルが単一文書シングルトン

**事実**: `state.js:18` で `docText: ''` を単一変数で保持。保存キーも `md:text`（`state.js:5`）の 1 キーのみ。複数文書を並行保持する API は存在しない。

**確認**: `AppState.getText/setText` は文字列を 1 本のみ扱う（`state.js:169/179`）。タブ・複数文書ウィンドウは現 state.js の増築では実現不可で、**文書コレクションモデルへの再設計**が必要。

`→台帳候補`（複数文書対応の前提として state.js 再設計が必須であることを台帳に記録）

---

### ③ 相対パス解決機構の完全な不在

**事実**: 画像は `imageMap` に Base64 で格納（`preview.js:690`）。エビクション処理なし（`preview.js:21-55`）。`DirectoryHandle` / `FileSystemDirectoryHandle` の実装はコード全体でゼロ。文書間リンクの相対パス解決もなし。

**確認**: `showOpenFilePicker`（`script.js:178`）でファイル単体を開く API のみ実装。フォルダ文脈での相対パス解決は設計上不在。imageMap の Base64 蓄積はエビクションなしのため、大量画像挿入時にメモリが増大する。

`→台帳候補`（imageMap エビクション不在によるメモリ増大リスク）
`→Phase 2設計事項`（DirectoryHandle 起点の相対パス解決基盤）

---

### ④ 「読む機能」がゼロ

**事実**: 読書位置記憶・しおり・既読管理・文書内検索 UI のいずれも実装なし。ブラウザの Ctrl+F に全面依存。スクロール位置の永続化は sessionStorage のテキスト復元のみで、プレビュー側スクロール位置は保存されない。

**確認**: `state.js` の永続化項目は `docText` / `settings` / `cursor`（エディタカーソル座標）のみ。プレビュースクロール位置の保存キーは存在しない。

`→台帳候補`（リーダー機能の中核課題：読書位置記憶・文書内検索の不在）

---

### ⑤ Document PiP が単一文書に固定

**事実**: `documentPictureInPicture.requestWindow()` を使った Document PiP を実装済み（`script.js:828`）。PiP ウィンドウの位置・サイズは `localStorage` に永続化される（`script.js:616`）。ただし PiP は現在表示中の 1 文書のみを対象とし、複数文書を投影する機能はない。CI 環境（`navigator.webdriver`）では PiP が無効化される（`layout.js:863`）。

**確認**: `_isPiP` フラグ（`layout.js:40`）は bool 値 1 本。複数 PiP ウィンドウや文書切替後の PiP 更新は未設計。

`→Phase 2設計事項`（タブ基盤と PiP の接続設計：任意文書を PiP へ投影する動線）

---

### ⑥ ToC・slug のスコープが単一文書

**事実**: `toc.js` は現在表示中の 1 文書の見出しのみを対象に目次を構築する（`toc.js:1-569`）。`slug.js` も単一文書スコープで slug を生成・重複排除する（`slug.js:36`）。

**確認**: 見出し情報は `headings` / `tocItems` 配列（`toc.js:13-14`）で保持されるが、文書をまたぐインデックスは存在しない。横断 ToC には全文書の見出しを事前収集するインデックス基盤が必要。

`→Phase 2設計事項`（横断 ToC 基盤：遅延インデックスと①の「0秒起動」との設計統合）

---

### ⑦ エクスポートが単一文書 `innerHTML` 前提

**事実**: HTML エクスポート（`export.js:313`）・PDF エクスポート（`export.js:286`）ともに `preview.innerHTML` を 1 つ取得するパイプライン。複数 md → 1 ドキュメントのマージは設計外。

**確認**: `Export.init()` のシグネチャ（`export.js:200`）は `preview` DOM 要素を単一受け取り。マルチドキュメント対応には export パイプラインの再設計が必要。

`→Phase 2設計事項`（⑥の横断 ToC と連動した「フォルダを 1 冊に綴じる」エクスポート拡張の余地）

---

### ⑧ URL・History API の不使用

**事実**: `hash` / `History API`（`pushState` / `replaceState`）の実装はコード全体でゼロ。ブラウザの「戻る」ボタンはアプリ離脱になる。

**確認**: `script.js` / `js/*.js` 全体を検索し、`location.hash` / `history.pushState` / `history.replaceState` の実装なしを確認。

`→台帳候補`（タブ / 文書間リンク実装時に同時設計すべき基盤）

---

### ⑨ レンダリングコスト設計の不在

**事実**: Markdown レンダリングは `Preview.render()` が都度フル描画する設計。Mermaid は `securityLevel: 'loose'`（`preview.js:90`）で同期的に実行。描画結果のキャッシュ・遅延化・破棄の仕組みはない。

**確認**: `setupMermaid()` で `startOnLoad: false` を設定（`preview.js:89`）するが、`mermaid.run()` / `mermaid.init()` はプレビュー全体ノードを一括処理する（`preview.js:393-397`）。タブ N 枚時に問題化する。

**既知リスク**: `securityLevel: 'loose'` は XSS リスクを内包する（`refine-02` でも把握済み）。サニタイズゲートとレンダリングキャッシュは同時期に設計すべき。

`→台帳候補`（Mermaid の `securityLevel:'loose'` XSS リスク）
`→Phase 2設計事項`（描画キャッシュ・遅延化・サニタイズゲートの統合設計）

---

### ⑩ 検索機能がゼロ（完全な更地）

**事実**: 文書内検索・横断検索とも実装なし。`script.js` / `js/*.js` 全体を検索し、検索関連 API（`find()` / `CTRL+F` 連携 / `TreeWalker` による全文走査など）の実装ゼロを確認。

**確認**: 更地であることは、Obsidian 流の「書き手向け検索」を踏襲せず「**読み手向け検索**」を最初から設計できる自由でもある。

`→台帳候補`（横断検索・文書内検索の不在）
`→vision候補`（「検索結果がすでに読める」レンダリング済みプレビュー断片表示）

---

## 10. 付録：MER 未着地候補の棚卸し

`refine-02` §8 で「新規検出候補（Lv2-C で優先度判定）」とされた 3 件の MEW への収容要否を確認した。

### A. デッドi18nキー（`dialogs.replaceFile` / `dialogs.saveFilenamePrompt`）

**refine-02 の記述**: `script.js` / `index.html` からの参照なし（デッドキー候補）として検出。

**MEW での現状**: `i18n.js:34,42` および `i18n/en.json:30,36` / `i18n/ja.json:30,36` に定義あり。`script.js` および `index.html` 全体を検索した結果、`dialogs.replaceFile` / `dialogs.saveFilenamePrompt` への参照はゼロ。デッドキーとして残存確認。

`→台帳候補`（デッドi18nキー 2 件：`dialogs.replaceFile` / `dialogs.saveFilenamePrompt`）

---

### B. imageMap のメモリ増大リスク

**refine-02 の記述**: エビクション処理なし・将来的な改善候補として記録。Lv2-C で優先度判定予定だったが MER 凍結で未着地。

**MEW での現状**: `preview.js:21` の `imageMap` は同じ設計を引き継いでいる（エビクションなし・`preview.js:690` で書き込み）。フォルダ規模の複数文書化を検討する MEW では影響が拡大する。

`→台帳候補`（上記③と統合して優先度判定推奨）

---

### C. IME 入力時のハイライト追従

**refine-02 の記述**: エディタハイライトオーバーレイが `compositionstart/end` を未登録で、変換中にちらつきの可能性あり。スクロール同期側（`preview.js`）は対応済み。Lv2-C で優先度判定予定だったが MER 凍結で未着地。

**MEW での現状**:
- `preview.js:658/660` で `compositionstart` / `compositionend` の登録あり（スクロール同期側は対応済み）
- `layout.js` の `updateEditorHighlight()` は `script.js:507` の `input` イベントリスナー経由で呼ばれる。`compositionstart/end` の直接登録は `layout.js` / `script.js` ともになし
- `formatting.js:730` で `event.isComposing` チェックはあるが、これはリスト継続処理のガードであり、ハイライト更新のガードではない

`→台帳候補`（ハイライトオーバーレイへの `compositionstart/end` 対応不在）
