# Phase 3 CI Contract

## 1. Purpose

This document is the current CI design contract for Pocketly Phase 3 / Lv3-A. It fixes the GitHub Actions decisions that Lv3-B must implement without adding further design choices. It is not a workflow implementation, completion baseline, or record of GitHub Actions runs.

The parent work is Phase 3 / Lv2 issue #27. This contract reuses the Phase 2 repository-owned execution contract in `docs/phase-2-package-execution-contract.md`; the Phase 2 completion history remains in `docs/phase-2-app-execution-baseline.md`.

## 2. Status

- **Status:** Current CI design contract, decided in Phase 3 Lv3-A.
- **Workflow status:** Not implemented by this document.
- **Historical baseline:** Create `docs/phase-3-ci-baseline.md` only at Phase 3 completion (Lv3-E).
- **Updates:** This document remains the source of truth for the currently effective CI design and may be updated after implementation when a later scoped issue changes that design.

## 3. Phase 2 input contract

CI must reuse the same root command contract used locally. It must not invent CI-only dependency or test scripts.

```bash
npm ci
npm run test:browser:install
npm run test:list
npm test
```

The official workspaces remain explicitly listed in root `package.json`:

| Workspace | `dev` | `test` | Current automated tests |
| --- | --- | --- | --- |
| `avro-viewer` | Yes | No | None |
| `csv-gantt-viewer` | Yes | Yes | Playwright: 10 tests |
| `markdown-editor` | Yes | Yes | Playwright: 22 tests |
| `restructuredtext-editor` | Yes | No | None |

Root orchestration retains `--workspaces --if-present`. Consequently, Avro Viewer and reStructuredText Editor are intentionally skipped without fake passing tests. CSV Gantt Viewer and Markdown Editor run sequentially for 32 tests in total.

Each tested app continues to own its Playwright dependency and configuration. Both app-owned configurations use `http://127.0.0.1:8000/` and `reuseExistingServer: false`; CI must preserve this sequential fixed-port behavior.

## 4. Workflow identity

Lv3-B must implement the following stable identity. The workflow and job names are operational identifiers, including a future required status check, and must not be changed casually after adoption.

| Item | Fixed value |
| --- | --- |
| Workflow file | `.github/workflows/ci.yml` |
| Workflow name | `Pocketly CI` |
| Job ID | `test` |
| Job display name | `Monorepo tests` |

The candidate status check is `Pocketly CI / Monorepo tests`. GitHub's actual displayed check name must be observed after the first workflow run in Lv3-B and finalized in Lv3-C. Lv3-D owns branch protection or ruleset connection.

## 5. Trigger contract

```yaml
on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
  workflow_dispatch:
```

| Trigger | Purpose |
| --- | --- |
| Pull request targeting `main` | Quality check before merge. |
| Push to `main` | Health check after merge. |
| `workflow_dispatch` | Manual re-verification and incident investigation. |

Do not use `pull_request_target`, `schedule`, `repository_dispatch`, `paths`, or `paths-ignore`. Phase 3 initially runs the full root test contract for every targeted pull request and main push.

## 6. Runner and runtime contract

Use one GitHub-hosted x64 job on the explicitly pinned runner:

```yaml
runs-on: ubuntu-24.04
```

Do not use the moving `ubuntu-latest` label. The Node.js version source is `.nvmrc`; do not duplicate it as an inline version in the workflow. Use the npm bundled with Node.js 24 and do not globally install or upgrade npm.

Log the runtime versions before dependency installation:

```bash
node --version
npm --version
```

The expected runtime contract is Node.js 24 and npm 11. Root `package.json` `engines` and `devEngines` remain the runtime guard.

## 7. Permissions, credentials, and action dependencies

Set workflow-level read-only permissions:

```yaml
permissions:
  contents: read
```

Use only these GitHub-maintained actions in the initial workflow:

```text
actions/checkout@v6
actions/setup-node@v6
```

Pin initial GitHub official actions to major tags. Full commit-SHA pinning is a later hardening consideration, not a Phase 3 requirement. Checkout must not persist credentials:

```yaml
- uses: actions/checkout@v6
  with:
    persist-credentials: false
```

Do not grant `contents: write`, `pull-requests: write`, `issues: write`, `actions: write`, `id-token: write`, or `packages: write`. Do not pass repository secrets, environment secrets, or PATs.

## 8. Dependency cache contract

Configure the setup action's npm cache using the root lockfile:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version-file: .nvmrc
    cache: npm
    cache-dependency-path: package-lock.json
```

The cache is npm's package cache only. Do not cache `node_modules`. `package-lock.json` at the repository root is the cache dependency source and remains the single canonical resolved dependency tree. Do not introduce a custom Playwright browser cache in the initial workflow.

## 9. Playwright environment preparation

Separate Linux runner OS dependencies from repository-owned Chromium preparation:

```bash
# GitHub Actions runner-specific OS dependencies
npm exec --workspace=csv-gantt-viewer -- playwright install-deps chromium

# Repository-owned Chromium preparation
npm run test:browser:install
```

The OS-dependency command is a GitHub Actions runner responsibility. The root browser-install command is the repository contract and prepares Chromium. `csv-gantt-viewer` is used solely as the explicit bootstrap entrypoint for a workspace that owns Playwright; this does not move Playwright dependencies or configuration to the root.

Lv3-B must verify on Ubuntu 24.04 that `install-deps chromium` succeeds, the root browser-install command succeeds, both tested workspaces can use the installed Chromium, and the workspace-scoped Playwright CLI resolution is stable.

## 10. Required execution sequence

Lv3-B must implement this order:

```text
1. Checkout
2. Node.js setup
3. Log Node.js and npm versions
4. Restore npm dependency cache
5. npm ci
6. Prepare Linux OS dependencies
7. Prepare Chromium
8. npm run test:list
9. npm test
10. Run failure diagnostics when needed
```

The command steps are:

```bash
node --version
npm --version
npm ci
npm exec --workspace=csv-gantt-viewer -- playwright install-deps chromium
npm run test:browser:install
npm run test:list
npm test
```

Do not use `npm install`, `npm update`, `npm install --force`, or `npm install --legacy-peer-deps` in CI.

`npm run test:list` must precede `npm test`. Discovery is expected to report 10 CSV Gantt Viewer tests and 22 Markdown Editor tests (32 total). The root `--workspaces --if-present` orchestration, app-owned Playwright configurations, Chromium-only browser scope, port 8000, and `reuseExistingServer: false` remain unchanged.

## 11. Concurrency and timeout

Cancel obsolete runs for the same pull request or event/branch, while keeping different event types separate:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

This groups pull request runs by PR number, and push or manual runs by event plus branch reference. Including `github.event_name` prevents a manual run and a push run from canceling each other unintentionally.

Set only the job-level timeout in the initial workflow:

```yaml
timeout-minutes: 20
```

Do not add step-level timeouts initially.

## 12. Failure behavior and diagnostics

Do not use:

```yaml
continue-on-error: true
```

A failure in dependency installation, OS dependency preparation, Chromium preparation, test discovery, or test execution must fail the job. Primary diagnostics are the GitHub Actions step logs.

Lv3-C must confirm that logs can distinguish dependency-install, OS-dependency, browser-install, test-discovery, web-server-startup, assertion, timeout, and cancellation outcomes.

## 13. Artifact policy

Lv3-B must not add artifact upload. Current Playwright configuration does not explicitly generate HTML reports, traces, screenshots, or videos, so an initial artifact would be empty or of low value.

Lv3-C evaluates real failure output before deciding whether an artifact is useful. If a later scoped issue adds a failure-only artifact, its candidate behavior is:

```yaml
if: failure()
retention-days: 7
if-no-files-found: ignore
```

At that time, use the then-current official major version of `actions/upload-artifact`. This contract does not implement it.

## 14. Security boundaries

The initial CI is a read-only test workflow. It checks out code without persisted credentials, receives no secrets or PATs, and uses no write permissions. It does not use `pull_request_target`, publish packages, deploy GitHub Pages, alter repository settings, or make external write operations.

The workflow uses the existing app dependencies and test ownership. It does not move dependencies to the root, modify lockfiles, change Playwright versions, or alter application behavior.

## 15. Deferred items

The following are intentionally outside this contract's implementation scope:

- Workflow implementation and GitHub Actions execution (Lv3-B)
- Success, failure, cancellation, rerun, and displayed-check verification (Lv3-C)
- Artifact adoption after real failure-output evaluation (Lv3-C)
- Required-check finalization and branch protection or ruleset changes (Lv3-D)
- Phase 3 completion baseline (Lv3-E)
- Node.js or browser matrices, workspace jobs, test parallelization, automatic port allocation, path filters, coverage, visual regression, reporter changes, trace/screenshot/video changes, and Playwright cache
- SHA pinning, Dependabot, CodeQL, release/tag automation, and GitHub Pages workflow changes

## 16. Lv3-B implementation handoff

Implement exactly one workflow at `.github/workflows/ci.yml` with this fixed input:

| Area | Required implementation |
| --- | --- |
| Workflow / job | `Pocketly CI`; `test`; `Monorepo tests` |
| Triggers | Pull request to `main`, push to `main`, `workflow_dispatch` |
| Runner | GitHub-hosted x64 `ubuntu-24.04` |
| Permissions | `contents: read` |
| Actions | `actions/checkout@v6` with `persist-credentials: false`; `actions/setup-node@v6` |
| Runtime | `node-version-file: .nvmrc`; log Node.js and npm versions |
| Cache | setup-node npm cache using root `package-lock.json` |
| Commands | `npm ci`; workspace-scoped `playwright install-deps chromium`; `npm run test:browser:install`; `npm run test:list`; `npm test` |
| Concurrency | PR/event/ref group shown above; `cancel-in-progress: true` |
| Timeout | 20 minutes |
| Failure / artifacts | Fail on setup and test failures; no initial artifact upload |

Lv3-B must not introduce additional triggers, permissions, credentials, actions, package scripts, dependency changes, test/config changes, matrices, path filters, artifacts, or unrelated application changes.
