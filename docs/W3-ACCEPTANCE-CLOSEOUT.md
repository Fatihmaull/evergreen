# W3 Acceptance and operations — technical closeout, Sep16

Local branch `ops/W3-acceptance-closeout`, baseline main8b78efd. Published in [PR #181](https://github.com/Fatihmaull/evergreen/pull/181). Merged and explicitly accepted in #140/#141 on Sep16. This update records those decisions; it does not expand their scope.

## Acceptance matrix

| Item | Verified state | Remaining action |
| --- | --- | --- |
| D17-03 templates | Code/tests merged; success/failure receipts #146/#147; now a separately sent approachingCritical template with inbox confirmation | Fatih confirms task acceptance; the old "send real test emails" blocker is no longer the technical gap |
| #140 failure alert acceptance | Named failures/evidence merged; #170 mailbox check passed and was reported; no repeat needed | Accepted/closed by Fatih in #140; shared-provider risk explicitly accepted, not solved |
| #141 independent observer | Corrected warn420/critical540 config installed and published #177; timer armed; runtime hashes and service state rechecked | Accepted/closed by Fatih in #141; actual Sep18 firing still future |
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

## Acceptance reconciliation — Sep17

#181 is merged. #140 and #141 are explicitly accepted/closed; do not reopen them or
ask for their acceptance again. D17-03 remains In progress because #140 explicitly
excluded that task's own status reconciliation. The original technical evidence
and historical verification counts remain unchanged.

Future work remains Sep18 firing/readiness, B/C observations and same-day evidence.
Stage2 direction is separately tracked in #183 after closure of the feasibility
issue #161. No new test email, runtime change or scope decision is made here.

## Verification

Full pnpm check exited0: 768 Vitest +114 Node =882 tests. After the final documentation
edits, schedule generation, reciprocal links, backlog parsing and evidence indexing
were checked again. Both new evidence bundles passed checksum verification. Exact
approachingCritical re-render, receipt/provider ID and separate inbox confirmation
were compared successfully. No production-code change or unresolved technical finding
was identified in this scoped pass. Publication is in PR #181; explicit acceptance recorded in the closed #140/#141.
