# W3 Acceptance and operations — technical closeout, Sep16

Local branch `ops/W3-acceptance-closeout`, baseline main8b78efd. No new final
acceptance, issue closure or publication is claimed by this report.

## Acceptance matrix

| Item | Verified state | Remaining action |
| --- | --- | --- |
| D17-03 templates | Code/tests merged; success/failure receipts #146/#147; now a separately sent approachingCritical template with inbox confirmation | Fatih confirms task acceptance; the old "send real test emails" blocker is no longer the technical gap |
| #140 failure alert acceptance | Named failures/evidence merged; #170 mailbox check passed and was reported; no repeat needed | Explicit acceptance/closure by Fatih, with shared-provider risk stated correctly |
| #141 independent observer | Corrected warn420/critical540 config installed and published #177; timer armed; runtime hashes and service state rechecked | Explicit acceptance/closure by Fatih; actual Sep18 firing still future |
| D17-04 and D18-02a | Already accepted in #166 / #130 | No new proof or acceptance request needed |
| B watch roles | All four primary/backup roles confirmed in #104/#180 | Execute on schedule; preparation is not event evidence |

## Technical gaps closed in this pass

1. D17-03's remaining task text called for real test messages. The existing runner
   delivered generic liveness alerts, while approachingCritical had only recorded
   unit coverage in the inspected path. One labelled historical/disposable template
   delivery now has provider and separate inbox evidence. No protected subject or
   new transaction was involved. [Evidence](evidence/2026-09-16-critical-template/README.md).
2. The inbox-check guide incorrectly called the watcher a second delivery channel.
   It is independent of GitHub scheduling, but uses the same Resend EmailChannel
   and configured mailbox as engine alerts. The guide now states that shared email
   failure/spam filtering is not mitigated by calling the observer independent.
3. W3-WEEKEND-UPDATE still listed the cancelled01:00 slot and unaccepted handoff.
   Its current-commitment table now uses the canonical generated schedule. The
   schedule checker includes this page; no second hand-edited table was introduced.
4. Actual installed-runtime checksum and timer/service status were rechecked.
   No repinning just for diagnostic text, extra mail test or speculative code change.
   [Operation read-back](evidence/2026-09-16-operations-check/README.md).

## Review and publication packet

At the separate publication checkpoint, include the new template evidence and the
three documentation corrections. The specific request to Fatih is acceptance of
D17-03, #140 and #141 on the now-complete technical evidence; do not ask again for
already accepted D17-04/D18-02a or for already confirmed dates.

Do not mark #140/#141 closed on Fatih's behalf. Future-event work stays open:
Sep18 runtime firing check, four B captures, minimum C crossing and conditional
shared-Wasm handoff. No Stage2 or W4 work is absorbed into this closeout.

## Verification

Full pnpm check exited0: 768 Vitest +114 Node =882 tests. After the final documentation
edits, schedule generation, reciprocal links, backlog parsing and evidence indexing
were checked again. Both new evidence bundles passed checksum verification. Exact
approachingCritical re-render, receipt/provider ID and separate inbox confirmation
were compared successfully. No production-code change or unresolved technical finding
was identified in this scoped pass. Publication remains separate.
