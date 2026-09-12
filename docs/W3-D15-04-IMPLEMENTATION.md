# W3-D15-04 — correct the existing engine decision contract

Status: internal review complete; two findings fixed in 73a9050. Ready for publication; no PR or merge yet. See [review](W3-D15-04-REVIEW.md).
Tracking: [Issue #119](https://github.com/Fatihmaull/evergreen/issues/119).
Base: main cc0fb16. Branch: `fix/W3-D15-04-engine-decisions`.

## Result

The correction builds on Fatih's `packages/core/src/engine.ts` and its existing
`scripts/engine-run.mjs` consumer. It does not create a second engine or change
the cron's permissions, config or schedule. D15-01/D15-03 remain recorded as
Fatih's merged work; D15-04 is the separately owned correction.

| Reproduced problem | Corrected behavior |
| --- | --- |
| Config target 518400 became 535680 at remainder 17280 | Config target stays 518400. The adapter derives the delta and reuses resolveExtendTarget. |
| Ceiling was Number.MAX_SAFE_INTEGER | runEngine reads and parses the STATE_ARCHIVAL config via its existing reader; no executable target without a valid observed ceiling. |
| Expired instance got extend | Expired entries skip; zero remains live and can extend. |
| Shared key selected the first payer | All known consumers and repeated registrations must resolve and agree on payer and target. Conflicts skip; a common policy still permits one decision with every consumer retained. |
| Override affected decisions but not liveness | One internal pass resolves effective thresholds per key and passes the same map to assertLiveness. Both higher and lower overrides are covered. |

For a shared key, the highest consumer action threshold applies. This is a trigger
union, not a license to select a payer or enlarge a target. Payer/target agreement
is checked separately. A target must increase TTL and clear that threshold even
after the network cap; otherwise the engine records a skip, and liveness alarms
when the entry needs action.

## API impact

- `runEngine(reader, config)` retains its signature and decide-only output.
- `decideBumps(scan, config, maxEntryTtl?)` now accepts an observed ceiling. Direct
  callers that omit it get explicit skips for due candidates, never a guessed
  target. Pure tests supply the fixture ceiling; real runs read the network.
- `assertLiveness.decisions` is required. Its new optional
  `actionThresholdByEntry` map overrides the global threshold per key. Existing
  callers/tests explicitly pass [] for the intentional absence of decisions.
- No shared-types schema changes, new libraries or dependency upgrades.

The guard still runs before a candidate is accepted. A refusal stays a skip
rather than an exception, so a protected B does not abort A's evaluation.
Unknown TTL still skips; policy conflicts do not fabricate attempts or success.
This correction does not implement D15-02's full two-tier config surface,
D15-02b's temporary-entry opt-in policy, or D16 signing/execution.

## Verification

[Startup reproductions](evidence/2026-09-12-engine-startup-review/README.md)
failed on main; [correction verification](evidence/2026-09-12-engine-decision-correction/README.md)
records 24 regression cases, five mutation checks, full test results and read-only
A observations. The built script returned exit 0 for normal A monitoring and
exit 1 for an override that needs action but has not performed it.

Full pnpm check after review passed 575 tests (497 Vitest + 78 Node); no coverage thresholds
were lowered. Engine coverage: 97.64% statements, 91.22% branches, 100% functions,
98.68% lines. No signing, submission, protected override or transaction artifact.

## Next boundary

Internal review findings are resolved; PR publication is the next checkpoint. D16 must consume the
corrected target and resolved payer, re-check guard immediately before prepare,
and require its own explicit live opt-in. For a later A proof with a raised
threshold, the requested target must also be above that threshold; the existing
518400 target cannot satisfy a 1500000 action threshold. The read-only verification
uses 2000000 to demonstrate this, without modifying operational config.

B's revised outcome from #114 remains detect/refuse/expire. No change to that
choice, to C, or to the shared-code guard is included here.
