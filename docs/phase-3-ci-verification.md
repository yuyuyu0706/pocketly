# Phase 3 CI Verification

## 1. Purpose and scope

This document records the GitHub Actions verification evidence for Phase 3 / Lv3-C, issue #32. Its scope is the existing `Pocketly CI` workflow's success paths and the operational feasibility of its manual, failure, cancellation, and rerun paths. It does not change the workflow, application code, package metadata, Playwright configuration, GitHub Pages workflow, or repository settings.

The parent work is Phase 3 / Lv2 issue #27. The effective CI design remains [`phase-3-ci-contract.md`](phase-3-ci-contract.md), and the implemented workflow remains [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## 2. Workflow identity

| Item | Actual value |
| --- | --- |
| Workflow file | `.github/workflows/ci.yml` |
| Workflow display name | `Pocketly CI` |
| Job ID | `test` |
| Job display name | `Monorepo tests` |
| Actual check name candidate | `Pocketly CI / Monorepo tests` |
| Runner | `ubuntu-24.04` |
| Permissions | `contents: read` |
| Concurrency group | `${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}` |
| Cancellation policy | `cancel-in-progress: true` |
| Artifact policy | No upload step |

The workflow and job names above are the stable required-check candidate to hand to Lv3-D. GitHub's public run and job APIs expose `Pocketly CI` and `Monorepo tests`; a maintainer with PR Checks UI access must make the final UI-label confirmation when enabling the rule or ruleset.

## 3. Environment and command contract

The workflow uses the Node.js version in `.nvmrc`, the npm bundled with Node.js, and the root lockfile cache. Its command sequence is:

```text
npm ci
npm exec --workspace=csv-gantt-viewer -- playwright install-deps chromium
npm run test:browser:install
npm run test:list
npm test
```

The intended runtime is Node.js 24 with npm 11. The tested workspaces remain sequential on port 8000: CSV Gantt Viewer supplies 10 Playwright tests, Markdown Editor supplies 22, and test-less workspaces are skipped through `--if-present`.

## 4. Verification matrix

| Scenario | Status | Evidence / result |
| --- | --- | --- |
| Pull request success | passed | [Run 29754096438](https://github.com/yuyuyu0706/pocketly/actions/runs/29754096438), job [88391876762](https://github.com/yuyuyu0706/pocketly/actions/runs/29754096438/job/88391876762), `pull_request`, attempt 1, commit `aebf2070cbdb4212262b7923ea2813df50f89ec2`, completed `success`. |
| Main push success | passed | [Run 29755431748](https://github.com/yuyuyu0706/pocketly/actions/runs/29755431748), job [88396441527](https://github.com/yuyuyu0706/pocketly/actions/runs/29755431748/job/88396441527), `push` to `main`, attempt 1, commit `056734be99facf84369fc53484c8a81332f49dd8`, completed `success`. |
| Manual dispatch success | attempted but blocked | An unauthenticated `POST` to the workflow-dispatch endpoint for `main` returned HTTP 403 `Method forbidden`; no token or write-capable GitHub CLI is available in this environment. |
| Failure reproduction | attempted but blocked | A safe temporary workflow failure requires creating and pushing a branch commit. This checkout has no configured Git remote or GitHub write credential, so no remote branch/PR can be created without leaving the prescribed environment. |
| Cancellation | attempted but blocked | It depends on two pushed PR commits and observation of an in-progress run. The same missing remote/write capability blocked the safe reproduction. |
| Rerun | attempted but blocked | An unauthenticated `POST` to the rerun endpoint for run 29755431748 returned HTTP 403 `Method forbidden`; therefore no new attempt was created. |
| Artifact/report decision | passed | The successful job plus workflow review show no artifact producer or uploader. No real failure output was accessible in this environment; the existing policy of no empty/low-value artifact remains appropriate. |

## 5. Success-path results

### Pull request

Run 29754096438 was triggered by `pull_request` for the branch `codex/implement-based-on-issue-#30`. Its single `Monorepo tests` job (88391876762) completed successfully on 2026-07-20. This is the initial CI implementation PR run referenced by issue #32 and confirms the PR trigger and the fixed workflow/job identity.

### Main push

Run 29755431748 was triggered by a `push` to `main` for merge commit `056734be99facf84369fc53484c8a81332f49dd8`. Its single `Monorepo tests` job (88396441527) completed successfully on 2026-07-20. This confirms the `push` trigger uses the same workflow identity and command contract as the PR path.

The preceding implementation verification recorded successful `npm ci`, Linux dependency preparation, Chromium preparation, test discovery (10 CSV Gantt Viewer and 22 Markdown Editor tests), and all 32 Playwright tests for the PR run. The main-push run completed the same single job successfully; GitHub's public API does not expose the private step log body used to repeat individual command output here.

## 6. Manual, failure, cancellation, and rerun procedures

The following procedures are intentionally retained for a maintainer with repository write access. They must use a temporary branch and must be reverted before the final PR head.

1. **Manual run:** Actions → `Pocketly CI` → Run workflow → select `main`. Confirm event `workflow_dispatch`, run/job success, and 32 tests. Because the concurrency group includes `github.event_name`, this run must not cancel a `push` run.
2. **Failure:** On the issue PR branch, temporarily replace one workflow command with a deterministic non-zero command. Push it, verify the named step, command, exit code, and skipped downstream steps in PR Checks and logs, then revert it and confirm the final PR run succeeds.
3. **Cancellation:** Push a temporary commit that adds a bounded wait step, wait for it to become `in_progress`, then push a second commit. Confirm the old pull-request run is `cancelled`, the new one starts, and the final diff has no wait step.
4. **Rerun:** Select the failed or cancelled run in Actions and rerun it. Record the increased attempt number and per-attempt logs. Do not confuse that rerun with the run generated by the reverting commit.

## 7. Failure visibility findings and limitations

The workflow gives each contract boundary a named step: `Install dependencies`, `Prepare Linux OS dependencies`, `Prepare Chromium`, `List tests`, and `Run tests`. Since it has no `continue-on-error`, a failure in any one of those steps fails the job and prevents later ordinary steps from running. The GitHub Actions UI/logs are therefore designed to reveal the failing step, invoked command, exit code, and standard error.

This environment could inspect completed run and job metadata but could not access authenticated Actions operations or create a temporary remote branch. Consequently, actual failure stderr, web-server startup errors, assertion errors, timeout/cancellation UI, and rerun-attempt logs remain **attempted but blocked**, not successful verification.

## 8. Artifact and report decision

**Decision: do not add an artifact or report in this issue.** The workflow produces no explicit HTML report, trace, screenshot, video, or other durable output. Adding an upload step without a demonstrated producer would create empty or low-value artifacts. The named step logs are the primary diagnostic surface and are sufficient for normal command-boundary triage. If a future authenticated failure reproduction demonstrates missing diagnostic information, create a separately scoped issue to define the producer, failure-only upload condition, retention, and `if-no-files-found` behavior.

## 9. Blocked and not-run items

No scenario is reported as passed merely because it was attempted. Manual dispatch and rerun were explicitly attempted through GitHub's REST endpoints and blocked by HTTP 403. Failure and cancellation were blocked before execution because this checkout has no Git remote or write credential. No unattempted item is represented as a success.

## 10. Lv3-D handoff

Lv3-D should use **`Pocketly CI / Monorepo tests`** as the required-check candidate. Before configuring branch protection or a ruleset, a repository administrator should:

1. Confirm this exact label in the PR Checks UI for a current main-targeting PR.
2. Perform the manual-dispatch, deterministic-failure, cancellation, and rerun procedures above with write access.
3. Record the resulting run URLs, job IDs, commit SHAs, and attempt numbers, then confirm the final PR head is successful.
4. Add the check only after the label is confirmed stable and the outstanding operational evidence is collected.

The observed PR and main-push success paths establish that the workflow executes under the expected identity; the blocked authenticated operations are the remaining operational limitation for this environment.
