# Phase 2 package metadata and execution contract

This document records the Phase 2 package metadata, workspace, dependency ownership, and execution contract for the four official Pocketly apps. It fixes the current app-level package identities and the root install entrypoint without changing app runtime behavior, Playwright configuration, or test coverage.

## Scope

The official workspace packages are exactly these four directories under `apps/`:

| App | Directory | Package name |
| --- | --- | --- |
| Avro Viewer | `apps/avro-viewer/` | `avro-viewer` |
| CSV Gantt Viewer | `apps/csv-gantt-viewer/` | `csv-gantt-viewer` |
| Markdown Editor | `apps/markdown-editor/` | `markdown-editor` |
| reStructuredText Editor | `apps/restructuredtext-editor/` | `restructuredtext-editor` |

The root `package.json` lists these workspaces explicitly. The project does not use an `apps/*` glob, so adding a new app package requires a reviewed root `package.json` change.

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

## Workspace contract

- npm workspaces are introduced at the repository root.
- The official workspaces are the four app paths listed in the Scope section.
- Workspace paths are explicitly listed in root `package.json` in app directory alphabetical order.
- Each workspace can be targeted by its package name, such as `markdown-editor` or `csv-gantt-viewer`.
- A new workspace must not be added implicitly by placing a `package.json` under `apps/`; it requires an intentional root workspace list update.

## Dependency ownership contract

- Dependencies are declared by the app that uses them.
- The root package is the install entrypoint for the whole workspace tree, not the logical owner of app dependencies.
- npm may hoist or link packages as a physical installation optimization.
- App code, tests, and scripts must not rely on undeclared dependencies merely because they are physically present through hoisting.
- `@playwright/test` remains declared in the Markdown Editor and CSV Gantt Viewer app packages. It is not moved to root `devDependencies`.

## Lockfile contract

- Root `package-lock.json` is the only lockfile for the Pocketly workspace dependency tree.
- App-level `package-lock.json` files are not created.
- `npm-shrinkwrap.json` is not used.
- Dependency changes are made from the repository root with `npm install`.
- Reproducible dependency installation is verified from the repository root with `npm ci`.

## Current capability matrix

This matrix records current capabilities only. It does not define future target behavior as already implemented.

| App | Package name | Runtime model | npm dependencies | Current `test` script | Playwright |
| --- | --- | --- | --- | --- | --- |
| Avro Viewer | `avro-viewer` | Browser-only static app using vendored `avsc` runtime | No | No | No |
| CSV Gantt Viewer | `csv-gantt-viewer` | Browser-only static app with local assets and test-time HTTP serving | Yes: `@playwright/test` as an app dev dependency | Yes: `playwright test` | Yes |
| Markdown Editor | `markdown-editor` | Browser-only static app with CDN-loaded rendering libraries | Yes: `@playwright/test` as an app dev dependency | Yes: `playwright test` | Yes |
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

- `apps/csv-gantt-viewer/`
- `apps/markdown-editor/`

Apps without current automated tests must not declare fake passing test scripts. The absence of `test` in these apps records that automated tests are not yet implemented:

- `apps/avro-viewer/`
- `apps/restructuredtext-editor/`

## Explicit non-goals for this contract

This contract does not introduce any of the following:

- root common scripts
- root dependencies or dev dependencies
- `dev` scripts
- root test orchestration
- fake `test` scripts for apps without tests
- Avro Viewer npm `avsc` dependency
- reStructuredText Editor npm dependencies for CDN-loaded runtime libraries
- Playwright version changes
- Playwright config commonization
- app HTML, CSS, or JavaScript behavior changes

## Lv3-C handoff

The workspace preparation input for the next Phase 2 step is:

- Workspace targets are exactly the four app directories under `apps/`.
- Package names are unique and match directory names.
- All four app packages are `private: true`.
- Root `npm ci` is the standard dependency preparation entrypoint.
- Two apps currently have npm dev dependencies and Playwright tests: Markdown Editor and CSV Gantt Viewer.
- Two apps currently have no npm dependencies and no test scripts: Avro Viewer and reStructuredText Editor.
- `dev` remains a future implementation target.
- HTTP server dependencies and per-app `dev` scripts remain for Lv3-C to decide.
- `test` remains a capability contract only for apps that actually own automated tests.
