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
├── index.html
└── .nojekyll
```

- `apps/`: Pocketly で管理する各アプリを配置します。
- `docs/`: 移行・検証・設計に関する文書を配置します。
- `index.html`: GitHub Pages のルート入口です。
- `.nojekyll`: GitHub Pages で静的ファイルをそのまま配信するための設定です。

## ベースライン文書

初期モノリポ移行の基準点は [`docs/monorepo-migration-baseline.md`](docs/monorepo-migration-baseline.md) に記録しています。

Git tag `monorepo-baseline` は、Phase 0 完了時点のアプリ配置、GitHub Pages 導線、移行検証結果を固定した初期移行基準点です。今後の基盤整備や開発フロー統一は、このベースラインから段階的に進めます。

## 開発ロードマップ概要

Pocketly のモノリポ開発基盤は、以下の Phase で整備します。

- Phase 0: 移行ベースライン固定（完了）
- Phase 1: ルート開発環境
- Phase 2: 開発・テスト入口統一
- Phase 3: GitHub Actions
- Phase 4: Pocketly App Contract
- Phase 5: 必要に応じた共通化

## 開発を始めるとき

現時点では、リポジトリルートの共通 npm scripts は未整備です。そのため、ルートから一括で実行する共通コマンドは定義していません。

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

詳細な AI 駆動開発ルールは、後続 Issue で整備する `AGENTS.md` に委ねます。
