# Phase 2 App Execution Baseline

## 1. Purpose

This document records the completed state of Pocketly Phase 2: unified development and test entrypoints for the four official apps. It is a historical baseline, not the source of truth for rules that may evolve. The currently effective package and execution rules remain in `docs/phase-2-package-execution-contract.md`.

## 2. Starting baseline

Phase 2 started from the completed Phase 1 root development baseline.

- Phase 1 baseline: `docs/phase-1-root-development-baseline.md`
- Phase 0 baseline: `docs/monorepo-migration-baseline.md`
- Git tag: `monorepo-baseline`

## 3. Phase 2 completed work

Phase 2 consists of the following completed Lv3 work.

| Work | Issue / PR | Merge commit | Completed result |
| --- | --- | --- | --- |
| Lv3-A | #17 / PR #18 | `33acd50bb52cbc14eb21044f55051306abd76d6b` | Defined package metadata and app execution contracts for all four apps. |
| Lv3-B | #19 / PR #20 | `abc9dd57a4b102770daa129d0e6e11a9633bd08a` | Introduced explicitly listed npm workspaces and root dependency management. |
| Lv3-C | #21 / PR #22 | `8a80c63ed19208a8d8476adfcd9ea91c7efbf253` | Unified workspace-targeted static HTTP development startup. |
| Lv3-D | #23 / PR #24 | `da1c9245ab17e11abfc27cb121ff21f16e2fcca8` | Unified test entrypoints and root orchestration for existing Playwright tests. |

## 4. Final workspace structure

The official workspaces at Phase 2 completion are explicitly listed in root `package.json`:

```text
apps/avro-viewer/              → avro-viewer
apps/csv-gantt-viewer/         → csv-gantt-viewer
apps/markdown-editor/          → markdown-editor
apps/restructuredtext-editor/  → restructuredtext-editor
```

No `apps/*` workspace glob is used. Apps remain independent boundaries under `apps/<app-name>/`.

## 5. Final package and dependency contract

- Every official app has a unique directory-matching package name, `private: true`, and a non-empty description.
- Root `package.json` owns the Node.js 24 LTS and npm 11 `engines` and `devEngines` requirements.
- The root is the installation entrypoint and root `package-lock.json` is the only workspace lockfile.
- App-level `package-lock.json` and `npm-shrinkwrap.json` are not used.
- Dependencies are owned and declared by the app that uses them; `serve-handler` is root-owned shared development infrastructure.
- `@playwright/test` remains an app-owned development dependency of CSV Gantt Viewer and Markdown Editor.

## 6. Final development contract

All four workspaces expose the same `dev` script, `node ../../scripts/serve-static.mjs`. From the repository root, start exactly one target workspace with:

```bash
npm run dev --workspace=<package-name>
```

The target app is served over HTTP at `http://127.0.0.1:8000/`. The root does not define a common `npm run dev`; `file://`, Python HTTP servers, simultaneous workspace startup, build, bundle, watch, hot reload, and browser opening are not part of this contract.

## 7. Final test contract

CSV Gantt Viewer and Markdown Editor own their Playwright tests and the `test`, `test:list`, and `test:browser:install` scripts. Avro Viewer and reStructuredText Editor have no automated tests and intentionally have no fake passing scripts.

The root orchestrates existing test scripts in workspace order with `--workspaces --if-present`:

```bash
npm ci
npm run test:browser:install
npm run test:list
npm test
```

Chromium is the repository-standard browser. Playwright starts and stops each tested app's app-owned server configuration at `127.0.0.1:8000`; tests run sequentially and `reuseExistingServer: false` is retained.

## 8. Application capability matrix

| App | Runtime model | `dev` | Automated test capability | Playwright |
| --- | --- | --- | --- | --- |
| Avro Viewer | Browser-only static app using vendored `avsc` | Yes | None | No |
| CSV Gantt Viewer | Browser-only static app with local assets | Yes | `test`, `test:list`, `test:browser:install` | Yes |
| Markdown Editor | Browser-only static app with CDN-loaded rendering libraries | Yes | `test`, `test:list`, `test:browser:install` | Yes |
| reStructuredText Editor | Browser-only static app with CDN-loaded runtime dependencies | Yes | None | No |

## 9. Fixed decisions

- Standard package manager: npm; standard runtime: Node.js 24 LTS with npm 11.
- One explicit root workspace list and one root lockfile are maintained.
- App runtime capabilities are not artificially equalized merely to unify development operations.
- Playwright configuration stays app-owned, and Chromium is the only standard browser.
- GitHub Pages remains hosted under `/pocketly/`; root app navigation, `.nojekyll`, the Avro vendor assets and license, and CDN runtime models are preserved.

## 10. Completion verification

Phase 2 completion is verified with the following repository-owned commands in the supported Node.js 24 / npm 11 environment:

```bash
npm ci
npm run test:browser:install
npm run test:list
npm test
git diff --check
find apps \( -name package-lock.json -o -name npm-shrinkwrap.json \) -print
```

At completion, the test listing contains 10 CSV Gantt Viewer tests and 22 Markdown Editor tests, and root `npm test` runs those 32 existing tests while skipping testless workspaces.

## 11. Intentionally deferred

- GitHub Actions workflows and CI workflow design
- Playwright configuration commonization, browser matrices, parallelization, automatic port allocation, coverage, and visual regression testing
- New automated tests for Avro Viewer or reStructuredText Editor
- Build, bundle, transpilation, TypeScript migration, or CDN dependency conversion
- New `packages/`, `shared/`, or `common/` directories
- Application behavior changes and a Phase 2 completion Git tag

## 12. Phase 3 handoff

Phase 3 may use this repository-owned command contract:

```text
Checkout
  ↓
Node.js 24 / npm 11
  ↓
npm ci
  ↓
Prepare Chromium and any required OS dependencies
  ↓
npm run test:list
  ↓
npm test
```

The formal repository commands are `npm ci`, `npm run test:browser:install`, `npm run test:list`, and `npm test`. If Linux CI needs OS dependencies, Phase 3 workflow design may consider:

```bash
npm exec --workspace=markdown-editor -- playwright install --with-deps chromium
```

This baseline does not define or implement a workflow YAML; Phase 3 decides that design.

## 13. Phase 2 completion state

Phase 2 is complete. It leaves a unified operational contract for workspace installation, development startup, and existing test execution while preserving each app's independent implementation and test capability. Future changes update the current execution contract when needed; this document remains the historical record of Phase 2 completion.
