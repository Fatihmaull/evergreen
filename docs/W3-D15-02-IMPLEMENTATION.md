# W3-D15-02 — two-tier engine thresholds

Status: implemented on `feat/W3-D15-02-thresholds`, awaiting internal review.
Implementation commit: c32918e. Base: #120 head dda2530. #120 was still open at implementation start; these changes
are isolated on a child branch and do not alter that PR. No new PR or merge yet.

## Result

The engine now separates early warning from action urgency. Existing config action
and target fields retain their meaning; one optional warning field is added.

```json
{
  "defaults": {
    "warnBelowLedgers": 120960,
    "bumpWhenRemainingLedgersBelow": 17280,
    "extendToLedgers": 518400
  }
}
```

This is a config fragment. Put per-contract overrides in the existing thresholds
object. The new field is optional, so valid old configs continue to work.

- Action comes from the contract override or global action field.
- Warning comes from the contract override, then explicit global warning.
- When warning is omitted at both levels, core derives max(120960, action).
  The loader retains omission and reports any derived widening.
- Explicit warning must be at least the effective action threshold. Inverted
  explicit pairs are rejected, never silently changed. Equal horizons and zero
  remain valid; both horizons must be non-negative safe integers.
- Unknown threshold keys, an alternative criticalBelowLedgers JSON alias, and
  malformed threshold objects fail with their field path. `_` notes remain valid.

For an ordinary singly consumed persistent/instance entry, the default warning
boundary is 120960 and the action boundary is 17280, both inclusive. An entry at
50000 reports warning, skips extension and does not alarm liveness. At 17280 it
needs action, subject to the same payer/target/guard checks as #120. Zero remains
live; expired and unavailable observations retain their existing handling.

Shared/temporary data may have critical *impact* during the warning-only interval.
That does not authorize a bump. The output states action-needed=no and an explicit
above-action-threshold reason. Liveness uses only the resolved action horizon;
health color is never a spending decision.

## API and integration

- BumpThresholds adds optional warnBelowLedgers; no existing fields were renamed.
- resolveHealthThresholds(defaults, overrides?) returns the existing HealthThresholds.
- assessEntryWithThresholds(entry, thresholds) returns EntryAssessment, preserving
  sharing/lifecycle metadata and grading action urgency. The old assessEntry(entry,
  number) remains unchanged for CLI callers.
- EngineRun adds health.byEntry and health.thresholdsByEntry. One evaluation pass
  resolves both horizons across every shared consumer and repeated registration;
  maxima define warning/action needs while payer/target agreement stays separate.
- The existing script uses a small pure engine-output formatter to show the grade,
  effective horizons, actual candidate count, and original decision/guard reasons.
  Its exit handling, network check and decide-only behavior remain unchanged.
- The editable example includes the warning field. Operational dogfood config,
  B/C/shared guards and workflow files are unchanged. No dependency was added.

The shared-type suite compiles a legacy config without the warning field and the
updated example with it. The CLI's single-threshold interface and exit precedence
are retained; this task does not silently migrate CLI behavior.

## Verification

- 29 resolver/assessment cases, 17 new config cases, 9 engine integration cases
  and 4 formatter cases. All default unit tests are offline.
- Full pnpm check: **634 tests = 552 Vitest + 82 Node**, unchanged coverage gates.
- Three deliberate regressions failed behavioral assertions: hidden warning
  (4 selected failures), warning used as action (3), silent explicit-warning
  widening (2). Sources restored; focused config/health/engine suite passed 76.
- Read-only Testnet A validation: warning 2000000, action 17280, existing target
  518400. At ledger 4648013, A instance remaining 1378578 and code remaining
  642816; both warning, neither actionable, no liveness alarm.
- The real built runner printed effective horizons and action-needed=no and
  returned exit 0. [Evidence and capture boundaries](evidence/2026-09-13-engine-thresholds/README.md).

Sandbox initially refused the standard gate's git subprocess and the public RPC
fetch. The same bounded checks ran successfully with approved execution; no
application behavior was changed to work around those environment restrictions.

## Next boundary

Internal review precedes publication. If #120 remains open, the future PR is stacked
against its branch; retarget before that branch is deleted. If it has merged,
refresh main and reconcile its content first. Fatih handles review/merge.

D15-02b stays Pending/Shared: temporary reporting is active, but this work does not
implement or approve permanent default-off/opt-in behavior. D16 execution remains
separate. No signature, transaction, funding, restore or scheduler activation.
