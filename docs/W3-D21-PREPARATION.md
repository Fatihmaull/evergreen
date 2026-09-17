# W3 closeout preparation — verified Sep17

Scope: D21-01 evidence inventory and D21-02 task/slack reconciliation groundwork.
This is not the final W3 gate or a substitute for the dated B/C observations,
fresh-machine test or Fatih's independent engine cold start. Baseline mainbd7f245.

## Evidence inventory and repairs

Seven selected W3 bundles were checked against SHA256SUMS. Six passed immediately;
the scheduled A-save bundle failed on README only, while57 other manifest entries
matched. Git showed the sole change since its original #147 bundle was #166 adding
acceptance prose to the sealed README. The README was restored byte-for-byte from
fd31dbf; its original manifest is unchanged. The complete acceptance annotation is
preserved outside that bundle in a new dated note. Acceptance in #130 is not undone.
All seven selected bundles then passed. [Inventory and repair record](evidence/2026-09-17-w3-inventory/README.md).

`pnpm check:evidence-integrity` now verifies every discovered SHA256SUMS evidence
bundle as part of pnpm check. Its regression demonstrates valid → changed README
rejected → original bytes restored, and refuses an empty inventory. Counts include
nested manifests and are not unique-file totals; unsealed historical records are
not falsely described as verified bundles.

The existing publish-dry-run `SHA256SUMS` was a different kind of record: a tarball
digest with a human `(pnpm pack)` suffix and no retained tarball. Its bytes are
preserved as PACKAGE-DIGEST.txt and the README explains the distinction. This is
not a new npm pack/release verification or a waived checksum failure.

## Task counts and slack — facts with comparable denominators

| Snapshot | Checkbox rows | Standing rows | Basis |
| --- | --- | --- | --- |
| Sep5 historical115 snapshot | 115 | 0 | 3f8ea14 |
| Sep5 end-of-date snapshot | 123 | 0 | b7056e6 |
| Sep10 end-of-date snapshot | 144 | 1 | 409bc16 |
| Sep17 main | 148 | 1 | bd7f245 |

The last two snapshots therefore contain145 and149 registered task IDs respectively.
The150-row Notion mirror additionally retains a retired identifier. W1-D4-09's move
from checkbox to standing task is not lost work. Full added/removed ID sets are in
the inventory JSON so the arithmetic can be inspected rather than asserted. The
early removed W2-D12-02b is the same code-sharing measurement later registered as
F-01, not a task cancelled or added from nothing.

The slack ledger has **zero days explicitly charged out of six**. There is no
independent time log sufficient to conclude actual consumption is zero or to assign
hours/days to each added task. The growth includes new scope, corrections, verification
and classification changes; unequal task sizes prevent conversion to a day count.
Do not call all six days free capacity solely because no charge was recorded.
D21-02 remains In progress until Shared reconciles actual schedule displacement.

## Four READY outcomes — remaining measurements

- CLI: existing single-tarball rehearsal and publish dry run are evidence, not a
  new user's measured under-five-minute registry installation. Public publish still
  has its own release gate. No packaging rehearsal was repeated here.
- Dashboard: main still carries a placeholder; the W4 read-only arbitrary-contract
  flow and independent browser proof remain Fatih's work.
- Action: no action.yml implementation in main; W4-D25 implementation, separate-repo
  green/red proof, dedicated failure subject and release remain explicit dependencies.
- Self-host engine: Stage1 evidence exists, but Fatih's docs-only cold start and
  later production guide/persistence work remain separate. Do not coach or substitute
  for that independent measurement. Policy-signer disposition still requires #183.

## Still open after this preparation

- Sep18 actual watcher startup/readiness; four B captures Sep20–21; minimum C capture
  Sep25 and the conditional shared-code handoff. No future event is marked complete.
- D21-01 final evidence snapshot once required events/acceptances exist.
- D21-01b fresh-machine test; D21-01e Fatih cold start (date/weekday inconsistency
  still needs explicit scheduling clarification; no appointment moved here).
- D21-01d explicit October2 READY yes/no gate decisions with capacity evidence.
- D21-02 final Shared slack accounting, without invented time estimates.

No schedule, runtime, provider, transaction or SOW decision changed. This preparation
and its integrity repair are published in [PR #192](https://github.com/Fatihmaull/evergreen/pull/192) for Fatih review/merge; final W3 gate is not claimed.

## Internal review and validation

Full pnpm check passed: 770 Vitest +116 Node =886 tests. The integrated inventory
gate verified22 manifests /622 manifest entries (nested inventories can overlap).
The new regression pins the later-README-edit failure and empty-inventory refusal.
The accepted A bundle is byte-identical to its original58-file manifest again;
only the later annotation's location changed, with all text retained. The package
digest rename preserves its original110 bytes and does not claim a missing tarball
was verified. No remaining actionable finding was identified in this scoped pass.
