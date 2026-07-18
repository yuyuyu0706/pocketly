# Pocketly

Pocketly は「小さく、軽く、すぐ使えるWebツールを、同じ開発作法で継続的に育てるプロダクト群」です。

このリポジトリは、ブラウザだけで利用できる静的 Web アプリを `apps/` 配下に集約し、GitHub Pages から利用できる状態で管理します。ルート README は、Pocketly 全体の目的、現在のアプリ構成、公開入口、開発ロードマップ、参照すべき文書への案内板です。個別アプリの詳しい使い方や開発方法は、各アプリの README を参照してください。

## GitHub Pages

公開入口は以下です。

- <https://yuyuyu0706.github.io/pocketly/>

ルート Pages から、現在管理している 4 アプリへ遷移できます。

## アプリ一覧

| アプリ | パス | 用途 | README |
| --- | --- | --- | --- |
| Markdown Editor | `apps/markdown-editor/` | Markdown の編集、プレビュー、Mermaid 図、テンプレート利用をブラウザ内で行うエディタです。 | [`apps/markdown-editor/README.md`](apps/markdown-editor/README.md) |
| CSV Gantt Viewer | `apps/csv-gantt-viewer/` | CSV データをもとにガントチャートを表示し、カテゴリ順などを調整できるビューアです。 | [`apps/csv-gantt-viewer/README.md`](apps/csv-gantt-viewer/README.md) |
| Avro Viewer | `apps/avro-viewer/` | ローカルの `.avro` ファイルをブラウザだけで読み込み、schema・レコード・プロファイルを確認するビューアです。 | [`apps/avro-viewer/README.md`](apps/avro-viewer/README.md) |
| reStructuredText Editor | `apps/restructuredtext-editor/` | reStructuredText を編集し、HTML プレビュー、保存、エクスポートを行う静的 Web エディタです。 | [`apps/restructuredtext-editor/README.md`](apps/restructuredtext-editor/README.md) |

## リポジトリ構成

現在のルート構成は以下を基本とします。

```text
pocketly/
├── apps/
├── docs/
├── .github/
│   └── ISSUE_TEMPLATE/
├── .editorconfig
├── .gitignore
├── .nvmrc
├── AGENTS.md
├── package.json
├── package-lock.json
├── scripts/
│   └── serve-static.mjs
├── index.html
└── .nojekyll
```

- `apps/`: Pocketly で管理する各アプリを配置します。
- `docs/`: 移行・検証・設計に関する文書を配置します。
- `.github/ISSUE_TEMPLATE/`: Lv1〜Lv4 Issue Template を配置します。
- `AGENTS.md`: AI エージェントと開発者が守る現在の開発ルールです。
- `package.json`: ルートの Node.js / npm 方針と正式 4 アプリの npm workspaces を記録します。
- `package-lock.json`: workspace 全体の解決済み dependency tree を固定する唯一の lockfile です。
- `scripts/serve-static.mjs`: 4 アプリ共通の root-owned 静的開発 HTTP server です。
- `index.html`: GitHub Pages のルート入口です。
- `.nojekyll`: GitHub Pages で静的ファイルをそのまま配信するための設定です。

## ベースライン文書

初期モノリポ移行の基準点は [`docs/monorepo-migration-baseline.md`](docs/monorepo-migration-baseline.md) に記録しています。

Git tag `monorepo-baseline` は、Phase 0 完了時点のアプリ配置、GitHub Pages 導線、移行検証結果を固定した初期移行基準点です。今後の基盤整備や開発フロー統一は、このベースラインから段階的に進めます。

Phase 1 で固定したルート開発環境の完了状態と Phase 2 への引き継ぎ事項は [`docs/phase-1-root-development-baseline.md`](docs/phase-1-root-development-baseline.md) に記録しています。

Phase 2 のアプリ package metadata と実行契約は [`docs/phase-2-package-execution-contract.md`](docs/phase-2-package-execution-contract.md) に記録しています。

## 開発ロードマップ概要

Pocketly のモノリポ開発基盤は、以下の Phase で整備します。

- Phase 0: 移行ベースライン固定（完了）
- Phase 1: ルート開発環境（完了）
- Phase 2: 開発・テスト入口統一
- Phase 3: GitHub Actions
- Phase 4: Pocketly App Contract
- Phase 5: 必要に応じた共通化

## 開発を始めるとき

### 開発環境

Pocketly の標準開発環境は以下です。

- Node.js 24 LTS
- npm 11
- 標準 package manager は npm
- `.nvmrc` を利用して Node.js 系列を合わせます
- npm workspaces で正式 4 アプリを管理します
- 依存関係のインストールはリポジトリルートで行います
- root `package-lock.json` を workspace 全体の唯一の lockfile として管理します
- アプリ配下へ `package-lock.json` や `npm-shrinkwrap.json` は作成しません
- dependency は利用する各アプリの `package.json` で宣言します

標準の依存関係セットアップは、リポジトリルートで以下を実行します。

```sh
npm ci
```

依存関係を変更する場合は、リポジトリルートで以下を実行して root `package-lock.json` を更新します。

```sh
npm install
```

### アプリをローカル起動する

4 アプリの標準開発起動は、リポジトリルートから workspace package name を指定します。

```sh
npm ci
npm run dev --workspace=<package-name>
```

標準 URL は全アプリ共通で以下です。

```text
http://127.0.0.1:8000/
```

| アプリ | package name | 起動コマンド |
| --- | --- | --- |
| Avro Viewer | `avro-viewer` | `npm run dev --workspace=avro-viewer` |
| CSV Gantt Viewer | `csv-gantt-viewer` | `npm run dev --workspace=csv-gantt-viewer` |
| Markdown Editor | `markdown-editor` | `npm run dev --workspace=markdown-editor` |
| reStructuredText Editor | `restructuredtext-editor` | `npm run dev --workspace=restructuredtext-editor` |

停止は起動中の terminal で `Ctrl+C` です。全アプリが `127.0.0.1:8000` を使うため、標準では一度に 1 workspace だけを起動します。root 共通の `npm run dev` は定義しません。また、long-running process と port 競合を避けるため `npm run dev --workspaces` は使用しません。

各アプリの利用方法、開発方法、テスト方法は、それぞれのアプリ README を参照してください。

- [`apps/markdown-editor/README.md`](apps/markdown-editor/README.md)
- [`apps/csv-gantt-viewer/README.md`](apps/csv-gantt-viewer/README.md)
- [`apps/avro-viewer/README.md`](apps/avro-viewer/README.md)
- [`apps/restructuredtext-editor/README.md`](apps/restructuredtext-editor/README.md)

## Issue / PR 運用

Pocketly では、モノリポ基盤整備やアプリ改善を段階的に進めるため、Issue 階層を利用します。

- Lv1: 大きな目的・テーマ
- Lv2: Lv1 を構成する主要な作業領域
- Lv3: 実装可能な作業単位
- Lv4: 必要に応じたさらに小さなタスク

PR は原則として実装単位ごとに分離します。アプリ機能改修とモノリポ基盤改修は混在させず、レビューしやすい範囲に保ちます。

通常の Issue 起票には `.github/ISSUE_TEMPLATE/` の Lv1〜Lv4 Issue Template を利用します。Issue タイトルは原則として以下の形式にします。

```text
[アプリ名][Lv1〜Lv4][種別]◯◯する
```

詳細な AI 駆動開発ルール、Issue-first の変更スコープ原則、タイトル規約、検証結果の記録方法は [`AGENTS.md`](AGENTS.md) を参照してください。
