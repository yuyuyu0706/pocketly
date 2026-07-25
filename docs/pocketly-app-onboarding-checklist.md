# Pocketly app onboarding / change checklist

## 1. Purpose and authority

This is the reusable execution and evidence checklist for adding an official Pocketly app or changing an existing one. It translates the current [`Pocketly App Contract`](pocketly-app-contract.md) into an ordered workflow; it does not replace that contract or create requirements. Use the contract when this checklist and a requirement appear to differ.

The [`capability matrix`](pocketly-app-capability-matrix.md) records current facts and the [`conformance report`](pocketly-app-conformance-report.md) records a point-in-time verification result. Neither is a substitute for checking the files and final revision being changed. Package execution and CI details remain owned by the [Phase 2 package execution contract](phase-2-package-execution-contract.md) and [Phase 3 CI contract](phase-3-ci-contract.md).

Complete this checklist from the repository root unless a step says otherwise. Copy the applicable items and the evidence templates into the Issue or PR. A checked box means the item was considered and evidence was recorded; it does not by itself mean that a command passed or a requirement is compliant.

## 2. Choose the entry path

### 2.1 New official app

Use this path when adding a workspace and a root Pages entry.

- [ ] Evaluate every **Required** requirement (`ID-01` through `COM-01` as applicable).
- [ ] Evaluate each **Conditionally required** requirement activated by the app's adopted capabilities.
- [ ] Record an unadopted **Optional** capability as `not applicable`, not as a defect.
- [ ] Confirm every **Prohibited** practice is absent.
- [ ] Keep workspace registration, the root lockfile, and root Pages entry consistent in the same scoped change.

### 2.2 Existing official app change

Use this path for an application already listed in root `package.json`.

- [ ] Identify only the requirement IDs affected by the files, capability, dependency, asset, test, runtime, or delivery behavior being changed.
- [ ] Apply Required and activated Conditionally required items in that impact set.
- [ ] Mark unrelated checklist groups `not applicable` with a short reason; do not turn this into a full retrospective audit.
- [ ] Do not remediate unrelated historical differences in the same PR. Record a follow-up Issue decision when a newly observed difference needs separate work.
- [ ] Do not treat the absence of an Optional capability, including automated tests, as non-compliance.

## 3. Preflight and change classification (`CHG-01`)

Record these before implementation:

```text
Issue / parent Issue:
entry path: new app | existing app change
purpose:
scope:
non-scope:
expected files:
acceptance criteria:
change class: app feature | app contract | root platform / CI / Pages
app(s) and capability affected:
applicable requirement IDs / contract sections:
mixed scope impact and necessity:
can the classes be split into separate Issues / PRs?: yes | no — reason
```

- [ ] The Issue, parent purpose, scope, non-scope, expected files, and acceptance criteria were reviewed.
- [ ] Each change is classified as `app feature change`, `app contract change`, or `root platform / CI / Pages change`.
- [ ] For mixed classifications, impact, necessity, and PR-splitting feasibility are explicit.
- [ ] App feature and contract/platform work are separated unless the Issue expressly requires both and records why they cannot be split.
- [ ] The PR does not silently add contract changes, CI/Pages infrastructure, app remediation, commonization, or deferred Phase 3 operations.

## 4. Repository checklist

Use the requirement IDs defined by the conformance report. For an existing change, complete only the applicable groups selected during preflight.

### 4.1 Identity, workspace, and Pages registration (`ID-01`, `ID-02`, `PAG-01`)

- [ ] Directory is `apps/<app-name>/`; the name is unique lowercase kebab-case.
- [ ] App `package.json` `name` exactly matches the directory, is unique, declares `private: true`, and has a non-empty purpose `description`.
- [ ] Root-owned Node/npm policy is not needlessly duplicated in the app package.
- [ ] The app owns an `index.html` entry point.
- [ ] For a new app, root `package.json` lists its exact workspace path; the explicit list was not replaced by an `apps/*` glob.
- [ ] For a new app, root `index.html` has a relative link and the expected public URL is `/pocketly/apps/<app-name>/`.
- [ ] Existing root links, `.nojekyll`, and all unrelated app entries remain intact.
- [ ] For a new app, dependency installation was run at root and only the canonical root lockfile was updated as needed.

Suggested repository evidence: `apps/<app-name>/package.json`, `apps/<app-name>/index.html`, root `package.json`, root `index.html`, `package-lock.json`, and `.nojekyll`.

### 4.2 Package and dependency ownership (`PKG-01`)

- [ ] Every script represents a real app capability; no fake passing script or empty suite was added.
- [ ] Every directly used npm package is declared by the app in the appropriate `dependencies` or `devDependencies` section.
- [ ] Dependencies were installed and the lockfile was updated from repository root.
- [ ] Root `package-lock.json` is the only lockfile; no app-level `package-lock.json` or `npm-shrinkwrap.json` exists.
- [ ] The implementation does not rely on an undeclared hoisted package.
- [ ] App-owned dependencies were not moved to root merely because another app uses the same technology.
- [ ] Optional metadata describes a real need; static apps are not required to add `main` or `version`.

### 4.3 Third-party runtime assets (`AST-01`)

Inventory each adopted or changed CDN, vendored, local-minified, or dynamic-import asset separately. Do not normalize one model into another without separately scoped work.

```text
asset model: CDN | vendored | local-minified | dynamic-import
purpose and repository path / URL:
upstream / provenance:
version and pinning / verification method:
license / attribution:
repository owner / maintenance boundary:
update method or unconfirmed fact:
runtime network, offline availability, and Pages delivery assumptions:
```

- [ ] All seven fields are recorded in the app README or a directly linked app-owned document.
- [ ] URL/host and dynamic import behavior are included where relevant.
- [ ] Existing vendor and license files are preserved unless replacement is explicitly in scope.
- [ ] Unknown provenance, version, license, or update history is written as `unconfirmed`; it is never guessed.

### 4.4 Local protected assets (`AST-02`)

For every adopted or changed local image, icon, font, sample, or template:

- [ ] Purpose and repository location are recorded.
- [ ] Rights, license, and attribution considerations are recorded without inference.
- [ ] The app-directory owner / maintenance boundary is recorded.
- [ ] Unknown facts remain `unconfirmed` and have an owner and review trigger or follow-up decision.

### 4.5 Development entry (`DEV-01`)

- [ ] A real `dev` script is present and uses the root-owned static server.
- [ ] The documented standard command is `npm run dev --workspace=<package-name>`.
- [ ] The documented endpoint is `http://127.0.0.1:8000/`; `file://`, Python HTTP server, or another server is not presented as standard.
- [ ] An invalid/unregistered workspace is rejected as expected when workspace validation itself changes.
- [ ] The app entry returns HTTP 200 and belongs to the selected workspace.
- [ ] SIGINT/SIGTERM stops the server normally and port 8000 is released.
- [ ] Only one workspace server is started at a time.

Record the exact command, HTTP observation, stop signal/result, and port-release check. A timeout wrapper's expected code after deliberately sending a signal is not itself a server failure; describe what was observed.

### 4.6 Test capability fork (`TST-01`, `TST-02`)

First select exactly one path:

#### Test-owning app

- [ ] App owns real `test` and `test:list` scripts, test files, configuration, and test dependencies.
- [ ] If browser preparation is required, app owns a real `test:browser:install` script.
- [ ] Root `npm run test:list` discovers the app's tests and root `npm test` propagates its failures.
- [ ] Discovery counts and execution results are recorded rather than assumed from an older report.

If the app owns Playwright:

- [ ] Browser scope is Chromium.
- [ ] App-owned config starts `npm run dev`, uses `http://127.0.0.1:8000/`, and sets `reuseExistingServer: false`.
- [ ] A manually started port 8000 server is stopped before execution.
- [ ] Playwright dependency and config remain app-owned.

#### Test-less app

- [ ] No fake `test`, fake `test:list`, empty suite, or success-only script was added.
- [ ] App README explicitly states that automated tests are absent.
- [ ] App README provides reproducible manual verification steps and expected observations.
- [ ] Root orchestration intentionally skips the workspace via `--if-present`; a skip is not reported as a passing app test.

### 4.7 README minimum fields (`DOC-01`, and `PAG-02` when applicable)

Check each App Contract section 11 field individually. A general heading is not evidence for an omitted fact.

- [ ] 1. Purpose and supported use.
- [ ] 2. Standard root command and `http://127.0.0.1:8000/` endpoint.
- [ ] 3. Runtime and dependency model.
- [ ] 4. Automated-test presence and commands, or absence and reproducible manual verification.
- [ ] 5. CDN, vendored, and local protected asset status, with links to details.
- [ ] 6. License and attribution.
- [ ] 7. Known constraints and external-network prerequisites.
- [ ] 8. Owner or app-directory maintenance boundary.
- [ ] 9. Dependency/protected-asset update method and any explicit `unconfirmed` facts.
- [ ] For a CDN consumer, external hosts, required runtime network access, and offline limitation are explicit (`PAG-02`).
- [ ] Observed facts, contract requirements, and verification results are not presented as interchangeable.

## 5. Local verification route (`CI-01`, `DEV-01`, `PAG-01`)

### 5.1 Preparation and root orchestration

Ensure no manually started server occupies port 8000. Run the repository-owned sequence from root:

```bash
node --version
npm --version
npm ci
npm run test:browser:install
npm run test:list
npm test
```

- [ ] Node.js 24 and npm 11 match `.nvmrc` and root `engines` / `devEngines`; any mismatch or use of `--force` is disclosed.
- [ ] `npm ci` resolves all explicit workspaces from the sole root lockfile.
- [ ] Browser preparation invokes only workspaces that own it; an intentional `--if-present` skip is not a failure or a fake pass.
- [ ] Test discovery records counts by owning app.
- [ ] Test execution records each outcome and confirms non-zero failures propagate through the root command.

`npm run test:browser:install` remains part of the root contract even when the changed workspace is test-less. If a narrower command is chosen for an existing app change, record why the omitted root commands were `not run` and who must rerun them. Do not claim the complete route passed.

### 5.2 Per-workspace development verification

For every new app, and every existing app whose runtime/delivery entry is affected:

```bash
npm run dev --workspace=<package-name>
curl --fail --show-error http://127.0.0.1:8000/
```

- [ ] Record workspace name, HTTP status and identifying response observation.
- [ ] Send a normal termination signal and record the shutdown observation.
- [ ] Confirm a subsequent bind/start can use port 8000, or otherwise verify the port was released.

### 5.3 Local command result vocabulary

Command execution status and contract-decision status answer different questions. Never substitute one for the other.

| Execution result | Use when |
| --- | --- |
| `passed` | The command/check completed and met its stated expectation. |
| `attempted but blocked` | It was started but an environment/external prerequisite prevented a conclusion; record the blocker. |
| `failed` | It completed with a failing result or contradicted the expectation; preserve the failure. |
| `not run` | It was not attempted; record the reason and recheck owner. |

| Requirement status | Use when |
| --- | --- |
| `compliant` | Applicable repository and execution evidence satisfies the requirement. |
| `non-compliant` | An applicable Required or Conditionally required item is missing or contradicted. |
| `not applicable` | The optional capability or activating condition is absent. This is not a defect. |
| `exception` | A complete section 13 exception record authorizes and bounds the difference. |
| `unconfirmed` | Evidence cannot establish the fact; do not interpret this as compliance or absence. |

A failed test can coexist with compliant CI failure propagation. Likewise, a command that ran is not necessarily `passed`, and a test-less skip is not a passing test.

## 6. Pages and external-runtime verification (`PAG-01`, `PAG-02`)

- [ ] Root `index.html` still reaches every official app through relative links.
- [ ] Expected changed-app URL is `/pocketly/apps/<app-name>/`; domain-root hosting is not assumed.
- [ ] Repository-owned scripts, styles, images, fonts, samples, and templates resolve through relative paths under the subpath.
- [ ] `.nojekyll` and existing app routes remain intact.
- [ ] For a new app or delivery-affecting change, production/preview Pages status, exact URL, date, and observed result are recorded after deployment.
- [ ] If Pages verification is `not run` or `attempted but blocked`, the reason, impact, and recheck owner are recorded.
- [ ] For CDN/dynamic runtime assets, each host, network prerequisite, offline limitation, and expected Pages delivery behavior is documented and checked where possible.
- [ ] External resource reachability is not inferred from an HTTP 200 for the app entry page.

A Pages infrastructure or workflow change belongs to the root platform/CI/Pages class. Do not pull it into an app-feature PR merely to make this verification pass; record the impact and splitting decision instead.

## 7. Final-head CI evidence

Local evidence is fixed to the locally tested commit. GitHub Actions evidence exists only after push and must be recorded separately for the final PR head.

```text
final PR head SHA:
check: Pocketly CI / Monorepo tests
check URL:
observed at (UTC):
result: passed | attempted but blocked | failed | not run
observed result / failing step:
local evidence commit SHA:
difference between local and final head, if any:
recheck owner and action, if not passed:
```

- [ ] The recorded check belongs to the final PR head, not an earlier push.
- [ ] Local and Actions outcomes remain separate even when they agree.
- [ ] A cancelled, pending, absent, or externally blocked run is not relabeled `passed`.
- [ ] If the head changes, stale evidence is replaced with evidence for the new final head.
- [ ] Branch-protection/ruleset/required-check enablement and other Phase 3 deferred operations are not claimed as completed by this checklist.

## 8. Decision records

### 8.1 Copyable evidence record

Use one record per requirement/app decision. Repeat it for distinct commands or assets when combining them would hide a result.

```text
requirement ID:
app / scope:
requirement status: compliant | non-compliant | not applicable | exception | unconfirmed
repository path / exact command:
execution result (if applicable): passed | attempted but blocked | failed | not run
observed result:
impact / risk:
owner / maintenance boundary:
review trigger / deadline:
remediation / follow-up Issue decision:
evidence commit SHA / observed date:
```

### 8.2 Exception record (`EXC-01`)

Optional capability absence normally needs `not applicable`, not an exception. If an applicable Required or Conditionally required item cannot immediately be met, record **all** fields in a repository-accessible capability matrix, app README, or Issue:

```text
target requirement ID / contract requirement:
reason:
target app / scope:
impact and risk:
owner / maintenance boundary:
compensating verification:
review trigger or deadline:
conditions for resolution, continuation, or Phase 5 candidacy:
record location / Issue:
```

- [ ] The exception has every field and is linked from the evidence record.
- [ ] It is reevaluated at its trigger/deadline, when the related area changes, or when its premise disappears.
- [ ] Missing information remains `unconfirmed`; an incomplete record is not an implicit waiver.
- [ ] A compensating check does not erase the unmet requirement.

### 8.3 Non-compliance, unconfirmed facts, and follow-up Issues

- [ ] `non-compliant` and `unconfirmed` observations are not silently fixed outside the current Issue scope.
- [ ] Impact, owner, review trigger, and disposition are recorded even when no immediate Issue is opened.
- [ ] A follow-up Issue is opened or explicitly declined/deferred with a reason; no automatic remediation is implied.
- [ ] App remediation is app-scoped; App Contract, CI, Pages, or platform changes use their owning scope.

### 8.4 Commonization decision (`COM-01`)

Do not create `packages/`, `shared/`, or `common/` as a checklist side effect. A Phase 5 candidate is recorded only when all four statements have evidence:

- [ ] Two or more apps have an actually repeated responsibility or maintenance burden.
- [ ] Shared ownership has greater maintenance value than app-local ownership.
- [ ] The interface and lifecycle are sufficiently stable.
- [ ] Coupling, release, test, CI, and Pages-delivery impacts can be explained.

Otherwise record no commonization candidate. Similar appearance, one consumer, or hypothetical future use is insufficient.

## 9. PR handoff and completion review

Include in the PR body:

- [ ] Issue link and `Closes #<issue>`.
- [ ] Entry path, classification, scope/non-scope, changed files, and requirement IDs reviewed.
- [ ] Evidence records for repository checks and exact local commands.
- [ ] Explicit `passed` / `attempted but blocked` / `failed` / `not run` outcomes and reasons.
- [ ] Separate final-head `Pocketly CI / Monorepo tests` evidence (or a clearly assigned post-push placeholder until it exists).
- [ ] Pages/subpath/CDN evidence when applicable, including unmet external prerequisites.
- [ ] Exceptions, unresolved `unconfirmed` facts, non-compliance, follow-up Issue decisions, and owners.
- [ ] Mixed-scope split decision and confirmation that unrelated apps/assets were not changed.
- [ ] `git diff --check` result and inspection of the final changed-file list.

## 10. Phase 4 / Lv3-E handoff

This checklist's operation should provide Lv3-E with inputs, not create the Phase 4 completion baseline itself. Record:

```text
fixed decisions demonstrated by this use:
unresolved facts / exceptions and owners:
repeated friction or ambiguity:
Phase 5 commonization candidate (only if all COM-01 conditions hold):
template / automation candidate to evaluate after operating experience:
items deliberately left to Phase 3 deferred operations:
```

Do not treat a possible template, checker, workflow, required-check setting, or shared package as remaining implementation for the current app change. Such work requires its own Issue and owning contract.
