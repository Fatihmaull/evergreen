# W3-D15-02 — two-tier engine thresholds plan

**Status:** planned 2026-09-12; Rakha authorized implementation on 2026-09-13 after the publication refresh. Transaction execution remains outside scope.

**Goal:** the engine visibly distinguishes early warning from action urgency,
with validated per-contract overrides and one resolved policy feeding assessment,
decisions and liveness.

**Architecture:** add one optional warning field to the current config contract;
resolve it into the existing HealthThresholds type in core; expose tier-aware
assessments from the existing engine. Reuse #120's per-key policy, target and
liveness corrections. Preserve the existing single-threshold CLI interface.

**Stack:** current TypeScript/Node 24, pnpm 11.25.0 and Vitest. No new dependencies.

**Execution:** sequential after plan approval, following plan → implementation →
internal review → publish → Fatih review/merge. Use the existing TDD and execution
workflow. No sub-agent needed. Work starts as soon as dependencies permit, not on
an old day-block date; September 18 remains the Stage 1 hard gate.

## 1. Verified baseline and ownership

- Main is cc0fb16. PR #120 is open at dda2530, with no Fatih feedback at this
  planning refresh. That correction is the required implementation base.
- D15-02 is Pending/Rakha; D15-02b is Pending/Shared in repo and Notion.
- HealthThresholds and constants 120960/17280 exist in core/health.ts. However,
  assessEntry currently accepts one threshold; EngineRun has no health report.
  The CLI also uses its existing single-threshold interface. This plan does not
  claim two-tier rendering is already active merely because the type exists.
- Config currently has bumpWhenRemainingLedgersBelow and extendToLedgers. #120
  already merges overrides/repeated registrations, requires payer/target agreement,
  preserves target semantics and supplies effective action thresholds to liveness.
  Keep those behaviors and tests.
- B's current proof is detect/refuse/expire under #114; A supplies the separate
  unattended-save proof. No B/C/shared guard or operational config is changed here.

Proposed implementation branch: `feat/W3-D15-02-thresholds`. If #120 has merged,
start from refreshed main and verify its content. If still open, stack the branch
on #120 rather than copying its changes. Any child PR initially targets the parent
branch and must be retargeted to main before the parent is deleted. Publish the
WIP branch when implementation starts; preserve the separate #120 review scope.

## 2. Chosen config direction and alternatives

**Recommended: additive warning field, existing action field retained.**

```json
{
  "defaults": {
    "warnBelowLedgers": 120960,
    "bumpWhenRemainingLedgersBelow": 17280,
    "extendToLedgers": 518400
  }
}
```

This is a fragment, not a complete runnable config. A contract can override either
warning or action through its existing thresholds object, for example warning
60480 and action 8640. extendToLedgers remains an absolute remaining-TTL target.

| JSON input | Resolved HealthThresholds |
| --- | --- |
| warnBelowLedgers | warnBelowLedgers |
| bumpWhenRemainingLedgersBelow | criticalBelowLedgers |

Do not introduce a second JSON action field named criticalBelowLedgers; two
independently writable action values would require precedence and permit conflict.
Reject that alias with an actionable config error rather than silently ignoring it.

Alternatives considered: replacing BumpThresholds with a new nested schema creates
unnecessary migration work; keeping a fixed warning constant only in the renderer
cannot support per-contract warning overrides. The additive field meets the task
without either cost.

### Exact defaults and inheritance

For each registration:

1. Action = contract override, otherwise the existing required global action value.
2. Explicit warning = contract warning override, otherwise global warning if set.
3. If neither warning exists, derive warning as max(DEFAULT_WARN_LEDGERS, action).
4. If an explicit warning exists, require warning >= action. Reject an inverted
   pair with the contract/default path; never silently widen an explicit value.
5. Both horizons must be non-negative safe integers. Equality is valid and means
   there is no separate warning-only interval. Zero retains inclusive semantics.

The loader preserves omission of warnBelowLedgers rather than materializing a
value that would erase whether it was explicitly configured. A legacy config
with an action override of 1500000 and no warning therefore remains valid, with
warning derived as 1500000. If the global warning is explicitly 120960, that same
contract must explicitly raise its warning too. Effective values are visible in
output, including a warning when omission caused the default warning to widen.

Validate the two fields after merging each override. Reject malformed thresholds
objects and unknown behavior keys inside defaults/contract.thresholds, including
misspellings of warnBelowLedgers. Continue allowing underscore-prefixed notes.
This is scoped validation of threshold objects, not a strict-schema rewrite of
all existing config fields. Target validation/capping remains the #120 behavior.

## 3. Health, decisions and liveness are distinct outputs

For an ordinary, singly consumed archived-storage entry with valid metadata:

| Remaining ledgers | TTL assessment | Decision if unprotected/policy valid | Liveness in decide-only run |
| --- | --- | --- | --- |
| 120961 | healthy | skip | quiet |
| 120960 | warning | skip | quiet |
| 17281 | warning | skip | quiet |
| 17280 | critical | extend candidate | alarm: no confirmed action |
| 0 | critical; still live | extend candidate if valid target | alarm |
| -1 | critical; expired | skip, restoration guidance | alarm |
| unavailable | unknown | skip, investigation guidance | alarm |

Use needsAction for both threshold boundaries and hasExpired for expiry. No
handwritten observation comparisons, day-based trigger, or assumed cadence.
Days/hours are display estimates only, using MEASURED_TESTNET_CADENCE if shown.
The constants are established policy margins, not guarantees of scheduler uptime.

**Preserve blast-radius and lifecycle severity.** Existing assessEntry can grade
shared/temporary data critical even in the warning-only interval. Keep that useful
impact information, but do not use health === critical to authorize an extension.
For known live entries, needsAction reflects the action/critical threshold only.
Reasons/output must explicitly say when an entry is above the action threshold,
even if sharing/deletion risk raises its display severity.

For expired observations, needsAction can still mean remedial action is needed;
the evaluator's expiry guard prevents extendTTL. Unknown TTL remains unknown.
Neither an entry color nor an exit code authorizes a transaction.

### Shared keys and repeated registrations

Resolve a valid HealthThresholds pair for every registration first. Per unique
key, use max(warning horizons) and max(action horizons) across all known consumers
and repeated rows. These maxima describe the union of notification/action needs.
They do not change #120's independent payer/target agreement checks.

Feed that single resolved pair into the entry assessment; derive the liveness
map from its criticalBelowLedgers field. Preserve all consumers, one decision per
key, guard refusals, target cap, conflict refusals and duplicate-policy checks.

Warning-only entries remain visible but do not create bump records or liveness
alarms. Critical, expired and unreadable entries retain the current strict alarm
behavior. Actual email delivery and routing remain D17.

## 4. Proposed API and file changes

Names below are proposed; the helpers are not implemented yet.

| File | Proposed change |
| --- | --- |
| packages/shared-types/src/index.ts | Add optional readonly warnBelowLedgers to BumpThresholds. Existing fields remain required; no new critical alias. |
| packages/shared-types/test/examples.ts, contracts.test.ts | Keep old examples valid; compile/serialize the new optional field; align the editable example config. |
| packages/core/src/health.ts | Add resolveHealthThresholds(defaults, overrides?) returning the existing HealthThresholds; add assessEntryWithThresholds(entry, thresholds) returning EntryAssessment. Reuse assessEntry for sharing/lifecycle metadata and impact grading. Existing assessEntry(entry, number) remains compatible. |
| packages/core/src/config.ts | Parse optional warnings without discarding omission, validate merged pairs and threshold-object keys, report paths and any derived widened warning. |
| packages/core/src/engine.ts | Resolve both horizons in the existing evaluation pass; use critical for action and warning for early assessment. Add EngineRun.health with byEntry assessments and thresholdsByEntry. No BumpDecision shape change. |
| packages/core/src/index.ts | Export new core helpers/types where needed. |
| scripts/engine-run.mjs | Print effective warning/action thresholds and assessment with skip reasons. Warning-only output must be visibly warning, while process exit stays governed by liveness/errors. No new CLI flags, signing or scheduler settings. |
| Core config/health/engine tests; script tests | Boundary, inheritance, compatibility and rendered-run regressions. Offline fixtures by default. |
| evergreen.config.example.json | Demonstrate the optional warning field; keep action/target values and protected subjects unchanged. Do not edit deployed dogfood config. |
| docs/ARCHITECTURE.md and task docs/tracking | Describe config semantics, observable output and limitations accurately. |

Keep resolver and tier assessment in health.ts to avoid an import cycle between a
new policy module and the existing health constants/types. shared-types never
imports core. This change is small but touches a shared contract, so Fatih reviews
that additive field explicitly at publication.

EngineRun.health is additive, JSON-compatible metadata. It does not mutate
ScanResult or fabricate BumpRecord entries. The root script can use it directly;
there is no need to add a second engine package implementation or copy the
CLI formatter. Preserve current script usage and exit behavior.

## 5. Implementation sequence after approval

- [x] Refresh main, #120 feedback and D15-02 ownership before editing. Use the
  correct base; register In progress in repo and Notion, then push WIP immediately.
- [x] Write failing resolver/config tests for the table below. Add the optional
  shared field and implement parsing, inheritance and validation with explicit
  field paths. Keep the compiled legacy config examples valid.
- [x] Write failing tier-assessment tests, then implement the additive helper
  using current predicates and impact/lifecycle assessment. Verify old CLI-facing
  health tests still pass; do not migrate the CLI's flags/exits in this task.
- [x] Extend the existing per-key evaluation pass and EngineRun output. Assert
  warning-only does not extend/alarm and critical uses the exact same policy
  as liveness, including repeated/shared registrations.
- [x] Update the existing script's output. Test its user-visible warning/action
  distinction with fixture runs. If minimal extraction of its formatter is
  needed for offline tests, keep it local to the script; do not invent a new CLI.
- [x] Run focused tests and canonical pnpm check, including shared-type examples
  and unchanged coverage gates. Build and verify the runnable script artifact.
- [x] Perform one separate read-only A validation with a temporary local config:
  warning 2000000, action 17280, target unchanged. It should show early warning
  while producing no extension candidates or liveness alarm at A's current
  observed TTL. Refresh the observation; this is not a transaction or proof A
  replay. Do not change operational config or B/C/shared protection.
- [ ] Internal review and publication remain separate checkpoints. Implementation results and repo/Notion boundary records are updated; Fatih handles review/merge.

### Acceptance matrix

- Legacy config with no warning field preserves its action/target behavior.
- Exact boundaries 120960 and 17280 behave as above; zero stays live.
- A warning-only entry is visible in module output and the script, not merely
  represented by an unused type or constant.
- Warning-only shared/temporary impact severity cannot trigger a bump by color.
- Global/contract warning and action override combinations resolve predictably;
  omitted warnings remain distinguishable from explicit ones.
- Inverted explicit pairs, fractions, negative/unsafe integers, null/string
  threshold objects, misspelled fields and a second critical alias fail clearly.
- Same-policy repeated rows produce one decision. Conflicts in payer/target still
  refuse; different warning/action needs aggregate independently of row order.
- Changing only the warning horizon cannot change the action target or liveness
  threshold. Changing action affects both decision and assertion together.
- Expired/unavailable/protected cases remain safe; no simulated/succeeded records
  or signer/send calls occur in a preview.
- Existing CLI scan interface and exit precedence remain intact.

## 6. D15-02b decision boundary

Temporary-entry reporting is already required and stays active. This task does
not silently accept a permanent auto-bump policy or amend ADR-001.

Proposed separate Shared decision: default auto-bump off, explicit per-contract
opt-in with clear unrecoverable-deletion warning. The runtime's current behavior
must not be described as already implementing that proposal. Settle it with Fatih
before enabling a live D16 path for temporary data; development/tests of the
execution interface can proceed independently with permanent-entry scope.

Use measured numbers accurately: the recorded network minimum was 720 total
ledgers, with 719 remaining at creation; 688 was a sampled remainder, not the
protocol floor. Threshold/cadence consequences and the precise opt-in schema
belong in the D15-02b decision/ADR amendment, not a guessed constant here.

## 7. Review points

Review the additive config choice, omitted-versus-explicit warning behavior,
warning-only output without action, and the bounded file/owner scope. This plan
preserves #120's corrected behavior while adding the early-warning layer needed
by D17. Implementation begins only after Rakha reviews this plan.
