# Markdown Editor Refine – Phase 1 作業引き継ぎ書

> 本書は **Claude Code が Phase 1（Lv2-A〜E）を実施するための作業指示書** です。
> 配置先: `apps/markdown-editor/docs/refine-00-handoff.md`
> 親 Issue: [#49](https://github.com/yuyuyu0706/pocketly/issues/49)
> 基準コミット: `5602ecfb91dce8ddd21fe3aec70f20d93c9ff531`（2026-07-26 時点の main）

---

## 0. 最初に読むもの

作業開始前に以下を必ず読むこと。順序を守ること。

| 順 | 文書 | 目的 |
| --- | --- | --- |
| 1 | `AGENTS.md`（リポジトリルート） | Pocketly 全体の開発規約。これが最上位 |
| 2 | GitHub Issue #49 | Phase 1 の正本。スコープの起点 |
| 3 | 本書 `refine-00-handoff.md` | 作業単位・成果物・禁止事項 |
| 4 | `refine-01-charter.md` | PJ 憲章。判断の前提 |
| 5 | `refine-02-current-state.md` | 現状分析のドラフト |
| 6 | `refine-03-issue-catalog.md` | 課題台帳のドラフト |
| 7 | `refine-04-vision.md` | 将来構想のドラフト |

---

## 1. Phase 1 の絶対条件

### 1-1. コードを変更しない

**Phase 1 では `apps/markdown-editor/` 配下の `*.js` / `*.css` / `*.html` を一切変更しない。**

分析中に不具合を発見しても、修正せず課題台帳へ登録するのみとする。修正は Phase 2 以降で行う。

PR 提出前に以下で差分が 0 件であることを確認する。

```bash
git diff --name-only main... -- 'apps/markdown-editor/*.js' \
  'apps/markdown-editor/*.css' 'apps/markdown-editor/*.html' \
  'apps/markdown-editor/js/' 'apps/markdown-editor/tests/'
# 出力が空であること
```

### 1-2. 変更してよいファイル

```text
apps/markdown-editor/docs/refine-00-handoff.md   （本書。必要に応じ追記）
apps/markdown-editor/docs/refine-01-charter.md
apps/markdown-editor/docs/refine-02-current-state.md
apps/markdown-editor/docs/refine-03-issue-catalog.md
apps/markdown-editor/docs/refine-04-vision.md
apps/markdown-editor/docs/refine-05-phase-plan.md
```

上記以外への変更はスコープ違反。特に以下は変更しないこと。

- 他アプリ（`apps/avro-viewer/` / `apps/csv-gantt-viewer/` / `apps/restructuredtext-editor/`）
- モノリポ基盤（root `package.json` / `.github/` / `scripts/` / root `docs/`）
- `package-lock.json`（依存の追加・更新は Phase 1 の非スコープ）

### 1-3. 人間の判断を代行しない

以下の 3 項目は **利用者（リポジトリオーナー）が決定する**。Claude Code は選択肢と推奨案を提示し、決定を待つこと。勝手に確定させて先へ進まないこと。

| 決定項目 | 所在 | 状態 |
| --- | --- | --- |
| 想定利用者と主用途（A / B / C） | `refine-01-charter.md` §3-2 | `要決定` |
| 「シンプル」の定義における `N` の値 | `refine-01-charter.md` §3-3 | `要決定` |
| 優先度判定基準の採否 | `refine-01-charter.md` §6 | `要決定` |

決定が得られていない段階では、Lv2-A の PR を「決定待ち」として Draft PR に留めるか、選択肢を提示した状態でレビュー依頼を出すこと。

---

## 2. ドラフトの位置づけ

`refine-02` / `refine-03` / `refine-04` は **調査済みのドラフト**として提供されている。commit `5602ecf` に対する読解結果であり、Claude Code の役割は「ゼロから作る」ことではなく **「実コードに対して検証し、不足を補い、確定させる」** ことである。

各作業では最低限以下を行うこと。

1. ドラフトに記載された **原因箇所（ファイル:行）が実コードと一致するか確認する**。行番号がずれていれば修正する
2. ドラフトが見落としている課題がないか、担当範囲のコードを実際に読んで確認する
3. 検証できなかった項目は「未検証」と明記する（検証したことにしない）

`AGENTS.md` の Test result truthfulness ルールに従い、検証結果は `passed` / `attempted but blocked` / `failed` / `not run` を区別して記録すること。

---

## 3. 作業単位（Lv2）

### Lv2-A: Refine のコンセプトと優先度判定基準を確定する

| 項目 | 内容 |
| --- | --- |
| Issue タイトル | `[Markdown Editor][Lv2][Docs]Refine のコンセプトと優先度判定基準を確定する` |
| Milestone | `[Markdown Editor Refine][Phase 1]課題分析・優先度設定・将来構想` |
| 入力 | `refine-01-charter.md`（Draft）、Issue #49 |
| 成果物 | `refine-01-charter.md`（確定版） |
| 依存 | なし（最初に実施） |

**作業内容**

1. Charter §3 の 3 つの `要決定` について、選択肢と推奨案を整理して利用者へ提示する
2. 決定内容を Charter §3 に確定値として反映し、`要決定` マークを削除する
3. §6 の優先度判定基準・土台性基準について、決定された主用途と矛盾がないか確認して確定する
4. §7 の成功指標のうち、`N` に依存する指標 6 を確定値へ更新する
5. Issue #49 の「重要な設計判断・論点」表を更新する（`要決定` → 確定内容と理由）

**完了条件**

- [ ] Charter §3 に `要決定` の文字列が残っていない
- [ ] 主用途の決定が §6-3 のコンセプト適合チェックと整合している
- [ ] 成功指標 6 の `N` が数値で記載されている
- [ ] Issue #49 の論点表が更新されている

---

### Lv2-B: 現状構成と既知課題の原因箇所を整理する

| 項目 | 内容 |
| --- | --- |
| Issue タイトル | `[Markdown Editor][Lv2][Docs]現状構成と既知課題の原因箇所を整理する` |
| 入力 | `refine-02-current-state.md`（Draft）、実コード |
| 成果物 | `refine-02-current-state.md`（確定版） |
| 依存 | Lv2-A 完了後 |

**作業内容**

1. ドラフト記載の構成・依存・データフローを実コードと突き合わせて検証する
2. 行番号の参照がすべて正しいことを確認する（コミットが進んでいればずれる）
3. ドラフトが未調査としている領域（§7 参照）を追加調査する
4. 既存 Playwright テスト 22 件が「何を守っていて、何を守っていないか」を明確にする

**完了条件**

- [ ] すべての `ファイル:行` 参照が現在の main と一致している
- [ ] ドラフトの「未調査領域」がすべて調査済みまたは調査不要と判断されている
- [ ] 既存テストのカバー範囲と非カバー範囲が一覧化されている
- [ ] 実装ファイルの差分が 0 件である

---

### Lv2-C: 課題台帳を作成し優先度と配属 Phase を判定する

| 項目 | 内容 |
| --- | --- |
| Issue タイトル | `[Markdown Editor][Lv2][Docs]課題台帳を作成し優先度と配属Phaseを判定する` |
| 入力 | `refine-03-issue-catalog.md`（Draft、MDE-001〜025）、確定版 Charter |
| 成果物 | `refine-03-issue-catalog.md`（確定版） |
| 依存 | Lv2-B 完了後 |

**作業内容**

1. ドラフトの 25 件について、Lv2-B の検証結果を反映する
2. Lv2-A で確定した基準を全件へ適用し、**暫定優先度を確定優先度へ更新する**
3. Lv2-B で新たに発見した課題を `MDE-026` 以降で追加する
4. 「新機能」分類の全件に対し、Charter §6-3 のコンセプト適合チェック 3 項目を適用し、結果を備考へ記録する
5. 「対象外」と判定した課題に判定理由を 1 行以上記載する
6. 依存関係（どの課題がどの課題の前提か）を最終確認する

**完了条件**

- [ ] 全行に「優先度」「土台性」「配属 Phase」が入っている
- [ ] 「暫定」の文字列が残っていない
- [ ] 対象外課題に判定理由が記載されている
- [ ] 土台性-高の課題がすべて Phase 2 に配属されている
- [ ] 依存関係に循環がない

---

### Lv2-D: 将来構想を発散し本 Refine 対象外を明示する

| 項目 | 内容 |
| --- | --- |
| Issue タイトル | `[Markdown Editor][Lv2][Docs]将来構想を発散し本Refine対象外を明示する` |
| 入力 | `refine-04-vision.md`（Draft）、確定版 Charter |
| 成果物 | `refine-04-vision.md`（確定版） |
| 依存 | Lv2-B 完了後（Lv2-C と並行可） |

**作業内容**

1. ドラフトの構想 A〜G を確定版 Charter のコンセプトに照らして再評価する
2. 各構想に「本 Refine で扱う / 扱わない」を明示する。扱う場合は対応する `MDE-nnn` を紐づける
3. 「扱わない」と判断したものに理由を記載する
4. **発散はこの作業で一度きり。以降の Phase では追記のみ**というルールを文書冒頭に明記する

**完了条件**

- [ ] 全構想に「扱う / 扱わない」の判定と理由がある
- [ ] 「扱う」構想が課題台帳の `MDE-nnn` と紐づいている
- [ ] Charter §3-4 の非目標と矛盾がない

---

### Lv2-E: Phase2〜5 のスコープを確定し Lv2 Issue を起票する

| 項目 | 内容 |
| --- | --- |
| Issue タイトル | `[Markdown Editor][Lv2][Docs]Phase2〜5のスコープを確定しLv2 Issueを起票する` |
| 入力 | 確定版の refine-01 / 02 / 03 / 04 |
| 成果物 | `refine-05-phase-plan.md` + GitHub Issue（Phase 2〜5 の Lv1 用インプット） |
| 依存 | Lv2-C 完了後 |

**作業内容**

1. 課題台帳の配属 Phase をもとに、Phase 2〜5 の Lv2 Issue 群を設計する
2. 各 Lv2 について、対象範囲・非スコープ・想定変更ファイル・完了条件を記述する
3. Phase 6 の成功指標を測定手順まで含めて確定する
4. GitHub Issue を起票し、各 Milestone へ紐づける

**Issue 起票の注意**

- **Lv3（実装単位）は起票しない。** 各 Phase 着手時に、その時点の知見を反映して切る
- タイトルは `[Markdown Editor][Lv2][種別]◯◯する` 形式。種別は `Feature` / `Bug` / `Platform` / `Quality` / `Docs` / `Operations` の 6 種から選ぶ
- 体言止めを避け、動詞で終える
- Milestone 番号: Phase 2 = `2`、Phase 3 = `3`、Phase 4 = `4`、Phase 5 = `5`

**完了条件**

- [ ] Phase 2〜5 の全 Lv2 Issue が起票され Milestone に紐づいている
- [ ] 課題台帳の全 `MDE-nnn`（対象外を除く）がいずれかの Lv2 Issue でカバーされている
- [ ] Phase 6 の成功指標に測定手順が付いている
- [ ] Issue #49 の「残アクティビティ」表が更新されている

---

## 4. 進行順序と依存

```text
Lv2-A ──→ Lv2-B ──┬──→ Lv2-C ──→ Lv2-E
                   │
                   └──→ Lv2-D
```

- Lv2-A は利用者の決定待ちが発生する。決定が出るまで Lv2-B 以降へ進まないこと
- Lv2-D は Lv2-C と並行可

---

## 5. 作業規約

### ブランチ

```text
docs/mde-refine-phase1-<lv2-id>
例: docs/mde-refine-phase1-lv2b
```

### コミットメッセージ

```text
docs(markdown-editor): <変更内容を動詞で>

Refs #49
```

### PR

- 1 Lv2 = 1 PR とする
- PR 本文に「対象 Lv2 Issue」「成果物」「検証結果」「実装ファイル差分 0 件の確認」を記載する
- **アプリ機能改修とモノリポ基盤改修を同一 PR に混在させない**（Phase 1 は前者のみ）

### 検証コマンド

Phase 1 はコードを変更しないため、テストは回帰確認の意味しか持たない。ただし Lv2-B で既存テストの内容を確認する際に使用する。

```bash
# リポジトリルートで実行
npm ci
npm run test:browser:install
npm run test:list --workspace=markdown-editor   # テスト一覧の確認
npm test --workspace=markdown-editor            # 実行

# 開発サーバ（手動確認用）
npm run dev --workspace=markdown-editor
# → http://127.0.0.1:8000/
```

注意点。

- Playwright が `npm run dev` を自動起動・停止するため、**実行前に手動起動中の port 8000 サーバを停止すること**
- Node.js 24 / npm 11 が前提（`.nvmrc` は 24）
- `npm --force` を使った場合は、必要だった理由と環境差異を PR に明記すること
- ブラウザ準備の対象は Chromium のみ

---

## 6. 文書作成のルール

- 見出しレベルは `##` から始める（`#` は文書タイトルのみ）
- 課題への参照は必ず `MDE-nnn` を使う。文言による参照は禁止（表記揺れで追跡不能になる）
- コード参照は `ファイル:行` 形式（例: `script.js:2428`）。行範囲は `script.js:2428-2451`
- 未確定・未検証の箇所には `要決定` / `未検証` を明示的に書く。曖昧な断定をしない
- 日本語と英数字の間に半角スペースを入れる（既存文書の慣習に合わせる）
- 表は列数を絞る。10 列を超える表は分割を検討する

---

## 7. Phase 2 への申し送り（Phase 1 では実施しない）

Lv2-E でスコープを確定する際、以下を Phase 2 の候補として検討すること。**Phase 1 で実装してはならない。**

土台性-高と暫定判定している課題（詳細は `refine-03-issue-catalog.md`）。

| ID | 内容 | 前提となる後続課題 |
| --- | --- | --- |
| MDE-023 | テキスト編集の共通ユーティリティ化 | MDE-004 / 005 / 015 / 019 / 020 |
| MDE-024 | スタイルシートの用途別分離 | MDE-001 / 002 / 006 / 016 / 021 |
| MDE-025 | エクスポート・印刷処理のモジュール分離 | MDE-001 / 002 / 021 |
| MDE-008 | 外部依存のバージョン固定とオフライン動作確保 | 成功指標 3 |
| MDE-009 | `script.js` の責務分割 | 上記すべての作業効率 |

---

## 8. 困ったときの判断基準

| 状況 | 対応 |
| --- | --- |
| Issue に書かれていない変更をしたくなった | しない。台帳へ登録し、Lv2-E でスコープ判断する |
| コードの不具合を見つけた | 修正しない。`MDE-026` 以降で台帳へ追加する |
| ドラフトの記述が実コードと違う | ドラフトを修正する。実コードが正しい |
| `要決定` 項目の判断に迷う | 決めない。選択肢と推奨案を提示して利用者へ委ねる |
| テストが環境要因で実行できない | `attempted but blocked` として記録する。成功扱いにしない |
| 他アプリにも同じ課題がある | 本 PJ の対象外。記録のみに留め、変更しない |
