# Pocketly Development Rules

## Repository purpose

Pocketly は「小さく、軽く、すぐ使えるWebツールを、同じ開発作法で継続的に育てるプロダクト群」です。

## Repository structure

Pocketly の正式なアプリ構成は以下の 4 アプリです。

```text
apps/
├── avro-viewer/
├── csv-gantt-viewer/
├── markdown-editor/
└── restructuredtext-editor/
```

`apps/<app-name>/` は原則として独立したアプリ境界です。対象アプリ以外を「ついでに」変更しないでください。

## Issue-first scope rule

実装対象 Issue を変更スコープの起点として扱います。変更前に最低限以下を確認してください。

1. 対象 Issue
2. 親 Issue の目的
3. 対象範囲
4. 非スコープ
5. 想定変更ファイル
6. 完了条件 / 受入条件

Issue に明示されていない変更へ独断でスコープを拡張しないでください。

## Issue hierarchy and title convention

Pocketly は以下の Issue 階層を使用します。

- Lv1: 大きな目的・テーマ
- Lv2: Lv1 を構成する主要な作業領域
- Lv3: 実装可能な作業単位
- Lv4: 必要に応じたさらに小さな実装単位

Issue タイトルは原則として以下の形式にします。

```text
[アプリ名][Lv1〜Lv4][種別]◯◯する
```

- 接頭辞は `[アプリ名][Lv][種別]` の順序にします。
- `[アプリ名]` は `Pocketly` または正式アプリ名を使用します。
- `[種別]` は `Feature` / `Bug` / `Platform` / `Quality` / `Docs` / `Operations` を初期標準とします。
- タイトル本文は何をする Issue かが分かる動詞表現にします。
- 原則として体言止めを避けます。
- 種別は AI 判断で無制限に増やさず、既存 6 種別で表現できない理由を確認します。

## Application change / monorepo foundation change

```text
Application change
→ 原則 apps/<app-name>/ 内

Monorepo foundation change
→ root / docs / .github 等
```

アプリ機能改修とモノリポ基盤改修を同一 PR へ混在させないでください。

## AI-driven development flow

Pocketly の AI 駆動開発は、以下の役割分担を基本とします。

```text
ChatGPT
  → 企画・要件・設計方針・Issue 設計

GitHub Issue
  → 開発要求と変更スコープの正本

Codex
  → Issue に基づく実装・PR 作成

GitHub Actions
  → 自動品質確認

ChatGPT
  → 実装後レビュー・main マージ判断の最終チェック
```

GitHub Actions は Phase 3 でモノリポ対応予定です。現時点で全変更に CI が存在するとは仮定しないでください。

## Node.js / npm environment

Pocketly の標準開発環境は以下です。

```text
Node.js 24 LTS
npm 11
standard package manager: npm
.nvmrc: 24
```

root `package.json` の `engines` / `devEngines` を尊重してください。`devEngines` 不一致を黙って無視しないでください。

`npm --force` 等で検証を継続した場合は、force が必要だった理由と環境差異を検証結果へ明記してください。


## npm workspaces / dependency management

Pocketly uses npm workspaces for the four official apps. The root `package.json` explicitly lists the workspace paths; do not replace this list with an `apps/*` glob unless an Issue explicitly scopes that change.

Dependency management rules:

- Run dependency installation from the repository root.
- Treat root `package-lock.json` as the canonical resolved dependency tree for the whole workspace.
- Do not create app-level `package-lock.json` files or `npm-shrinkwrap.json`.
- Declare app dependencies in the package.json of the app that uses them.
- Do not move app-owned dependencies such as Playwright to root dependencies unless the target Issue explicitly requires it.

## Standard local development server

Pocketly の標準開発起動は以下です。

```text
npm run dev --workspace=<package-name>
```

標準 URL は以下です。

```text
http://127.0.0.1:8000/
```

共通静的 server は root 管理の `scripts/serve-static.mjs` です。標準起動対象は 1 workspace ずつです。`file://` と Python HTTP server は Pocketly の標準起動入口ではありません。

## Test result truthfulness

検証結果は以下を明確に区別して記録します。

- `passed`
- `attempted but blocked`
- `failed`
- `not run`

テストを「実行した」ことを「成功した」と記録しないでください。外部アクセス制限、Playwright browser 不足、HTTP 403 等で阻害された場合は、環境制約として記録してください。

## GitHub Pages

Pocketly は以下のサブパス配下で公開されます。

```text
https://yuyuyu0706.github.io/pocketly/
```

以下を守ってください。

- domain-root hosting を仮定しない
- `/pocketly/` サブパスを意識する
- 相対パスを優先する
- `.nojekyll` を安易に削除しない
- root `index.html` の 4 アプリ導線を壊さない

## vendor / license

特に以下を安易に削除・置換しないでください。

```text
apps/avro-viewer/vendor/
apps/avro-viewer/vendor/avsc-LICENSE.txt
```

vendor / license 資材を削除・npm dependency へ置換する場合は、対象 Issue が明示的にその変更をスコープへ含むことを確認してください。

## Commonization rule

以下を AI 判断だけで先行作成しないでください。

```text
packages/
shared/
common/
```

共通化は実需が確認され、対象 Issue が明示的に共通化をスコープへ含める場合に実施します。

## Current Phase 2 deferrals

現時点で以下は未整備です。これらが既に存在すると仮定しないでください。

- root test orchestration
- 全アプリ統一 `test` contract
- Playwright browser install方針
- Playwright設定共通化

## Completion checklist

変更完了前に最低限以下を確認してください。

- Issue scope was reviewed
- Non-scope was respected
- Changed files were inspected
- Unrelated apps were not modified
- GitHub Pages paths were preserved
- vendor / license assets were preserved
- Relevant tests were run where possible
- attempted / passed / failed / not run were distinguished
- Environment constraints were recorded
- `git diff --check` was run
