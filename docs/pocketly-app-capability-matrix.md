# Pocketly app capability matrix

## 1. Purpose and scope

This is a fact inventory for Issue #39 (Phase 4 / Lv3-A). It records the current repository state of the four official apps so that Lv3-B can define an App Contract and Lv3-C can evaluate it later. It does **not** propose that contract, rate any app as compliant, or prescribe a dependency, test, or delivery model.

Status words used below are: **present**, **absent by design**, **not applicable**, **unconfirmed**, and **inconsistent**. “Absent by design” is a recorded current capability boundary, not a defect. No item in this document uses an unqualified “absent” as an evaluation.

## 2. Source-of-truth documents

| Subject | Current evidence |
| --- | --- |
| Official workspace identity and root commands | [`package.json`](../package.json), [`package-lock.json`](../package-lock.json) |
| Runtime entry points and local asset references | each app's `index.html` and its referenced local files |
| Development HTTP behavior | [`scripts/serve-static.mjs`](../scripts/serve-static.mjs) |
| Test ownership and HTTP settings | app `package.json`, `playwright.config.js`, and `tests/` where present |
| CI implementation and retained CI contract | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`phase-3-ci-contract.md`](phase-3-ci-contract.md) |
| Pages delivery entry | [`index.html`](../index.html), [`.nojekyll`](../.nojekyll), [`.github/workflows/static.yml`](../.github/workflows/static.yml) |
| App operation, assets, and license notes | each app's `README.md`; [`apps/markdown-editor/LICENSE`](../apps/markdown-editor/LICENSE); [`apps/avro-viewer/vendor/avsc-LICENSE.txt`](../apps/avro-viewer/vendor/avsc-LICENSE.txt) |

The Phase 2 and Phase 3 documents are inherited execution and CI context; this matrix is the current-state cross-app inventory and does not rewrite their historical baselines.

## 3. Official app identity matrix

| Display name | Directory / naming | Package name | Root workspace | Root Pages link / expected Pages path | Subpath-safe local assets |
| --- | --- | --- | --- | --- | --- |
| Avro Viewer | `apps/avro-viewer/`; directory and package names match | `avro-viewer` | present | `apps/avro-viewer/` / `/pocketly/apps/avro-viewer/` | present; relative stylesheet, icon, vendor script, and module paths |
| CSV Gantt Viewer | `apps/csv-gantt-viewer/`; names match | `csv-gantt-viewer` | present | `apps/csv-gantt-viewer/` / `/pocketly/apps/csv-gantt-viewer/` | present; relative local stylesheet, icon, module, and `html2canvas` paths |
| Markdown Editor | `apps/markdown-editor/`; names match | `markdown-editor` | present | `apps/markdown-editor/` / `/pocketly/apps/markdown-editor/` | present for repository assets; runtime libraries are CDN URLs |
| reStructuredText Editor | `apps/restructuredtext-editor/`; names match | `restructuredtext-editor` | present | `apps/restructuredtext-editor/` / `/pocketly/apps/restructuredtext-editor/` | present for repository assets; runtime libraries are CDN URLs |

The root directory links are relative, rather than domain-root paths, so the documented `/pocketly/` GitHub Pages subpath is preserved. Evidence: [`package.json`](../package.json), [`index.html`](../index.html), and each app's `index.html`.

## 4. Package metadata matrix

| App | `name` / `private` / description | Version / package entry point | App scripts | Root Node/npm requirements duplicated? |
| --- | --- | --- | --- | --- |
| Avro Viewer | `avro-viewer` / `true` / present | absent by design / absent by design | `dev` | absent by design |
| CSV Gantt Viewer | `csv-gantt-viewer` / `true` / present | absent by design / absent by design | `dev`, `test`, `test:list`, `test:browser:install` | absent by design |
| Markdown Editor | `markdown-editor` / `true` / present | absent by design / absent by design; also declares `license: MIT`, `type: commonjs` | `dev`, `test`, `test:list`, `test:browser:install` | absent by design |
| reStructuredText Editor | `restructuredtext-editor` / `true` / present | absent by design / absent by design | `dev` | absent by design |

All `dev` scripts run the root-owned `node ../../scripts/serve-static.mjs`. The root owns Node `>=24 <25` and npm `>=11 <12` via `engines` and `devEngines`; no app package repeats those requirements. Evidence: root and app `package.json` files.

## 5. Runtime / asset model matrix

| App | Browser/static model | Runtime dependency source | Local application assets | Network / generated-output observation |
| --- | --- | --- | --- | --- |
| Avro Viewer | present; browser-only static app | vendored `vendor/avsc.js` (`avsc` v5.7.7) | icon, stylesheet, module, worker, three `.avro` samples | no runtime external network reference found in HTML; no build output found |
| CSV Gantt Viewer | present; browser-only static app | local `html2canvas.min.js`; no npm runtime dependency declared | icon, stylesheet, CSV samples/manifest, `config.json`, JavaScript modules | no runtime external network reference found in entry HTML; no build output found |
| Markdown Editor | present; browser-only static app | CDN `marked` and `mermaid` | icon, stylesheet, i18n JSON, templates, JavaScript | runtime network is required for the two CDN scripts; README states no build step |
| reStructuredText Editor | present; browser-only static app | CDN es-module-shims, esm.sh Shiki/vscode modules/KaTeX, jsDelivr KaTeX CSS and `rst-compiler` dynamic import | icon, stylesheet, `assets/sample.rst`, app module | runtime network is required for CDN resources; no build output found |

“No build output found” is an inventory observation from tracked files and package scripts, not a build-system requirement. Evidence: app entry HTML, [`apps/restructuredtext-editor/app.js`](../apps/restructuredtext-editor/app.js), and the app READMEs.

## 6. Dependency / lockfile ownership matrix

| App | Declared app dependencies | Test/development dependency ownership | Vendored / CDN ownership and attribution | Lockfile status |
| --- | --- | --- | --- | --- |
| Avro Viewer | none | not applicable | vendored `avsc.js`; MIT license at `vendor/avsc-LICENSE.txt` | present in root lockfile as workspace; no app lockfile/shrinkwrap |
| CSV Gantt Viewer | `@playwright/test` in `devDependencies` | app-owned Playwright | local `html2canvas.min.js` v1.4.1; upstream `https://html2canvas.hertzen.com`; MIT license; repository-specific update procedure and maintenance record unconfirmed | present in root lockfile as workspace; no app lockfile/shrinkwrap |
| Markdown Editor | `@playwright/test` in `devDependencies` | app-owned Playwright | `marked` and `mermaid` loaded from CDN; local MIT `LICENSE` for the app | present in root lockfile as workspace; no app lockfile/shrinkwrap |
| reStructuredText Editor | none | not applicable | runtime CDN resources listed in README/import map; repository-specific introduction, update, and attribution maintenance record unconfirmed | present in root lockfile as workspace; no app lockfile/shrinkwrap |

The root owns the canonical `package-lock.json` and shared development server dependency `serve-handler`. A repository scan found only that root lockfile and no `npm-shrinkwrap.json`; its workspace package entries include both Playwright-owning apps. No undeclared npm package use is identified from the app package/test configuration inventory; non-npm runtime resources are shown separately above. The `html2canvas.min.js` file banner is the evidence for its version, upstream, and license; those facts are not inferred from npm metadata. Evidence: root/app `package.json`, [`package-lock.json`](../package-lock.json), [`apps/csv-gantt-viewer/html2canvas.min.js`](../apps/csv-gantt-viewer/html2canvas.min.js), and tracked asset paths.

## 7. Development capability matrix

| Capability | Avro Viewer | CSV Gantt Viewer | Markdown Editor | reStructuredText Editor |
| --- | --- | --- | --- | --- |
| Root workspace resolution and `dev` script | present | present | present | present |
| Standard command | `npm run dev --workspace=avro-viewer` | `npm run dev --workspace=csv-gantt-viewer` | `npm run dev --workspace=markdown-editor` | `npm run dev --workspace=restructuredtext-editor` |
| HTTP endpoint / server | present: `127.0.0.1:8000` / root static server | same | same | same |
| Directory listing / cache policy | disabled / `no-store` | same | same | same |
| Build, watch, hot reload | absent by design | absent by design | absent by design | absent by design |
| `file://` as standard entrypoint | absent by design | absent by design | absent by design | absent by design |
| App-specific manual verification | README usage steps present | README configuration check present | README feature/use steps present | README startup/configuration description present |

The server validates that its working directory is a private, root-listed workspace with `package.json` and `index.html`; it serves one workspace at a time, has no directory listing, sets `Cache-Control: no-store`, and does not implement building, watching, hot reload, or browser opening. The repository-wide current execution contract defines HTTP through the shared server as the standard entrypoint and explicitly excludes `file://` from that role, so all four app statuses are **absent by design**. The CSV Gantt Viewer and reStructuredText Editor READMEs document the HTTP start command but, unlike the Avro Viewer and Markdown Editor READMEs, do not explicitly state a direct-open policy; this is a confirmed documentation difference, not an unconfirmed execution status. Evidence: [`scripts/serve-static.mjs`](../scripts/serve-static.mjs), [`phase-2-package-execution-contract.md`](phase-2-package-execution-contract.md), and app READMEs.

## 8. Test / quality capability matrix

| App | Automated tests / framework | Current test inventory | Config and HTTP contract | Root participation / test-less handling |
| --- | --- | --- | --- | --- |
| Avro Viewer | absent by design | not applicable | not applicable | root `--if-present` skips it; no fake script |
| CSV Gantt Viewer | present / Playwright | 10 tests expected by the inherited CI contract; eight `*.spec.js` files plus helper | app-owned `playwright.config.js`; starts `npm run dev`, base URL `http://127.0.0.1:8000/`, `reuseExistingServer: false`, headless Chromium, downloads accepted | present in `test:list`, browser install, and `npm test` |
| Markdown Editor | present / Playwright | 22 tests expected by the inherited CI contract; two `*.spec.js` files | app-owned CommonJS config; same server/base URL/reuse/headless contract | present in `test:list`, browser install, and `npm test` |
| reStructuredText Editor | absent by design | not applicable | not applicable | root `--if-present` skips it; no fake script |

The root executes workspace scripts in the explicit workspace order and only where the script exists. Chromium is the repository browser scope; individual test count validation is recorded in the verification results for this issue, not inferred from spec-file count. Evidence: root/app `package.json`, app Playwright configs, test directories, and [`phase-3-ci-contract.md`](phase-3-ci-contract.md).

## 9. CI participation matrix

| CI concern | Current fact |
| --- | --- |
| Workflow/job identity | `Pocketly CI` / `Monorepo tests` is present. |
| Root command path | CI runs `npm ci`, installs Linux Chromium dependencies through the CSV Gantt workspace, then root browser install, test listing, and `npm test`. |
| Test-owning apps | CSV Gantt Viewer and Markdown Editor can fail list/install/test steps through their app-owned Playwright scripts/configs. |
| Test-less apps | Avro Viewer and reStructuredText Editor are reached as workspaces but skipped by root `--if-present`; they do not add a fake pass. |
| Shared server / port impact | The tested apps each start their own port-8000 server sequentially via Playwright; changing root server behavior, port, or Playwright config affects CI. |
| Workflow/job identity change required by a current app difference | not applicable; the workflow already orchestrates both test-owning and test-less models. |
| Deferred CI operations | present as documented deferred/blocked work; not executed or completed by this inventory. |

Evidence: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), [`phase-3-ci-contract.md`](phase-3-ci-contract.md), and [`phase-3-ci-operations.md`](phase-3-ci-operations.md).

## 10. GitHub Pages / delivery matrix

| Delivery concern | Current fact |
| --- | --- |
| Root entry and app paths | Root `index.html` links all four app directories with relative `apps/<name>/` links. |
| Repository subpath | The public entry is documented as `https://yuyuyu0706.github.io/pocketly/`; relative links/local resources support that subpath. |
| Static delivery setup | `.nojekyll` is present. The Pages workflow uploads the entire repository and is triggered for `codex/**` pushes or manual dispatch. |
| App local assets | Each entry HTML uses relative local paths for its in-repository CSS/icon/code assets. |
| External delivery prerequisites | Markdown Editor and reStructuredText Editor require their CDN hosts at runtime; Avro Viewer has a vendored decoder and CSV Gantt Viewer has local runtime resources. |
| Pages workflow change required by current differences | not applicable from this inventory; every app is delivered under its existing app subdirectory. |

Evidence: [`index.html`](../index.html), [`.nojekyll`](../.nojekyll), [`.github/workflows/static.yml`](../.github/workflows/static.yml), and app entry HTML.

## 11. Documentation / maintenance matrix

| App | README / purpose / start guidance | Tests and runtime documented | Protected assets, license, maintenance boundary |
| --- | --- | --- | --- |
| Avro Viewer | present | vendored runtime and HTTP start documented; automated-test capability absent by design | `vendor/avsc.js` and its MIT license are explicitly recorded; samples documented |
| CSV Gantt Viewer | present; HTTP start documented, direct-open policy not explicitly stated | HTTP start and Playwright commands documented | local CSV/config assets documented; `html2canvas` v1.4.1, upstream URL, and MIT license confirmed by the file banner; repository-specific update/maintenance record unconfirmed |
| Markdown Editor | present | static/no-build model, CDN-feature context, and Playwright commands documented | local MIT `LICENSE`; templates/i18n/icons/test boundary described |
| reStructuredText Editor | present; HTTP start documented, direct-open policy not explicitly stated | HTTP start and CDN runtime list documented; automated-test capability absent by design | local sample/icon documented; repository-specific CDN introduction/update/attribution maintenance record unconfirmed |

All four application directories have their own README and thereby retain an app-owned maintenance boundary. The root README documents the four-app list, Pages entry, workspace commands, and repository-wide lockfile/server rules.

## 12. Shared capabilities

- All official apps are explicit root npm workspaces, are private packages, have matching directory/package names, descriptions, and a shared `dev` command backed by the root static server.
- All are browser-only static applications with an `index.html`, relative repository asset paths, root-link Pages delivery, and no observed build or generated distribution step.
- Root dependency installation and the one canonical lockfile are shared; no app-level lockfile or shrinkwrap is present.
- All are documented by an app README and run locally at one shared HTTP endpoint, `127.0.0.1:8000`, one workspace at a time.
- CI/root test orchestration preserves app ownership: script-bearing workspaces participate and test-less workspaces are skipped through `--if-present`.

## 13. App-specific capabilities

- **Avro Viewer:** local vendored `avsc`, license file, a profile worker, and sample Avro files permit its documented decoder use without a runtime CDN.
- **CSV Gantt Viewer:** app-owned Playwright tests, accepted downloads, CSV/config sample resources, and local minified `html2canvas` runtime.
- **Markdown Editor:** app-owned Playwright tests, a local MIT license, templates/i18n, and CDN-loaded Marked/Mermaid rendering.
- **reStructuredText Editor:** CDN import-map/dynamic compiler model and a local RST sample; it has no declared npm dependency or automated test script.

## 14. Differences requiring Lv3-B decisions

The following are decision inputs, not proposed requirements:

1. Should a `dev` script remain universally required, and which shared-server behavior is contractual versus implementation detail?
2. Should automated tests be mandatory for new apps, or an explicit capability-specific contract that retains test-less apps and their manual verification form?
3. Which README fields should be common minimum documentation, including runtime model, test status, update method, and maintenance boundary?
4. What inventory, attribution, license, and update-record requirements apply to vendored, local-minified, CDN, and dynamic-import dependencies?
5. Must Pages subpath behavior be tested/recorded, and how should runtime CDN availability be represented in delivery verification?
6. What is the minimum root-CI participation contract for a test-owning app versus a test-less app, and which server/port assumptions are stable?
7. What exception record, owner, and re-evaluation trigger are required for intentional capability differences?
8. Which differences are future Phase 5 commonization candidates versus deliberate app-local ownership?

## 15. Unconfirmed items

The runtime files and URLs establish current dependency facts. The items below are limited to repository-specific maintenance history and procedures that are not recorded in the examined files.

| Item | Status and reason |
| --- | --- |
| CSV Gantt Viewer's `html2canvas.min.js` repository-specific introduction history, update procedure, and maintenance record | unconfirmed; its file banner confirms version 1.4.1, upstream `https://html2canvas.hertzen.com`, and MIT license, but the examined repository documents do not record how or when this copy was introduced or maintained. |
| reStructuredText Editor CDN dependency repository-specific introduction history, update procedure, and attribution maintenance record | unconfirmed; its README and source identify current runtime sources, but the examined repository documents do not record the repository-specific introduction and maintenance process. |

The CSV Gantt Viewer and reStructuredText Editor READMEs' lack of an explicit direct-open policy is a **present documentation difference**, recorded in sections 7 and 11. It does not make the repository-wide `file://` execution status unconfirmed. Runtime CDN availability and production Pages execution were not tested by this documentation-only inventory and are not converted into future contract proposals here.

## 16. Lv3-B / Lv3-C handoff

**Lv3-B (contract definition)** should use sections 12–15 to separate shared minimums from capability-specific conditions without retroactively declaring the observed differences failures. It should explicitly decide the eight questions in section 14, including how exceptions and CDN/vendored assets are recorded.

**Lv3-C (conformance verification)** should validate any later contract against the cited files and current root commands. At minimum it should verify identity/workspace registration, script resolution, lockfile ownership, selected dependency/attribution records, HTTP/Pages subpath behavior, documented test status, and CI reachability. It must report test-less apps as intentional capability cases where the later contract says so, rather than adding fake passing scripts. It should also resolve or carry forward the two repository-specific unconfirmed items above with evidence.

## Verification record for this inventory

The issue requests `npm ci`, `npm run test:list`, and `npm test`; results are recorded in the accompanying PR after execution. The matrices above are based on tracked repository files and distinguish those file facts from runtime verification.
