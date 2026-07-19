# Phase 2 package metadata and execution contract

This document records the Phase 2 package metadata, workspace, dependency ownership, and execution contract for the four official Pocketly apps. It fixes the current app-level package identities, root install and test entrypoints, shared `dev` HTTP contract, and existing Playwright execution without changing app runtime behavior or test coverage.

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
- The root package is the install entrypoint for the whole workspace tree.
- Root `devDependencies` own shared development infrastructure used by all workspaces, including `serve-handler` for the common static server.
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

This matrix records current capabilities.

| App | Package name | Runtime model | npm dependencies | Current `dev` script | Current `test` script | Playwright |
| --- | --- | --- | --- | --- | --- | --- |
| Avro Viewer | `avro-viewer` | Browser-only static app using vendored `avsc` runtime | No app dependencies | Yes: shared static HTTP server | No | No |
| CSV Gantt Viewer | `csv-gantt-viewer` | Browser-only static app with local assets and test-time HTTP serving | Yes: `@playwright/test` as an app dev dependency | Yes: shared static HTTP server | Yes: `playwright test` | Yes |
| Markdown Editor | `markdown-editor` | Browser-only static app with CDN-loaded rendering libraries | Yes: `@playwright/test` as an app dev dependency | Yes: shared static HTTP server | Yes: `playwright test` | Yes |
| reStructuredText Editor | `restructuredtext-editor` | Browser-only static app using CDN-loaded runtime dependencies | No app dependencies | Yes: shared static HTTP server | No | No |

## Execution contract

### `dev`

The implemented meaning of `dev` is:

> Serve the target workspace's static files over HTTP at `127.0.0.1:8000`.

- All four workspaces declare the identical `dev` script: `node ../../scripts/serve-static.mjs`.
- Run one workspace at a time from the root with `npm run dev --workspace=<package-name>`.
- Root `npm ci` is the standard dependency preparation entrypoint.
- `file://` and Python HTTP server usage are not standard development entrypoints.
- The root-owned server disables browser cache and directory listing; it does not build, bundle, watch, hot reload, or open a browser.

### `test`

Only CSV Gantt Viewer and Markdown Editor own automated Playwright tests. They each declare these scripts:

```json
{
  "test": "playwright test",
  "test:list": "playwright test --list",
  "test:browser:install": "playwright install chromium"
}
```

Avro Viewer and reStructuredText Editor do not declare fake passing test scripts. The root owns the orchestration scripts:

```json
{
  "test": "npm run test --workspaces --if-present",
  "test:list": "npm run test:list --workspaces --if-present",
  "test:browser:install": "npm run test:browser:install --workspaces --if-present"
}
```

`--if-present` skips testless workspaces while preserving the explicit workspace order. Therefore root `npm test` runs CSV Gantt Viewer followed by Markdown Editor and returns non-zero if either fails.

Standard test commands are:

```bash
npm ci
npm run test:browser:install
npm run test:list
npm test
```

Individual tests remain available with `npm test --workspace=csv-gantt-viewer` and `npm test --workspace=markdown-editor`. Chromium is the only browser prepared by the repository script. Linux environments needing OS dependencies may run `playwright install --with-deps chromium` outside the repository script.

### Playwright HTTP contract

Each tested app retains its own Playwright config; no common config file is introduced. Both configs start the target workspace's `npm run dev` with this contract:

```js
webServer: {
  command: 'npm run dev',
  url: 'http://127.0.0.1:8000/',
  reuseExistingServer: false,
  stdout: 'pipe',
  stderr: 'pipe',
},
use: {
  baseURL: 'http://127.0.0.1:8000/',
  headless: true,
}
```

Playwright automatically starts and stops the server. A manually running server on port 8000 must be stopped before tests; with `reuseExistingServer: false`, a port conflict fails intentionally instead of reusing another app. Tests access the app with `page.goto('/')` over HTTP.

## Explicit non-goals for this contract

This contract does not introduce any of the following:

- fake `test` scripts for apps without tests
- Playwright config commonization
- Firefox, WebKit, browser matrix, test parallelization, or automatic port allocation
- coverage or visual regression testing
- build system, bundling, transpilation, or generated `dist/` output
- app runtime dependency model changes or app HTML, CSS, or JavaScript behavior changes
- Avro Viewer npm `avsc` dependency or reStructuredText Editor CDN dependency changes
- Playwright version changes or root ownership of Playwright
- GitHub Actions (planned for Phase 3)

## Phase 3 handoff

- `npm ci`, `npm run test:browser:install`, and `npm test` are sufficient to execute all existing automated tests.
- Chromium installation is app-owned but orchestrated from root.
- CSV Gantt Viewer and Markdown Editor tests use their app-owned HTTP server configs and port 8000 sequentially.
- Avro Viewer and reStructuredText Editor are intentionally skipped by root test orchestration until they acquire real tests.
- Phase 3 can use this command contract for GitHub Actions without changing test ownership or adding fake passes.
