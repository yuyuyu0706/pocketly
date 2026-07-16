# Phase 2 package metadata and execution contract

This document records the Phase 2 package metadata and execution contract for the four official Pocketly apps. It fixes the current app-level inputs needed before npm workspaces are introduced, without changing app runtime behavior, dependency models, or test coverage.

## Scope

The official app packages are the four directories under `apps/`:

| App | Directory | Package name |
| --- | --- | --- |
| Markdown Editor | `apps/markdown-editor/` | `markdown-editor` |
| CSV Gantt Viewer | `apps/csv-gantt-viewer/` | `csv-gantt-viewer` |
| Avro Viewer | `apps/avro-viewer/` | `avro-viewer` |
| reStructuredText Editor | `apps/restructuredtext-editor/` | `restructuredtext-editor` |

Phase 2 does not make these apps npm workspaces yet. It only ensures that each app can be identified as a future workspace candidate with accurate metadata.

## Package metadata contract

Each official app package must provide the following minimum metadata:

```json
{
  "name": "<directory-name>",
  "private": true,
  "description": "<application description>"
}
```

- `name` must match the app directory name exactly and must be unique across the four apps.
- `private` must be `true` because Pocketly apps are internal app packages and are not intended for npm publishing.
- `description` must describe the app purpose in a non-empty sentence.
- App packages do not duplicate root-managed Node.js or npm requirements. The root package owns `engines` and `devEngines` for Node.js 24 LTS and npm 11.
- App packages do not need `version` unless a future issue defines independent app release/version management.
- Browser-only apps should not declare package entry points such as `main` unless a future issue introduces an actual package-consumer use case.

## Current capability matrix

This matrix records current capabilities only. It does not define future target behavior as already implemented.

| App | Package name | Runtime model | npm dependencies | Current `test` script | Playwright |
| --- | --- | --- | --- | --- | --- |
| Markdown Editor | `markdown-editor` | Browser-only static app with CDN-loaded rendering libraries | Yes: `@playwright/test` as a dev dependency | Yes: `playwright test` | Yes |
| CSV Gantt Viewer | `csv-gantt-viewer` | Browser-only static app with local assets and test-time HTTP serving | Yes: `@playwright/test` as a dev dependency | Yes: `playwright test` | Yes |
| Avro Viewer | `avro-viewer` | Browser-only static app using vendored `avsc` runtime | No | No | No |
| reStructuredText Editor | `restructuredtext-editor` | Browser-only static app using CDN-loaded runtime dependencies | No | No | No |

## Target execution contract

### `dev`

The Phase 2 target meaning of `dev` is:

> Start a local development HTTP server and make the target app available in a browser.

The `dev` script is a target contract for later Phase 2 work. It is not implemented in this issue, so none of the four app packages currently declare `dev`.

### `test`

The current meaning of `test` is:

> Run the automated tests that the app currently owns.

Only apps that currently have automated tests declare `test`:

- `apps/markdown-editor/`
- `apps/csv-gantt-viewer/`

Apps without current automated tests must not declare fake passing test scripts. The absence of `test` in these apps records that automated tests are not yet implemented:

- `apps/avro-viewer/`
- `apps/restructuredtext-editor/`

## Explicit non-goals for this contract

This contract does not introduce any of the following:

- root `workspaces`
- root common scripts
- root dependencies or dev dependencies
- root `package-lock.json`
- app lockfile generation, merging, or removal
- `dev` scripts
- fake `test` scripts for apps without tests
- Avro Viewer npm `avsc` dependency
- reStructuredText Editor npm dependencies for CDN-loaded runtime libraries
- Playwright version changes
- Playwright config commonization
- app HTML, CSS, or JavaScript behavior changes

## Lv3-B handoff

The workspace preparation input for the next Phase 2 step is:

- Workspace candidates are exactly the four app directories under `apps/`.
- Package names are unique and match directory names.
- All four app packages are `private: true`.
- Two apps currently have npm dev dependencies and Playwright tests: Markdown Editor and CSV Gantt Viewer.
- Two apps currently have no npm dependencies and no test scripts: Avro Viewer and reStructuredText Editor.
- `dev` remains a future implementation target.
- `test` remains a capability contract only for apps that actually own automated tests.
