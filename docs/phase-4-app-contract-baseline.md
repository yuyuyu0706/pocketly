# Phase 4 Pocketly App Contract completion baseline

## 1. Purpose and scope

This document is the historical completion record for Phase 4 / Lv3-E, Issue [#47](https://github.com/yuyuyu0706/pocketly/issues/47). It records the Phase 4 completion decision, the evidence integrated from Lv3-A through Lv3-D, unresolved findings, and the handoff boundary for later work.

It is **not** the current App Contract, a fresh capability inventory, or a new conformance evaluation. The current contract remains [`pocketly-app-contract.md`](pocketly-app-contract.md), and future repository facts and evaluations must be read from their owning sources. This documentation-only baseline does not remediate an app, alter a requirement, create an exception, change CI or Pages, or create a shared implementation.

## 2. Completion decision

**Decision: completed with recorded follow-up items.**

Phase 4 is complete because it produced and connected all four intended layers:

1. the current capabilities of the four official apps were inventoried without turning differences into requirements;
2. a current App Contract was defined without requiring implementation uniformity;
3. all four apps were evaluated using explicit requirement statuses and reproducible evidence;
4. an onboarding/change checklist now turns the contract into an execution and evidence route.

Completion does not mean that all four apps are `compliant`. It means the contract and its operating path exist, the point-in-time findings remain visible, and every unresolved class has an owner boundary, a review trigger, and a separate-Issue decision. A remaining `non-compliant` or `unconfirmed` result does not by itself make this contract-definition phase incomplete, and this baseline does not relabel or silently resolve one.

The decision criteria were therefore: complete source-of-truth responsibilities; a fixed current contract; a four-app verification result; an executable change guide; preserved evidence vocabulary; explicit ownership and re-entry conditions for unresolved work; and an explicit Phase 5 decision. Zero conformance findings, Phase 3 repository-settings operations, and app remediation were not Phase 4 completion criteria.

## 3. Phase 4 timeline and integration evidence

| Work unit | Issue / PR | Final head | Merge commit | Principal result | Final-head Actions evidence |
| --- | --- | --- | --- | --- | --- |
| Lv3-A | [#39](https://github.com/yuyuyu0706/pocketly/issues/39) / [PR #40](https://github.com/yuyuyu0706/pocketly/pull/40) | `2c7b2a91a7e6cf6cb1c3ce70603acfd7fd370152` | `bcd89a193d288344065820eb4052dbf9f9350609` | [`pocketly-app-capability-matrix.md`](pocketly-app-capability-matrix.md) | Run [30138192984](https://github.com/yuyuyu0706/pocketly/actions/runs/30138192984), job [89626188136](https://github.com/yuyuyu0706/pocketly/actions/runs/30138192984/job/89626188136): `success` |
| Lv3-B | [#41](https://github.com/yuyuyu0706/pocketly/issues/41) / [PR #42](https://github.com/yuyuyu0706/pocketly/pull/42) | `2b19f75b6d9ccfda0b3b69d1b72930a17cea2e49` | `c6c04e88ac7d12fad0ea949c85a19e954590be93` | [`pocketly-app-contract.md`](pocketly-app-contract.md) | Run [30148212769](https://github.com/yuyuyu0706/pocketly/actions/runs/30148212769), job [89653948957](https://github.com/yuyuyu0706/pocketly/actions/runs/30148212769/job/89653948957): `success` |
| Lv3-C | [#43](https://github.com/yuyuyu0706/pocketly/issues/43) / [PR #44](https://github.com/yuyuyu0706/pocketly/pull/44) | `afb9ad7968bd02d175805872105242be69cf88af` | `84f64eb9744f9f02a649f67914a5b685da0d0a86` | [`pocketly-app-conformance-report.md`](pocketly-app-conformance-report.md) | Run [30153934915](https://github.com/yuyuyu0706/pocketly/actions/runs/30153934915), job [89668832901](https://github.com/yuyuyu0706/pocketly/actions/runs/30153934915/job/89668832901): `success` |
| Lv3-D | [#45](https://github.com/yuyuyu0706/pocketly/issues/45) / [PR #46](https://github.com/yuyuyu0706/pocketly/pull/46) | `b9a73c13ad89987fee634abed0785e22af327801` | `47ba1048e8d1dd365ab813b63e5b380aa749c63c` | [`pocketly-app-onboarding-checklist.md`](pocketly-app-onboarding-checklist.md) | Run [30162345641](https://github.com/yuyuyu0706/pocketly/actions/runs/30162345641), job [89689600474](https://github.com/yuyuyu0706/pocketly/actions/runs/30162345641/job/89689600474): `success` |

These Actions results establish the final remote-head result for each merged Phase 4 input. They are distinct from the local command evidence recorded by the work unit that produced each document.

In particular, Lv3-C recorded `npm test` as **failed** locally: CSV Gantt Viewer passed 10/10 tests, while Markdown Editor passed 16 and failed 6. PR #44's final-head Actions job later concluded `success`. Both records are retained because they describe different executions and environments; the later Actions result does not rewrite the local result or establish its cause.

## 4. Source-of-truth responsibilities

| Layer | Owner / source | Responsibility | This baseline does not do |
| --- | --- | --- | --- |
| Current fact | repository files and [`pocketly-app-capability-matrix.md`](pocketly-app-capability-matrix.md) | Records observed app capabilities and differences at its stated base. | Keep future facts current or turn an observation into a requirement. |
| Contract requirement | [`pocketly-app-contract.md`](pocketly-app-contract.md) | Defines the current rules for official-app participation and relevant changes. | Replace, amend, or freeze the current contract. |
| Verification result | [`pocketly-app-conformance-report.md`](pocketly-app-conformance-report.md) | Records the point-in-time evaluation against the contract and its evidence. | Reevaluate later app changes or erase historical findings. |
| Execution / evidence guide | [`pocketly-app-onboarding-checklist.md`](pocketly-app-onboarding-checklist.md) | Converts the contract into routes, checks, status vocabulary, and copyable evidence records. | Make a checked box proof of command success or compliance. |
| Historical completion | this document | Records why Phase 4 completed and where unresolved work was handed off. | Become a fifth current requirements source. |

Phase 2 continues to own package/workspace execution details through [`phase-2-package-execution-contract.md`](phase-2-package-execution-contract.md). Phase 3 continues to own CI behavior through [`phase-3-ci-contract.md`](phase-3-ci-contract.md). A conflict or desired behavior change must be handled by a separately scoped Issue against the document and implementation that own that area; this baseline has no precedence over them.

## 5. Fixed App Contract decisions

The following decisions were fixed for the current contract at Phase 4 completion:

- official apps remain explicit, private npm workspaces under lowercase kebab-case `apps/<app-name>/` directories, with matching package names, app-owned `index.html`, and a relative root Pages link;
- root owns Node/npm policy, installation, the sole `package-lock.json`, and the shared static development server, while each app owns the dependencies and real scripts it uses;
- browser-only, npm, CDN, vendored/local-minified, and local protected-asset models are valid capability choices, but adopted assets require traceable provenance, license, maintenance, update, and delivery records without guessed facts;
- all apps use the root `npm ci` preparation route and `npm run dev --workspace=<package-name>` at `http://127.0.0.1:8000/`; `file://` and alternative servers are not standard entries;
- automated tests are optional. Test owners keep their framework, config, dependencies, and real scripts app-local; test-less apps must not add fake passing tests and must document reproducible manual verification;
- root CI orchestration must reach real test owners, propagate failures, and skip test-less workspaces through `--if-present`; required-check settings remain outside App Contract conformance;
- repository assets and root navigation remain safe under `/pocketly/`, and CDN consumers document network/offline assumptions;
- each app README supplies the nine minimum maintenance fields, while incomplete facts remain `unconfirmed` rather than implicit exceptions;
- app, contract, and root platform/CI/Pages changes are classified and split unless a recorded reason makes mixed scope necessary;
- an exception requires every section 13 field and a review trigger; an optional capability difference needs no exception;
- commonization is optional and must pass all four `COM-01` conditions. Similarity or hypothetical future use is insufficient.

Changing any of these decisions requires a new Issue scoped to the current App Contract and, where applicable, the inherited Phase 2 or Phase 3 owner. Historical text in this baseline must not be edited to simulate a current-contract change.

## 6. Existing four-app conformance summary

The verification base was commit `58c61df0ecf5307ddec72c7db0272006690aabdc`, evaluated on 2026-07-25 UTC. The integrated result was `non-compliant` for all four apps, with no invoked contract exception:

| App | Stable compliant areas | Recorded non-compliance / unconfirmed summary |
| --- | --- | --- |
| Avro Viewer | Identity, package, development, CI, and Pages; test-less is a valid capability. | Vendored avsc owner/update procedure and local-asset maintenance records are incomplete; exact vendoring history is `unconfirmed`; README lacks explicit test absence and reproducible manual verification. |
| CSV Gantt Viewer | Identity, package, development, Playwright, CI, and Pages; the recorded local CSV suite passed 10/10. | html2canvas provenance/version/license/owner/update/delivery and local-asset records are incomplete; repository-specific introduction history is `unconfirmed`; README minimum maintenance fields are incomplete. |
| Markdown Editor | Identity, package, development, Playwright participation, CI propagation, and Pages entry. | CDN and protected-asset documentation is incomplete; resolved CDN versions are `unconfirmed`; network/offline requirements are incomplete; the recorded local suite passed 16 and failed 6. |
| reStructuredText Editor | Identity, package, development, CI, and Pages; test-less is a valid capability. | CDN/local-asset provenance, license, owner, update, and network records are incomplete; repository-specific attribution history is `unconfirmed`; README lacks explicit test absence and reproducible manual verification. |

`AST-01`, `AST-02`, and `DOC-01` were non-compliant across all four apps. `TST-01` was additionally non-compliant for the two test-less apps because of documentation, not because automated tests were absent. `PAG-02` was non-compliant for the two CDN-consuming apps. Full requirement-level evidence and the authoritative wording of records `NC-01` through `NC-05` remain in the conformance report.

## 7. Verification and execution evidence boundary

An execution result answers what happened when a command or remote job ran; a requirement status answers whether the cited repository and execution evidence satisfies a contract rule. They must not be substituted for each other.

- `passed`, `attempted but blocked`, `failed`, and `not run` are command/check results.
- `compliant`, `non-compliant`, `not applicable`, `exception`, and `unconfirmed` are conformance statuses.
- A passing command can coexist with a non-compliant documentation requirement.
- A failed app test can coexist with compliant root failure propagation.
- An intentional test-less skip is neither a passing test nor a defect.
- Local command evidence and final-head GitHub Actions evidence identify their environment, revision, and result separately.

Future changes use the onboarding checklist and record both kinds of evidence in the Issue or PR. They do not rerun Phase 4 by modifying this historical baseline.

## 8. Unresolved records and follow-up decisions

| Record / area | Impact | Owner / maintenance boundary | Review trigger | Follow-up Issue decision |
| --- | --- | --- | --- | --- |
| AV `NC-01`, `TST-01`, `DOC-01` | avsc updates are not reproducible from the current record; test-less/manual evidence and README maintenance details are incomplete. | `apps/avro-viewer/` | avsc, protected asset, README, or verification-route change. | Deferred, not waived. Open an Avro Viewer app-scoped Issue when remediation is prioritized; preserve vendor and license assets. |
| CSV `NC-02`, `DOC-01` | html2canvas licensing/update decisions and protected-asset maintenance cannot be reproduced fully. | `apps/csv-gantt-viewer/` | PNG export, html2canvas, protected asset, or README change. | A separate CSV Gantt Viewer Issue is required before remediation; investigate unconfirmed history rather than infer it. |
| MD `NC-03`, `PAG-02`, `DOC-01` | CDN drift/network availability and incomplete maintenance records can affect rendering. | `apps/markdown-editor/` | marked/mermaid URL, rendering, protected asset, or README change. | A separate Markdown Editor Issue is required for documentation/pinning decisions. The 6 local test failures require a distinct diagnosis Issue and are not assigned a cause here. |
| RST `NC-04`, `PAG-02`, `TST-01`, `DOC-01` | CDN/version/network and manual-verification decisions cannot be reproduced fully. | `apps/restructuredtext-editor/` | import map, CDN, protected asset, README, or verification-route change. | A separate reStructuredText Editor Issue is required before remediation; retain unresolved history as `unconfirmed`. |
| All-app local assets `NC-05` | Rights, attribution, and replacement boundaries are unclear. | Each affected `apps/<name>/`; no new shared owner. | Any local icon, sample, template, font, config asset, or corresponding README change. | Prefer one app-scoped Issue per remediation. Similar gaps do not authorize a cross-app bulk change. |
| No complete exception records | No waiver or compensating verification exists. | The app/requirement owner that proposes an exception. | A Required or Conditionally required item cannot be met immediately. | Create and review a complete exception record under contract section 13; do not reinterpret current findings as exceptions. |

No follow-up Issue is opened automatically by this baseline. Deferral means that the finding stays visible until its trigger or prioritization creates an Issue; it does not mean resolved, accepted forever, or out of contract.

## 9. Phase 3 deferred operations boundary

Phase 3 established the CI command and workflow contract, but authenticated operational work remains deferred. [`phase-3-ci-verification.md`](phase-3-ci-verification.md) retains blocked manual-dispatch, deterministic-failure visibility, cancellation, rerun, and artifact-decision evidence. [`phase-3-ci-operations.md`](phase-3-ci-operations.md) retains authenticated branch-protection/ruleset inspection, confirmation of the actual Checks UI label, required-check configuration, merge blocking/recovery evidence, bypass behavior, and rollback evidence.

Those items remain owned by Phase 3 parent [#27](https://github.com/yuyuyu0706/pocketly/issues/27) and its operational work including [#32](https://github.com/yuyuyu0706/pocketly/issues/32). They are neither Phase 4 outputs nor Phase 4 completion prerequisites. This baseline does not claim that branch protection, a ruleset, or required-check enforcement is active, and it does not close or complete those operations.

## 10. Phase 5 handoff decision

**Decision: no Phase 5 commonization candidate is handed off at Phase 4 completion. Continue observing needs in app-scoped work.**

| Observed area | Two-app repeated burden | Shared ownership beats app-local ownership | Stable interface / lifecycle | Coupling, release, test, CI, Pages impact explained | Decision |
| --- | --- | --- | --- | --- | --- |
| Runtime dependencies/assets | Documentation gaps repeat, but avsc vendoring, local html2canvas, and the two CDN models have materially different lifecycles. | Not demonstrated. The current owner is each app. | Not demonstrated. | Not demonstrated. | Not a candidate. Keep app-scoped. |
| Protected local assets | Rights/owner records are incomplete in multiple apps. | Not demonstrated; facts and rights are asset- and app-specific. | Not demonstrated. | Not demonstrated. | Not a candidate. Use app-scoped documentation work. |
| Test configuration | CSV and MD both use Playwright. | Not demonstrated; the contract deliberately retains app ownership. | Similar configuration alone is insufficient evidence. | A shared change's coupling and CI effects have not been justified. | Not a candidate; do not commonize Playwright config. |
| Checklist/template/automation | A single onboarding checklist now exists, but operating history has not demonstrated repeated manual friction. | Not demonstrated. | Too early to establish a stable automation interface. | Generator/checker/workflow and CI/Pages effects have not been designed. | Observation only; evaluate under a future Issue after usage evidence. |

Thus no proposed area satisfies all four `COM-01` conditions. Phase 5 is optional: a later candidate may re-enter only when at least two apps demonstrate an actual repeated responsibility, common ownership has greater value, an interface and lifecycle are stable, and all coupling/delivery effects can be explained in a dedicated Issue. This decision prohibits neither future evidence collection nor justified commonization; it prohibits treating Phase 4 similarity as prior authorization for `packages/`, `shared/`, or `common/`.

## 11. Unchanged areas and prohibited inference

Phase 4 completion did not:

- change an application, app README, dependency, protected asset, vendor/license file, package, lockfile, root server, CI workflow, Pages workflow, or repository setting;
- change the App Contract requirements or reevaluate the capability matrix/conformance report;
- fix or diagnose the Markdown Editor local failures;
- grant an exception or convert `unconfirmed` into a known fact;
- establish that every app is compliant, that every current command passes, or that final-head CI will always pass;
- require apps to adopt the same dependency, runtime, test, UI, or architecture model;
- create a Phase 5 implementation commitment;
- complete Phase 3 deferred operations.

Future readers must use the current owning document and repository state rather than inferring current conformance from this historical completion decision.

## 12. Parent Lv2 / Lv1 handoff

After the PR for Issue #47 is merged, update the parent Issue bodies as management records rather than changing them in this PR:

### Parent Lv2 [#38](https://github.com/yuyuyu0706/pocketly/issues/38)

- record Lv3-E Issue/PR, final PR head, merge commit, and final-head `Pocketly CI / Monorepo tests` run/job result;
- mark Phase 4 **completed with recorded follow-up items** and link this baseline as the historical completion source;
- retain the four-app `non-compliant` result, unresolved `unconfirmed` facts, app-scoped remediation boundary, and Phase 3 deferred-operations boundary;
- record the explicit Phase 5 decision: no candidate at completion, observation continues under `COM-01` re-entry conditions.

### Parent Lv1 [#1](https://github.com/yuyuyu0706/pocketly/issues/1)

- mark the Phase 4 outcome as completion of contract definition, conformance recording, and the onboarding/change route—not universal app compliance;
- link parent #38 and this baseline, and retain Phase 3 operations under their existing ownership;
- record that Phase 5 has no current commonization candidate and begins only if later evidence meets all four `COM-01` conditions.

The parent updates occur after merge so they can cite the actual PR, merge commit, and final-head CI evidence. Until those values exist, this baseline does not fabricate placeholders for them.
