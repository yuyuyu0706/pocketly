# Phase 3 CI Completion Baseline

## 1. Purpose and scope

This is the completion baseline for Pocketly Phase 3 / Lv2 issue #27 and Lv3-E issue #36. It records the final known state of the GitHub Actions monorepo CI work, separates historical evidence from the current operating contract, and hands the relevant boundaries to Phase 4 (App Contract).

It does not add CI features, change repository settings, or redefine application contracts. The workflow and application/package files are intentionally outside this documentation-only change.

## 2. Completion decision

**Decision: completed with deferred items.**

The implemented, read-only CI workflow is present and its pull-request and `main` push success paths have passed. Its stable workflow/job identity, runtime, command sequence, and failure policy are recorded in the current contract. However, authenticated operations required to make the check mandatory and to observe non-success paths have not been completed. Those items are deferred to the Phase 3 Lv2 issue #27; they must not be represented as passed or as active enforcement.

| Completion criterion | Status | Basis |
| --- | --- | --- |
| CI execution contract and workflow | passed | Lv3-A and Lv3-B were merged; the current workflow matches the contract. |
| Pull-request and `main` push success | passed | Recorded GitHub Actions runs completed successfully. |
| Manual dispatch, deterministic failure, cancellation, and rerun | attempted but blocked | The available environment lacks GitHub write credentials. |
| PR Checks UI label and required-check configuration | attempted but blocked | They require authenticated maintainer access and the UI label has not been confirmed. |
| Pending/failed/recovery/bypass merge-control evidence | not run | It depends on the required check being configured after the prerequisite evidence is collected. |
| Artifact/report conclusion from a real failure | deferred | There is no upload step; decide whether an artifact or report is needed after an actual failure is observed. |

## 3. Phase 3 timeline

| Lv3 | Issue / PR | Merge commit | Main outcome | Status |
| --- | --- | --- | --- | --- |
| Lv3-A | #28 / #29 | `06443e9b6bba8081a68dd107ccb4a248ace0bc4f` | Defined the CI execution contract. | passed |
| Lv3-B | #30 / #31 | `056734be99facf84369fc53484c8a81332f49dd8` | Implemented the monorepo workflow. | passed |
| Lv3-C | #32 / #33 | `5e3035dff035c64f14affbb0b44b13ac75e32c7f` | Recorded successful paths, procedures, and authentication limits. | partial outcome merged; issue remains open with deferred verification |
| Lv3-D | #34 / #35 | `339b5763942ac30d93210318a728853062a226c4` | Documented the required-check preconditions, settings procedure, and rollback. | completed; operations remain deferred to #27 |
| Lv3-E | #36 / this PR | Pending merge | Records this completion decision and Phase 4 handoff. | completed with deferred items on merge |

## 4. Implemented workflow

The implemented workflow is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It is a single GitHub-hosted `ubuntu-24.04` job with a 20-minute timeout and the following stable identity:

| Item | Current value |
| --- | --- |
| Workflow display name / file | `Pocketly CI` / `.github/workflows/ci.yml` |
| Job ID / display name | `test` / `Monorepo tests` |
| Triggers | Pull requests targeting `main`, pushes to `main`, and `workflow_dispatch` |
| Permissions | `contents: read` |
| Concurrency | `${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true` |
| Runtime source | `.nvmrc` (Node.js 24; bundled npm 11) |
| Cache | `actions/setup-node` npm package cache keyed from root `package-lock.json` |
| Actions | `actions/checkout@v6` without persisted credentials; `actions/setup-node@v6` |
| Artifact/report implementation | No upload step |
| Required-check candidate | `Pocketly CI / Monorepo tests` (not a confirmed UI label or configured required check) |

## 5. Current CI and command contract

The current design contract is [`phase-3-ci-contract.md`](phase-3-ci-contract.md), not this historical baseline. The workflow must continue to execute these repository-owned commands in order:

```text
node --version
npm --version
npm ci
npm exec --workspace=csv-gantt-viewer -- playwright install-deps chromium
npm run test:browser:install
npm run test:list
npm test
```

The Linux dependency command prepares the runner; the root browser-install command remains the repository-owned Chromium preparation contract. Test discovery and execution remain workspace-owned: CSV Gantt Viewer has 10 Playwright tests, Markdown Editor has 22, and Avro Viewer plus reStructuredText Editor have no fake `test` scripts and are skipped by root `--if-present` orchestration. The suites run sequentially using the fixed HTTP port `8000` and app-owned Playwright configuration.

## 6. Verification matrix

| Scenario | Status | Recorded evidence or limitation |
| --- | --- | --- |
| Pull-request success | passed | [Run 29754096438](https://github.com/yuyuyu0706/pocketly/actions/runs/29754096438), job 88391876762, completed successfully for commit `aebf2070cbdb4212262b7923ea2813df50f89ec2`. |
| `main` push success | passed | [Run 29755431748](https://github.com/yuyuyu0706/pocketly/actions/runs/29755431748), job 88396441527, completed successfully for merge commit `056734be99facf84369fc53484c8a81332f49dd8`. |
| PR #35 recorded success | passed | PR #35 head `688978abce70e0f88e89a2d2ed79ed63b7efae37`: [run 30098388265](https://github.com/yuyuyu0706/pocketly/actions/runs/30098388265), job 89498013805, succeeded. |
| `workflow_dispatch` | attempted but blocked | Unauthenticated dispatch returned HTTP 403; no write-capable credential was available. |
| Deterministic failure and failure visibility | attempted but blocked | Temporary failure commit `3b71d77a92552cd25d2bcddd52b1b2fe60fb3204` could not be pushed and was reverted by `25fe11fa60fefc156632fb2bedcd0008ae7f4626`; no failed run was created. |
| Cancellation | attempted but blocked | It requires pushed, overlapping PR commits; missing write access prevented reproduction. |
| Rerun | attempted but blocked | An unauthenticated rerun request returned HTTP 403; no new attempt was created. |
| Recovery success | not run | Requires a pushed deterministic failure followed by its revert. |
| PR #37 recorded success | passed | PR #37 recorded head `36690abe93a51385118842753266acd4e8359a65`: [run 30103153212](https://github.com/yuyuyu0706/pocketly/actions/runs/30103153212), job 89513983131, succeeded. This is recorded run evidence, not a final fixed SHA. |
| Artifact/report decision | deferred | Reassess after an authenticated failed run; no failure-output evidence exists. |
| Actual PR Checks UI label | attempted but blocked | Public metadata confirms the candidate only; a maintainer must inspect the PR Checks UI. |
| Required-check setting | attempted but blocked | Not readable or changeable without authenticated repository access. |
| Pending/failed/success merge control | not run | Cannot be tested before confirmed required-check configuration. |
| Direct push, administrator, and bypass behavior | not run | Requires authenticated inspection and an authorized operational test. |

## 7. Required-check and repository-settings state

`Pocketly CI / Monorepo tests` is a **candidate**, derived from the stable workflow and job names. It is not evidence that GitHub displays exactly that label in the PR Checks UI, nor that it is configured as required.

Read-only public observations recorded on 2026-07-24 established that `main` is the default branch and `GET /repos/yuyuyu0706/pocketly/rulesets` returned an empty array. The unauthenticated branch-protection endpoint returned HTTP 401. PR #35 and its operations record contain no repository-settings change record; that historical record does not establish the authenticated current state. Therefore this baseline does not infer the absence of branch protection, hidden rulesets, pull-request requirements, required checks, administrator enforcement, bypass actors, force-push/deletion controls, or merge queue settings. The authenticated current configuration remains unconfirmed.

## 8. Observability, failure handling, and recovery

The workflow fails on setup, dependency, browser, discovery, and test errors; it uses no `continue-on-error`. GitHub Actions step logs are the implemented primary diagnostic surface. There is no upload step; whether an artifact or report is needed will be decided after an actual failure is observed.

For an authorized completion, use the retained procedures in [`phase-3-ci-verification.md`](phase-3-ci-verification.md) to create a temporary deterministic failure, observe its named step and logs, rerun it, revert it, and record recovery. Use [`phase-3-ci-operations.md`](phase-3-ci-operations.md) for settings selection, merge-control evidence, and rollback. Preserve existing controls and restore captured settings if a newly added check blocks normal operation.

## 9. Fixed decisions and unchanged areas

The following decisions are fixed unless a separately scoped issue changes them:

- One read-only workflow and one `Monorepo tests` job; no CI-only test scripts.
- Node.js 24 / npm 11 from `.nvmrc`, npm workspaces, and the root `package-lock.json`.
- Chromium-only preparation; Playwright and its configuration remain owned by the tested apps.
- Root `--workspaces --if-present` orchestration; test-less workspaces remain honestly test-less.
- Sequential fixed-port `8000` HTTP test execution; no automatic port allocation or casual parallelization.
- No `pull_request_target`, secrets, write permissions, Node/browser matrix, workspace job split, path filters, coverage, visual regression, or artifact upload step initially.

Phase 3 did not modify application behavior, app package ownership, the lockfile, GitHub Pages deployment/path behavior, vendor/license assets, historical Phase 0--2 baselines, or introduce `packages/`, `shared/`, or `common/`.

## 10. Deferred items and re-entry conditions

| Deferred item | Current status and reason | Re-entry condition / owner | Evidence destination | Blocks Phase 4? |
| --- | --- | --- | --- | --- |
| Manual dispatch, failure, cancellation, rerun, and recovery | attempted but blocked: no GitHub write credential in the recorded environment. | An authenticated maintainer performs the procedures on a temporary PR branch. | Update `phase-3-ci-verification.md`; track completion in #27. | No; Phase 4 must preserve the CI contract meanwhile. |
| Actual PR Checks UI label | attempted but blocked: UI access was unavailable. | Maintainer inspects a current `main` PR and records label, run, job, SHA. | Update verification and operations records; #27. | No. |
| Required-check configuration and merge controls | not run / not configured by this work. | After prior evidence passes, authorized operator selects the minimal existing protection mechanism and verifies pending, failed, recovery, and bypass behavior. | Update `phase-3-ci-operations.md`; #27. | No; do not claim enforcement until complete. |
| Artifact/report decision | deferred: no real failed output exists. | Evaluate actual failed-run diagnostics before adding any artifact feature. | Update verification/contract only through a separately scoped issue if implementation changes. | No. |
| Authenticated repository-settings inventory | attempted but blocked. | Administrator records existing protection/ruleset, review, bypass, force-push/deletion, and merge-queue state before edits. | Update operations record; #27. | No. |

## 11. Source-of-truth documents

| Subject | Source of truth |
| --- | --- |
| Current CI design and fixed contract | [`phase-3-ci-contract.md`](phase-3-ci-contract.md) |
| Implemented workflow | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| CI run evidence and non-success-path procedures | [`phase-3-ci-verification.md`](phase-3-ci-verification.md) |
| Required-check operations, settings inventory, and rollback | [`phase-3-ci-operations.md`](phase-3-ci-operations.md) |
| Phase 3 completion decision and handoff | This baseline |
| Phase 2 input execution contract | [`phase-2-package-execution-contract.md`](phase-2-package-execution-contract.md) |

## 12. Phase 4 handoff

Phase 4 may define the Pocketly App Contract, but that design is outside Phase 3. It inherits the following non-negotiable operating baseline:

- npm workspaces with a root canonical lockfile and root repository-owned commands;
- Node.js 24 / npm 11, Chromium as the standard browser, and Playwright HTTP execution through port `8000`;
- app-owned Playwright dependencies/configuration and test ownership;
- no fake passing tests for test-less workspaces; and
- the workflow/job identity `Pocketly CI` / `Monorepo tests` and its candidate required-check name.

Before changing root scripts, workspace scripts, Playwright configuration, port `8000`, test parallelism, browser scope, workflow/job/required-check names, package metadata, lockfile, or GitHub Pages workflow, a Phase 4 issue must assess the corresponding CI impact. It must not silently rename the workflow/job or bypass the root command contract. The deferred Phase 3 operations above remain owned by #27 and do not authorize Phase 4 to alter repository settings.

## 13. Re-entry conditions

Re-enter Phase 3 operations only in an authenticated maintainer environment with access to push a temporary branch, dispatch/rerun Actions, view PR Checks UI, and read the existing `main` protection/ruleset state. First capture the current settings; then complete the verification procedures, confirm the actual check label, make the smallest non-conflicting settings change if justified, and record the results and rollback information. Close the deferred work only when each result is explicitly recorded as `passed`, `failed`, `attempted but blocked`, `not run`, or `deferred` as applicable.
