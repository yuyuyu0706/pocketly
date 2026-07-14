# Monorepo migration baseline

This document records the initial Pocketly monorepo migration baseline for Issue #7. It is intended to be the comparison point for later development-platform work after the migrated apps, app names, static paths, and verification entry points were stabilized.

## Baseline scope

- Repository: `yuyuyu0706/pocketly`
- Baseline purpose: record and freeze the normal post-migration state before broader monorepo tooling work starts.
- Scope boundary: confirmation, documentation, unresolved-item triage, and baseline tag planning only. New app features, UI/UX changes, shared packages, npm workspaces, root package scripts, and GitHub Actions monorepo migration remain out of scope.
- Baseline tag name to apply after this PR is merged to `main`: `monorepo-baseline`.

## Official app layout

Pocketly contains four migrated apps under `apps/`, using stable kebab-case directory names.

```text
apps/
├── avro-viewer/
├── csv-gantt-viewer/
├── markdown-editor/
└── restructuredtext-editor/
```

| App | Directory | GitHub Pages path | Primary local assets / dependencies |
| --- | --- | --- | --- |
| Markdown Editor | `apps/markdown-editor/` | `/pocketly/apps/markdown-editor/` | Local CSS, JavaScript, images, templates, i18n files; marked and Mermaid via CDN. |
| CSV Gantt Viewer | `apps/csv-gantt-viewer/` | `/pocketly/apps/csv-gantt-viewer/` | Local CSS, JavaScript modules, images, CSV samples, `html2canvas.min.js`. |
| Avro Viewer | `apps/avro-viewer/` | `/pocketly/apps/avro-viewer/` | Local CSS, JavaScript, images, workers, sample Avro files, vendored `vendor/avsc.js`. |
| reStructuredText Editor | `apps/restructuredtext-editor/` | `/pocketly/apps/restructuredtext-editor/` | Local CSS, JavaScript, images, sample `.rst` asset, CDN dependencies. |

The repository root `index.html` is the GitHub Pages verification entry point and links to each app by its stable `apps/` path. The root `.nojekyll` file keeps GitHub Pages from applying Jekyll processing to the static app tree.

## Prior migration work included in this baseline

### Lv3-A / PR #4: app layout and directory names

- Completed the migrated asset inventory for the four apps.
- Standardized app directory names to kebab-case.
- Confirmed the official four-app `apps/` structure.
- Documented external and vendored dependency assets in the app inventory.

### Lv3-B / PR #6: Pages verification entry point

- Added the root GitHub Pages verification `index.html`.
- Added the root `.nojekyll` marker.
- Added `docs/issue-5-verification.md` for startup, static-path, and existing-test verification notes.
- Confirmed that migrated app paths are compatible with repository subpath hosting because local app references are relative to each app directory.
- Recorded the existing test execution limits observed during Issue #5.

## GitHub Pages smoke verification

The intended production smoke target is:

```text
https://yuyuyu0706.github.io/pocketly/
```

Expected app URLs are:

- `https://yuyuyu0706.github.io/pocketly/apps/markdown-editor/`
- `https://yuyuyu0706.github.io/pocketly/apps/csv-gantt-viewer/`
- `https://yuyuyu0706.github.io/pocketly/apps/avro-viewer/`
- `https://yuyuyu0706.github.io/pocketly/apps/restructuredtext-editor/`

### Verification result recorded for this PR

| Check | Result |
| --- | --- |
| Root Pages entry point exists in the repository | Pass. `index.html` links to the four app routes. |
| App-local static path review | Pass. No root-relative local asset references were found in migrated app HTML/CSS/JavaScript during the Issue #5 path review. |
| Local static route availability | Pass. A local HTTP server can serve the root entry point and the four app entry points from the repository tree. |
| Production GitHub Pages browser smoke check | Pass. The root Pages entry point and all four app entry points were reachable through `https://yuyuyu0706.github.io/pocketly/` and rendered their expected initial page titles/content. |
| Terminal `curl` fetch from this container | Still blocked by the container proxy with `CONNECT tunnel failed: 403 Forbidden`; the production result above was therefore recorded using the browser/web fetch path rather than direct terminal `curl`. |

Production GitHub Pages smoke verification confirmed that the root entry point and the four app entry points are published and reachable. No production-only 404, CORS, MIME, import map, or JavaScript initialization defect was identified in this pass.

## Existing test results and environment constraints

The existing app test status carried into this baseline is unchanged from Issue #5:

| App | Command | Result |
| --- | --- | --- |
| Markdown Editor | `npm test` from `apps/markdown-editor` | Blocked in the previous verification environment because Playwright Chromium was not installed; `npx playwright install chromium` failed with HTTP 403. |
| CSV Gantt Viewer | `npm test` from `apps/csv-gantt-viewer` | Blocked in the previous verification environment because Playwright dependencies could not be fetched; `npm install` failed while fetching `@playwright/test` with HTTP 403. |
| Avro Viewer | Not applicable | No migrated app test suite is included. |
| reStructuredText Editor | Not applicable | No migrated app test suite is included. |

The test failures/blocks recorded so far are treated as external-access environment constraints, not confirmed monorepo migration regressions.

## Unresolved items and follow-up candidates

### Before applying the baseline tag

- Merge this PR to `main`.
- Apply the `monorepo-baseline` Git tag to the merged `main` commit.

### Later development-platform issues

- Add CI that can install Playwright browsers/dependencies and run the existing app tests reliably.
- Decide whether to add root-level package metadata, npm workspaces, or shared scripts in a later scoped issue.
- Consider GitHub Actions updates for monorepo-aware validation.

### App-specific or operational follow-ups

- Track any production-only smoke failures as separate app-specific issues if they are not small migration-path fixes.
- Decide separately whether old source repositories should be archived or otherwise marked as migrated.
