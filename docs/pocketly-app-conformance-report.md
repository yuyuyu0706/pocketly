# Pocketly App Contract conformance report

## 1. Purpose and verification boundary

This document is the verification-result source of truth for Issue #43 (Phase 4 / Lv3-C). It evaluates the four workspaces that were official at the verification base commit `58c61df0ecf5307ddec72c7db0272006690aabdc` against the current [`Pocketly App Contract`](pocketly-app-contract.md). The repository facts used as inputs remain in repository files and the [`capability matrix`](pocketly-app-capability-matrix.md); this report neither changes the contract nor treats the matrix itself as proof of conformance.

The evaluated applications are:

- `apps/avro-viewer/` (AV)
- `apps/csv-gantt-viewer/` (CSV)
- `apps/markdown-editor/` (MD)
- `apps/restructuredtext-editor/` (RST)

The evaluation was performed on 2026-07-25 UTC. It is a point-in-time result, not a statement that later application changes remain conformant. Issue #43 is a monorepo-quality documentation change; no application, contract, root command, workflow, lockfile, Pages implementation, or protected asset is remediated here.

## 2. Decision model and evidence format

### 2.1 Status vocabulary

| Status | Meaning in this report |
| --- | --- |
| `compliant` | Repository evidence and, where applicable, execution evidence satisfy the requirement. |
| `non-compliant` | An applicable Required or Conditionally required item is demonstrably missing or contradicted. A remediation is not silently included in this report. |
| `not applicable` | An optional capability or the condition that activates a requirement is absent. This is not a defect. |
| `exception` | A requirement is not met, but a complete exception record under contract section 13 authorizes and bounds the difference. |
| `unconfirmed` | Available evidence cannot establish the fact. This is not interpreted as either compliance or absence. |

No complete contract-section-13 exception record was found, so this evaluation does not assign `exception`. Unknown provenance or maintenance facts are explicitly retained as `unconfirmed` inside the related non-compliance records rather than guessed.

### 2.2 Requirement IDs

The App Contract predates requirement IDs. The following stable IDs map its requirements into reviewable acceptance groups; a group covers its Required, applicable Conditionally required, and Prohibited clauses together.

| ID | Contract section | Acceptance rule |
| --- | --- | --- |
| `ID-01` | 4 | Kebab-case directory, matching unique package name, app-owned `index.html`, explicit workspace, and root relative Pages link agree. No glob or unregistered workspace is used. |
| `ID-02` | 4–5 | Package is private, has a non-empty purpose description, and does not duplicate root engine policy. |
| `PKG-01` | 5 | Scripts describe real capabilities; npm dependencies are app-owned; the root lockfile is the sole lockfile; no undeclared or fake capability is evident. |
| `AST-01` | 6 | Every adopted CDN, vendored, local-minified, or dynamic-import third-party runtime has the seven required purpose/provenance/version/license/owner/update/network-delivery records. Unknown facts remain explicit. |
| `AST-02` | 6 | Adopted local images, samples, templates, or fonts document purpose, placement, rights/attribution considerations, and the app-directory owner boundary. |
| `DEV-01` | 7 | A real `dev` script uses the root server and serves the app at `127.0.0.1:8000`; workspace validation and graceful termination work; no alternative is documented as standard. |
| `TST-01` | 8 | A test-owning app owns real scripts/tests/dependencies, or a test-less app has no fake script and its README explicitly records test absence and reproducible manual verification. |
| `TST-02` | 8 | For Playwright apps, app-owned configuration uses Chromium preparation, `npm run dev`, the standard HTTP URL, and `reuseExistingServer: false`. |
| `CI-01` | 9 | Root install resolves all workspaces; root list/test orchestration reaches test owners and skips test-less apps without fake success. Workflow/job identity and root commands remain intact. |
| `PAG-01` | 10 | The root Pages entry reaches each app under `/pocketly/apps/<name>/`; repository assets are subpath-safe relative references; Pages infrastructure is not mixed into the change. |
| `PAG-02` | 10 | A CDN-consuming app README records external hosts, runtime network prerequisite, and offline limitation. |
| `DOC-01` | 11 | The app README covers all nine minimum documentation items, including explicit capability absence and `unconfirmed` maintenance facts. |
| `CHG-01` | 12 | The change is Issue-first, classified, scope-bounded, and does not mix application remediation with contract/platform work. |
| `EXC-01` | 13 | Every invoked exception has all mandatory fields and a review trigger; no implicit waiver is used. |
| `COM-01` | 14 | A new shared boundary is created only with all four commonization justifications; absence of commonization is valid. |

Evidence references use repository-relative paths. Command evidence uses the exact command, date, result vocabulary (`passed`, `attempted but blocked`, `failed`, `not run`), and relevant observed result. A status is based on the evidence named in the same row and must be reevaluated when that evidence changes.

## 3. Static repository evidence

### 3.1 Cross-application result matrix

| Requirement | AV | CSV | MD | RST | Principal evidence |
| --- | --- | --- | --- | --- | --- |
| `ID-01` | compliant | compliant | compliant | compliant | root `package.json`; root `index.html`; each app `package.json` and `index.html` |
| `ID-02` | compliant | compliant | compliant | compliant | root and app `package.json` files |
| `PKG-01` | compliant | compliant | compliant | compliant | root `package.json`, `package-lock.json`; app packages; repository search found no app lockfile/shrinkwrap |
| `AST-01` | non-compliant | non-compliant | non-compliant | non-compliant | app `index.html` and README; detailed records `NC-01`–`NC-04` |
| `AST-02` | non-compliant | non-compliant | non-compliant | non-compliant | local `images/`, `sample/`, `csv/`, `template/`, and `assets/`; app READMEs omit rights/owner details |
| `DEV-01` | compliant | compliant | compliant | compliant | app packages; `scripts/serve-static.mjs`; execution record `RUN-05` |
| `TST-01` | non-compliant | compliant | compliant | non-compliant | app packages, tests, and READMEs; test-less READMEs do not state test absence plus a reproducible manual procedure |
| `TST-02` | not applicable | compliant | compliant | not applicable | app packages and app-owned `playwright.config.js` files |
| `CI-01` | compliant | compliant | compliant | compliant | root package/workflow; `RUN-01`–`RUN-04`. The test run failed inside MD, but failure propagated correctly. |
| `PAG-01` | compliant | compliant | compliant | compliant | root/app HTML, `.nojekyll`, `.github/workflows/static.yml`, and `RUN-06` |
| `PAG-02` | not applicable | not applicable | non-compliant | non-compliant | MD and RST HTML load CDNs; neither README records host plus complete network/offline prerequisites |
| `DOC-01` | non-compliant | non-compliant | non-compliant | non-compliant | all four app READMEs; detailed gaps below |
| `CHG-01` | compliant | compliant | compliant | compliant | Issue #43 scope and this documentation-only diff |
| `EXC-01` | not applicable | not applicable | not applicable | not applicable | no exception is invoked; capability differences use Optional/not-applicable treatment |
| `COM-01` | not applicable | not applicable | not applicable | not applicable | no `packages/`, `shared/`, or `common/` boundary is introduced |

The `CI-01` result means the participation and failure-propagation contract works; it does **not** convert the failed MD suite into a passing quality result. Likewise, test-less apps are intentionally skipped by root orchestration, but their separate README obligation under `TST-01` is non-compliant.

### 3.2 Identity, package, and dependency findings

All four directories use lowercase kebab-case names equal to their package names. Each package is private, has a non-empty description and an app-owned `index.html`, and appears explicitly in the root workspace list and root Pages cards. The root list is not a glob. Root `engines`/`devEngines` own Node 24/npm 11; apps do not duplicate them.

Only CSV and MD declare npm dependencies, and each owns `@playwright/test` in its own `devDependencies`. Their test scripts correspond to app-owned configs and tests. AV and RST declare only the real shared-server `dev` capability. The repository has one canonical root `package-lock.json`; no app-level `package-lock.json` or `npm-shrinkwrap.json` was found. No app package declares a fake test, build, publish, or server capability.

### 3.3 Runtime and protected-asset findings

| Record | Apps / requirement | Status | Evidence and missing fact | Impact / risk | Owner | Re-evaluation / remediation candidate | Separate Issue? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `NC-01` | AV `AST-01` | non-compliant | `vendor/avsc.js`, `vendor/avsc-LICENSE.txt`, HTML and README establish purpose, location, avsc 5.7.7, MIT, and offline use. Repository owner/maintenance boundary and update procedure are absent. Exact vendoring/build history is `unconfirmed`. | A future update may not be reproducible even though current license material is preserved. | `apps/avro-viewer/` | Reevaluate when avsc or its README changes; document owner and a verified update procedure without replacing vendor assets. | Yes, if remediation is prioritized. |
| `NC-02` | CSV `AST-01` | non-compliant | `html2canvas.min.js` is loaded locally by `index.html` and used for PNG export, but README has no provenance, version/pinning, license/attribution, owner, update method, or delivery record. Repository-specific introduction history is `unconfirmed`. | License and safe-update decisions cannot be reproduced. | `apps/csv-gantt-viewer/` | Reevaluate on export/runtime asset change; investigate rather than infer provenance, then add the seven records. | Yes. |
| `NC-03` | MD `AST-01`, `PAG-02` | non-compliant | HTML loads unversioned `marked` and `mermaid` from `cdn.jsdelivr.net`; README describes use and links upstream but omits pinned/verification method, third-party licenses, owner/update boundary, host/network/offline and Pages prerequisites. Resolved runtime versions are `unconfirmed`. | Upstream drift and network failure can change or disable rendering; this explains the likely external-runtime pattern in `RUN-04` but does not prove its cause. | `apps/markdown-editor/` | Reevaluate when either CDN URL or rendering changes; document or deliberately pin after a separately scoped decision. | Yes. |
| `NC-04` | RST `AST-01`, `PAG-02` | non-compliant | HTML identifies jsDelivr/esm.sh URLs and several versions; README lists library names only. `es-module-shims@1` is not fully pinned, and provenance, licenses, owner/update method, hosts, network/offline and Pages prerequisites are incomplete. Repository-specific maintenance/attribution history is `unconfirmed`. | Offline use is incomplete and CDN/version changes can alter startup or rendering. | `apps/restructuredtext-editor/` | Reevaluate on import-map/CDN changes; record verified details and unresolved items without guessing. | Yes. |
| `NC-05` | all apps `AST-02` | non-compliant | Local icons and samples exist in every app; AV also has Avro samples, CSV has CSV samples/config, MD has templates, and RST has `assets/sample.rst`. READMEs describe some purpose/location but do not consistently record rights/attribution considerations and app-directory ownership. | Maintainers cannot tell whether protected local assets may be replaced or redistributed. | each `apps/<name>/` | Reevaluate whenever a local protected asset changes; add app-specific ownership/rights notes. | One app-scoped Issue per remediation is preferable. |

These are documentation/provenance findings, not a recommendation to normalize CDN, vendored, or local-minified assets into npm dependencies. No protected asset or license file was changed or removed.

### 3.4 Test, documentation, change, and exception findings

- **AV / `TST-01`, `DOC-01`:** The package correctly has no test script, but the README does not explicitly state that automated tests are absent or give a reproducible manual verification checklist. It also lacks the complete owner/update and local-asset records. This is `non-compliant`, not a request for a fake test.
- **CSV / `DOC-01`:** Test commands and runtime entry are documented, but the README lacks the required runtime/dependency overview, license/attribution, known constraints, maintenance owner, protected-asset update method, and complete local asset records.
- **MD / `DOC-01`:** Purpose, startup, tests, features, and the app's MIT license are documented. Third-party CDN licensing/version/network/offline details, local protected-asset rights, owner boundary, update method, and explicit known constraints remain incomplete.
- **RST / `TST-01`, `DOC-01`:** The package correctly has no test script, but automated-test absence and reproducible manual verification are not documented. CDN licensing/version/update/network details, license/attribution, constraints, local-asset rights, and owner boundary are incomplete.
- **`CHG-01`:** Issue #43 defines purpose, parent, scope, non-scope, expected file, stages, and acceptance conditions. The result is confined to this report; found violations are not hidden by app remediation.
- **`EXC-01`:** No repository evidence constitutes a complete exception record. Consequently there is no `exception` result and no implicit exemption. A later exception must include all section-13 fields.
- **`COM-01`:** Different runtime and test models remain app-owned. No commonization is needed for conformance and none is introduced.

Documentation remediation candidates have the same default owner as their application directory, should be reevaluated on README/dependency/asset/test changes, and require separate Issues because README correction is outside Issue #43. Their impact is review ambiguity and inability to reproduce maintenance decisions, rather than evidence that current user-facing features are defective.

## 4. Execution evidence

Commands were run from the repository root with Node `v24.18.0` and npm `11.16.0`, matching root policy. npm printed an environment warning that `http-proxy` is an unknown npm config; it did not block installation, discovery, browser preparation, or execution.

| ID | Command / check | Result | Observed evidence and interpretation |
| --- | --- | --- | --- |
| `RUN-01` | `npm ci` | passed | Installed 22 packages from the sole root lockfile; all four workspaces resolved. |
| `RUN-02` | `npm run test:browser:install` | passed | Root `--if-present` orchestration invoked Chromium installation for CSV and MD only. AV and RST were skipped without fake scripts. |
| `RUN-03` | `npm run test:list` | passed | CSV discovered 10 tests in 8 files; MD discovered 22 tests in 2 files; total 32. AV and RST were intentionally absent. |
| `RUN-04` | `npm test` | failed | CSV: 10/10 passed. MD: 16 passed, 6 failed. Failures involved missing preview output/image/checklist, Mermaid never becoming available, and TOC wait timeout. Root returned non-zero and therefore correctly propagated the workspace failure. External CDN runtime failure is a plausible inference from the symptoms and unpinned CDN imports, but was not conclusively established; the test failure itself remains factual. |
| `RUN-05` | `timeout -s TERM 3s npm run dev --workspace=<name>` plus `curl http://127.0.0.1:8000/`, for each of the four names | passed | Every app returned HTTP 200 with its own title. Each server logged its validated workspace and standard URL, received SIGTERM, printed `Static server stopped.`, and released port 8000. `timeout` itself returns 124 after deliberately sending the termination signal; that expected wrapper code is not a server failure. |
| `RUN-06` | `curl -L` against production root and four `/pocketly/apps/<name>/` URLs | passed | Root and all four production entry points returned HTTP 200 on 2026-07-25 UTC. Static inspection found repository-owned HTML asset references relative. This confirms entry reachability, not every interactive feature or external CDN response. |
| `RUN-07` | `Pocketly CI / Monorepo tests` at the final PR head | unconfirmed | A PR and its final remote head did not yet exist while the report was authored. This is external post-push evidence and must be recorded in the PR/Issue; it is not inferred from local commands. Given `RUN-04`, success must not be claimed until GitHub reports it. |

The current execution conclusion is therefore: preparation and discovery passed; all development entry points and production Pages entries passed; the complete root test command failed while correctly demonstrating test ownership and CI failure propagation. No test result is relabeled as success because the command ran.

## 5. Integrated disposition

### 5.1 Per-application decision

| App | Decision | Reason |
| --- | --- | --- |
| AV | non-compliant | Core identity/package/dev/CI/Pages requirements pass and test-less status is valid, but third-party/local asset maintenance records and test-less/manual-verification README requirements are incomplete. |
| CSV | non-compliant | Core and Playwright contracts pass, including 10 tests, but the local-minified html2canvas and protected local assets lack mandatory records and the README minimum set is incomplete. |
| MD | non-compliant | Core and Playwright participation contracts pass, but CDN/protected-asset documentation is incomplete and the current 22-test run has 6 failures (16 pass). |
| RST | non-compliant | Core identity/package/dev/CI/Pages requirements pass and test-less status is valid, but CDN/local asset records, network limitations, and test-less/manual-verification README requirements are incomplete. |

`non-compliant` here is an integrated result, not a demand to reach zero findings inside this verification PR. No optional capability absence is counted as a violation, no test-less app receives a fake pass, and no unknown provenance is fabricated.

### 5.2 Exceptions, unconfirmed facts, and follow-up ownership

- **Exceptions:** none found or granted. No expiry or compensating verification can be recorded for a nonexistent exception.
- **Unconfirmed asset facts:** CSV html2canvas introduction/version/license history, AV vendoring procedure, MD resolved CDN versions, and RST repository-specific dependency/attribution history. Each remains owned by its app directory and is reconsidered on the corresponding dependency/asset/README change.
- **Unconfirmed operations fact:** final-head `Pocketly CI / Monorepo tests` status. PR author/maintainer owns recording it after push; branch-protection required-check enablement remains a Phase 3 deferred operation and is not an App Contract failure.
- **Remediation split:** asset/dependency records, app README minimum fields, and any MD test diagnosis should be separate app-scoped Issues/PRs. Contract, root package/lockfile, CI, Pages, dependency-model conversion, and commonization changes must not be bundled automatically.

## 6. Lv3-D onboarding/change-checklist handoff

Lv3-D can convert the following into a checklist without changing the acceptance semantics:

1. **Identity evidence:** record directory, package name/private/description, app entry, exact root workspace entry, root relative link, and expected `/pocketly/apps/<name>/` URL.
2. **Dependency evidence:** list npm owners, verify the sole root lockfile, and explicitly search for app lockfiles/shrinkwrap and undeclared/fake scripts.
3. **Runtime-asset inventory:** classify every npm/CDN/vendored/local-minified/dynamic-import/local protected asset. For third-party runtime assets require purpose, path/URL, provenance, version/pinning, license, owner, update method, and network/offline/Pages assumptions. Preserve unknowns as `unconfirmed`.
4. **Development evidence:** run the exact workspace `dev` command, obtain HTTP 200 from the standard endpoint, record workspace validation, then send a termination signal and confirm the port is released.
5. **Test capability fork:** for test owners, record app-owned scripts/config/tests/dependencies, Chromium scope, HTTP config, exact discovery counts, and root failure propagation. For test-less apps, require an explicit README status and reproducible manual steps while forbidding fake scripts.
6. **CI evidence:** run `npm ci`, browser preparation when applicable, `npm run test:list`, and `npm test`; preserve `passed`, `attempted but blocked`, `failed`, and `not run`. Separately record the final-head `Pocketly CI / Monorepo tests` conclusion and do not confuse deferred required-check operations with conformance.
7. **Pages evidence:** inspect relative repository assets and root links, verify the expected subpath, and record production or preview execution. For CDN consumers, verify documented hosts and offline/network limitations.
8. **README evidence:** review the nine section-11 fields individually; a general “structure” or “dependencies” heading is not evidence for omitted license, owner, update, or constraints facts.
9. **Change classification:** link the Issue, state scope/non-scope and expected files, classify app/contract/platform impact, and justify or split mixed categories.
10. **Exception processing:** require requirement ID, reason, app/scope, impact/risk, owner, compensating verification, review trigger/expiry, and resolution/continuation/commonization criteria. Missing fields mean `non-compliant` or `unconfirmed`, never an implicit exception.
11. **Evidence record shape:** retain `requirement ID | app | status | repository path/command | observed result | impact | owner | review trigger | remediation/Issue decision` so every later decision is reproducible.

This handoff establishes a verification format only. It does not create the Lv3-D checklist, modify the current App Contract, or assert a Phase 4 completion baseline.
