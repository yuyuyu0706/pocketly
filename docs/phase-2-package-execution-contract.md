# Phase 2 package metadata and execution contract

This document records the Phase 2 package metadata, workspace, dependency ownership, and execution contract for the four official Pocketly apps. It fixes the current app-level package identities, root install entrypoint, and shared `dev` HTTP contract without changing app runtime behavior, Playwright configuration, or test coverage.

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

The `dev` contract is fixed as follows:

- All four workspaces declare `scripts.dev`.
- `scripts.dev` is identical in all four workspaces: `node ../../scripts/serve-static.mjs`.
- The command is run from the repository root with `npm run dev --workspace=<package-name>`.
- Root `npm ci` is the standard dependency preparation entrypoint.
- `file://` is not the standard development entrypoint.
- Python HTTP server usage is not a standard development dependency or entrypoint.
- The common static server is a root-owned development tool in `scripts/serve-static.mjs`.
- The standard operation starts one workspace at a time.
- The host is `127.0.0.1`.
- The port is `8000`.
- Browser cache is disabled with `Cache-Control: no-store`.
- Directory listing is disabled.
- Build, bundle, transpile, file watch, hot reload, and browser auto-open are not provided.

Standard commands:

```bash
npm ci
npm run dev --workspace=<package-name>
```

Short form:

```bash
npm run dev -w <package-name>
```

Standard URL:

```text
http://127.0.0.1:8000/
```

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
- root test orchestration
- fake `test` scripts for apps without tests
- Playwright browser install policy
- Playwright config commonization
- build system, bundling, transpilation, or generated `dist/` output
- app runtime dependency model changes
- app HTML, CSS, or JavaScript behavior changes
- Avro Viewer npm `avsc` dependency
- reStructuredText Editor npm dependencies for CDN-loaded runtime libraries
- Playwright version changes

## Lv3-D handoff

The workspace preparation input for the next Phase 2 step is:

- Workspace targets are exactly the four app directories under `apps/`.
- Package names are unique and match directory names.
- All four app packages are `private: true`.
- Root `npm ci` is the standard dependency preparation entrypoint.
- Workspace selection is available by package name with `--workspace=<package-name>`.
- The `dev` contract is implemented for all four workspaces.
- The shared HTTP server is `127.0.0.1:8000`.
- Two apps currently have npm dev dependencies and Playwright tests: Markdown Editor and CSV Gantt Viewer.
- Two apps currently have no automated test scripts: Avro Viewer and reStructuredText Editor.
- Root test orchestration is not implemented.
- `test` remains a capability contract only for apps that actually own automated tests.
