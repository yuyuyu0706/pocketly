# Phase 1 Root Development Baseline

## 1. Purpose

This document records the completed state of Pocketly Phase 1: root development environment. It separates historical Phase 1 decisions from the currently active development rules in `AGENTS.md`.

## 2. Starting baseline

Phase 1 started from the Phase 0 migration baseline.

- Phase 0 / Lv2: [Lv2]移行ベースラインを固定し、アプリ配置・命名を整理する #2
- Git tag: `monorepo-baseline`
- Baseline document: `docs/monorepo-migration-baseline.md`

`docs/monorepo-migration-baseline.md` remains the Phase 0 historical baseline and is not overwritten by this Phase 1 record.

## 3. Phase 1 completed work

Phase 1 consists of the following completed Lv3 work.

- [Lv3]ルートREADMEと共通基本設定を整備する #10 / PR #11
- [Lv3]Node.js・npm・ルートpackage構成を整備する #12 / PR #13
- [Lv3]AI駆動開発ルールとPhase 1完了状態を記録する #14 / corresponding PR

## 4. Final root structure

Phase 1 completion expects the following root structure.

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
├── README.md
├── index.html
└── .nojekyll
```

## 5. Fixed decisions

The following decisions are fixed at the end of Phase 1.

- Node.js 24 LTS
- npm 11
- standard package manager: npm
- `.nvmrc = 24`
- root `package.json`
- `private: true`
- `engines`
- `devEngines`
- app independence under `apps/<app-name>/`
- Issue-first scope rule
- Issue title convention: `[アプリ名][Lv1〜Lv4][種別]◯◯する`
- test result truthfulness: distinguish passed / attempted but blocked / failed / not run
- GitHub Pages subpath rule for `/pocketly/`
- vendor / license preservation
- commonization after demonstrated need

## 6. AI-driven development rules

The currently active rules are maintained in `AGENTS.md`. Phase 1 establishes that Pocketly development uses the Issue as the source of truth for change scope and separates these responsibilities:

- ChatGPT: planning, requirements, design direction, Issue design
- GitHub Issue: authoritative development request and change scope
- Codex: implementation and PR creation based on the Issue
- GitHub Actions: automated quality checks
- ChatGPT review: final implementation review and main merge judgment

## 7. Issue template baseline

Phase 1 introduces Markdown Issue Templates under `.github/ISSUE_TEMPLATE/`.

- `config.yml` disables blank issues for normal issue creation.
- `lv1_issue.md` defines large goals and themes.
- `lv2_issue.md` defines major work areas under Lv1.
- `lv3_issue.md` defines implementable work units and may map directly to one PR.
- `lv4_issue.md` defines smaller implementation units only when Lv3 needs further splitting.

The templates share the same title convention and the same initial six issue types: Feature / Bug / Platform / Quality / Docs / Operations.

## 8. Intentionally deferred

The following items are intentionally deferred to Phase 2.

- npm workspaces
- root common scripts
- root `package-lock.json`
- 4アプリの package metadata 整理
- Avro Viewer / reStructuredText Editor の package 方針
- 全アプリ統一 `dev` contract
- 全アプリ統一 `test` contract
- root からの全体 / 個別実行
- Playwright 依存 / browser install 方針
- Playwright 設定共通化

## 9. Phase 2 handoff

Phase 2 should start from the following handoff items.

1. 4アプリの package metadata を整理する
2. Avro Viewer / reStructuredText Editor の package 方針を決定する
3. npm workspaces を導入する
4. workspace 対象範囲を確定する
5. root `package-lock.json` を生成・管理する
6. 各アプリの `dev` contract を定義する
7. 各アプリの `test` contract を定義する
8. root から全体 / 個別実行する scripts を設計する
9. Playwright 依存と browser install 方針を整理する

## 10. Phase 1 completion state

Phase 1 is complete when the root README, common configuration, Node/npm metadata, `AGENTS.md`, Issue Templates, and this baseline document are consistent with each other.

At completion, Pocketly has a minimal root development foundation for AI-driven development: structured Issues define work, `AGENTS.md` records current rules, tests are reported truthfully, and Phase 2 can begin without assuming workspaces, common scripts, or unified app test contracts already exist.
