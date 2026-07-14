# Issue #5 verification record

This document records the Issue #5 startup and existing-test verification scope for the migrated Pocketly app layout.

## GitHub Pages route map

GitHub Pages publishes the repository root, so each migrated app is reachable through its stable `apps/` path:

| App | Pages path | Result |
| --- | --- | --- |
| Markdown Editor | `/pocketly/apps/markdown-editor/` | Initial static route present. Uses relative local assets and CDN dependencies from `index.html`. |
| CSV Gantt Viewer | `/pocketly/apps/csv-gantt-viewer/` | Initial static route present. CSV sample paths remain relative to the app directory. |
| Avro Viewer | `/pocketly/apps/avro-viewer/` | Initial static route present. Vendored `vendor/avsc.js` and module worker paths remain relative to the app directory. |
| reStructuredText Editor | `/pocketly/apps/restructuredtext-editor/` | Initial static route present. Local assets and CDN dependencies are loaded from the app page. |

A root `index.html` provides a minimal app link list for GitHub Pages verification. A root `.nojekyll` file keeps Pages from applying Jekyll processing to the static app tree.

## Static asset path review

- No root-relative local asset paths were found in app HTML, CSS, or JavaScript files.
- App fetches and worker references use relative paths such as `./csv/`, `i18n/`, `vendor/`, and `./workers/`, which are compatible with repository subpath hosting.
- No Issue #5 migration-caused path defects required app code changes.

## Existing test results

| App | Command | Result |
| --- | --- | --- |
| Markdown Editor | `npm test` from `apps/markdown-editor` | Blocked locally because the Playwright Chromium executable is not installed in the environment. `npx playwright install chromium` was attempted, but the browser download returned HTTP 403. |
| CSV Gantt Viewer | `npm test` from `apps/csv-gantt-viewer` | Blocked locally because Playwright dependencies are not installed for this app. `npm install` was attempted, but the registry request for `@playwright/test` returned HTTP 403. |

## Unresolved items / follow-up split

No migration-caused blocking defect was identified in this Issue #5 pass. Broader UI improvements, richer portal behavior, and monorepo-wide tooling remain outside this issue scope.
