# Phase 3 CI Required-Check Operations

## 1. Purpose and scope

This document records the repository-settings investigation for Phase 3 / Lv3-D, issue #34.  The intended control is a required check for the existing `Pocketly CI` workflow on pull requests targeting `main`.  This change does not alter application code, package metadata, lockfiles, workflow commands, GitHub Pages, or unrelated repository settings.

The parent work is Phase 3 / Lv2 issue #27.  The CI execution contract remains [phase-3-ci-contract.md](phase-3-ci-contract.md), and the earlier verification evidence remains [phase-3-ci-verification.md](phase-3-ci-verification.md).

## 2. Preconditions from Lv3-C

Issue #34 has an explicit gate: required-status-check configuration must not be applied until the outstanding Lv3-C operational evidence is collected.  The current evidence is therefore recorded without treating attempted work as a successful check.

| Required precondition | Current status | Evidence / consequence |
| --- | --- | --- |
| PR success | passed | [Run 29754096438](https://github.com/yuyuyu0706/pocketly/actions/runs/29754096438) completed successfully for a pull request. |
| Main push success | passed | [Run 29755431748](https://github.com/yuyuyu0706/pocketly/actions/runs/29755431748) completed successfully for a push to `main`. |
| Failure reproduction | attempted but blocked | The temporary deterministic failure could not be pushed without GitHub write credentials; no failed Actions run exists. |
| Failure visibility | attempted but blocked | No failed check UI or authenticated step log could be inspected because no failed run was created. |
| Final head success | attempted but blocked | A final head for this issue PR cannot be observed from this checkout, which has no Git remote or GitHub credential. |
| Actual PR Checks UI label | attempted but blocked | Public run/job metadata establishes the candidate but a maintainer must confirm the label in the PR Checks UI. |
| Artifact decision from actual failure | attempted but blocked | No real failed-run output exists to support the decision. |
| Manual dispatch, cancellation, and rerun | attempted but blocked | The unauthenticated dispatch and rerun API attempts returned HTTP 403; cancellation requires pushed commits. |

Because the gate is not satisfied, **no branch protection or ruleset was created or changed** by this work.  Issue #34 must remain open until an authorized maintainer completes the gate and the operational verification below.

## 3. Workflow and required-check identity

| Item | Value |
| --- | --- |
| Workflow file | `.github/workflows/ci.yml` |
| Workflow display name | `Pocketly CI` |
| Job ID | `test` |
| Job display name | `Monorepo tests` |
| Required-check candidate | `Pocketly CI / Monorepo tests` |
| Target branch | `main` |

The candidate is derived from the workflow and job display names.  It is not yet a confirmed PR Checks UI label, so it must not be configured from this document alone.

## 4. Repository settings investigation

The following read-only public API observations were made on 2026-07-24.  They do not establish settings hidden from unauthenticated callers.

| Setting to inspect | Result | Status |
| --- | --- | --- |
| Repository default branch | Public repository metadata identifies `main` as the default branch. | passed |
| Active repository rulesets | `GET /repos/yuyuyu0706/pocketly/rulesets` returned HTTP 200 with `[]`. | passed for publicly visible rulesets |
| `main` branch protection | `GET /repos/yuyuyu0706/pocketly/branches/main/protection` returned HTTP 401 without credentials. | attempted but blocked |
| Required pull-request reviews | Included in protected-branch configuration; not readable unauthenticated. | attempted but blocked |
| Required status checks | Included in protected-branch configuration; not readable unauthenticated. | attempted but blocked |
| Administrator enforcement and bypass actors | Not readable unauthenticated. | attempted but blocked |
| Force-push, deletion, and merge-queue controls | Not readable unauthenticated. | attempted but blocked |

No conclusion is made that branch protection is absent: an HTTP 401 response prevents that conclusion.  The only confirmed settings observation is that the public rulesets list was empty at the time of inspection.

## 5. Selected control and settings changed

**Selected control: none yet.**  The issue permits either branch protection or a repository ruleset, provided it is available and does not conflict with existing settings.  Selecting either before reading the authenticated current state would risk overwriting or duplicating existing protection.

**Settings changed: none.**  In particular, this work did not add a required status check, require pull-request reviews, alter administrator applicability, change bypass actors, alter force-push/deletion behavior, or enable a merge queue.

## 6. Authorized completion procedure

An organization/repository administrator should complete these steps from GitHub Settings or an authenticated GitHub CLI/API session.  Preserve every pre-existing setting unless the exact required check below is the minimal necessary change.

1. Read and record the full `main` branch-protection configuration and every active ruleset, including review requirements, required checks, administrator applicability, bypass actors, force-push/deletion rules, and merge queue settings.
2. Create or update a current pull request targeting `main`, then confirm the exact PR Checks UI label for the single job.  Record its run URL, job ID, PR number, head SHA, and the displayed label.
3. Complete the deterministic failure, failure-log, cancellation, rerun, and recovery procedures in [phase-3-ci-verification.md](phase-3-ci-verification.md).  Record the failed step, command, exit code, recovery run, and artifact/report decision.
4. Only after steps 1–3 pass, choose the existing protection mechanism with the smallest change: extend existing `main` branch protection if it exists; otherwise use an applicable `main` ruleset if supported and non-conflicting.
5. Require pull requests for changes to `main` only if that protection is not already in force; do not add review counts, CODEOWNERS, conversation resolution, signed commits, linear history, merge queue, deployment approval, force-push/deletion changes, or administrator changes.
6. Add the **confirmed** displayed check label (expected candidate: `Pocketly CI / Monorepo tests`) as required, and require it to pass before merge.
7. On a dedicated verification PR, demonstrate and record: pending/running check blocks merge; failed check blocks merge and links to the failed logs; reverted/recovered check permits merge.  Remove all temporary failure/wait changes before the final head.
8. Record direct-push, owner/administrator, GitHub App, and other bypass behavior without changing it unless separately authorized.

## 7. Required operational evidence

The authorized operator must append the following before treating the control as complete:

| Scenario | Required result | Current status |
| --- | --- | --- |
| Pending / running | The required check appears on a `main` PR and merge is blocked. | not run |
| Failed | The required check fails, merge is blocked, and the failing step/log is reachable. | not run |
| Recovery / success | After reverting the temporary failure, a new successful required check permits merge. | not run |
| Direct push / bypass | Current behavior for direct push, administrators, owners, and GitHub Apps is documented. | not run |
| Final head | The final PR head has a successful CI run and contains no temporary failure or wait command. | not run |

## 8. Rollback procedure

Before changing settings, export or capture the exact protection/ruleset configuration.  If the added required check prevents normal pull-request operation:

1. An administrator restores the captured configuration for `main` (or removes only the newly added required check from the selected control).
2. Record the incident, target branch, check label, affected PR/run URL, observed cause, original settings, restored settings, and retry condition.
3. Do not disable unrelated protections, broaden bypass access, or remove review requirements merely to recover merge access.
4. Retry only after the actual PR Checks UI label and successful/failure operational evidence have been reconfirmed.

## 9. Current limitations and Lv3-E handoff

This checkout has no configured Git remote and no GitHub write credential.  It cannot read authenticated branch protection, change repository settings, push a verification branch, dispatch/rerun Actions, or inspect the PR Checks UI.  The required-check candidate and public success evidence are useful inputs, but they are not a completed required-check deployment.

Lv3-E should receive the selected control, authenticated before/after settings, target branch, confirmed check label, pending/failed/success evidence, direct-push/bypass/administrator findings, rollback record, final run URL/ID and SHA, and any remaining limitation.  Until then, no Phase 3 completion baseline should state that required-check enforcement is active.
