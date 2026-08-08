# 複数ウィンドウ（PiP・ポップアウト）対応 設計規約

> 対象：`apps/markdown-editor2` 配下の全JS
> 関連：Issue #149（MEW-006）、Charter §9-2 原則1

## 1. 背景

MER（Merge Error Report）で報告されたPiP関連の不具合19件のうち9件が、
「`document`/`window`をグローバル固定参照したまま、要素がPiPウィンドウへ
移動した後もメインウィンドウ側のdocument/windowを参照し続けてしまう」
という同一パターンに起因していた。

DOM要素が別ウィンドウ（Document PiP・ポップアウト等）に移動しうる処理を
書く場合、`document`/`window`を静的に固定参照せず、操作対象要素の
`ownerDocument`／`ownerDocument.defaultView`経由で動的に解決すること。

## 2. 正例

要素生成・DOM操作を行う際は、対象要素（またはそれに関連するエディタ等）の
`ownerDocument`を経由する。

```js
// document操作の正例（apps/markdown-editor2/js/formatting.js:112 ほか）
const ownerDoc = _editor.ownerDocument || document;

// window操作の正例（同様のパターンを適用する場合）
const ownerWin = (_editor.ownerDocument && _editor.ownerDocument.defaultView) || window;
```

採用済み箇所：
- `formatting.js`（`112`, `237`, `503`, `591`, `824`, `951`）
- `layout.js`（`59`, `532`, `595`）
- `toc.js`（本Issueで是正、`ensureEditorMeasurementElement`・
  `measureEditorContentBefore`・`buildTOC`・`init`ほか）

## 3. 意図的グローバル例外

ページ全体（メインウィンドウ）に及ぶべき処理は例外として`document`/`window`を
直接参照してよい。ただし、意図的であることを示す`// global: <理由>`コメントを
必須とする。

例：`layout.js`のカラムリサイズ中のドラッグカーソル制御・
`mousemove`/`mouseup`のグローバル捕捉（`748`, `754`, `758`, `801`, `806`）。
これらはPiP文脈で発生しない、メインウィンドウのドラッグ操作に限定される処理。

## 4. 対象外モジュール・箇所（対応不要と判定した理由）

| 対象 | 理由 |
| --- | --- |
| `export.js`（`window.showSaveFilePicker`・`window.open`） | エクスポート操作はメインウィンドウでのみ発生し、PiP文脈では実行されない |
| `script.js`のキーボードショートカット系`document.addEventListener` | ショートカットはメインウィンドウのフォーカス下でのみ意味を持つ操作 |
| `script.js`の初期化時`document.getElementById`（起動時DOM参照確定、26件） | PiP移動前のメインウィンドウで1回のみ実行されるため無害 |
| `layout.js`／`script.js`の未監査箇所のうち上記に該当しないもの | 個別確認の結果、PiP移動対象要素を操作しないため対応不要と判定 |

## 5. セルフチェックリスト（新規コード作成時）

- [ ] この処理が操作するDOM要素は、将来PiP/ポップアウトへ移動しうるか？
- [ ] 移動しうる場合、`document`/`window`を直接参照していないか？
      → `element.ownerDocument` / `element.ownerDocument.defaultView`経由に変更する
- [ ] メインウィンドウ全体を意図的に対象とする処理か？
      → `// global: <理由>`コメントを付け、直接参照のままでよい
- [ ] 対象外モジュール（エクスポート・ショートカット・初期化時DOM取得）に該当するか？
      → 対応不要。ただし判定理由を本ドキュメントの表に追記する
