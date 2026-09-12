# W2-D14-03 — review of Fatih PR #102 and W2 closeout

2026-09-12. Exact PR head `06041e5c1f3057831a4157b0c058b5fa708e5988`, main base `c3ba97b`. PR #105 remains open at `016f6ff` and contains the later live A-instance proof. Review work uses `docs/W2-D14-03-closeout-review`; neither PR was merged or modified. This is the internal result and a review draft, not a submitted GitHub review.

## Recommendation: request changes

The dry-run and multi-contract CLI changes passed the inspected paths, existing tests, and installed-package smoke checks. Resolve the following sync correctness findings and reconcile the week report before accepting #102 as the W2 closeout.

### P2 — annotated owners disappear from the sync plan

`scripts/task-id.mjs:29` only recognizes an owner followed immediately by `)`. The actual rows W2-D9-01 and W2-D9-02 use `(F, was R)`. `parseBacklog` returns `owner: undefined` for both; `planSync` consequently produces **zero corrections** if Notion still says Rakha. Task presence/status checks remain green while ownership is wrong.

Requested correction: recognize the leading current-owner initial within the existing annotation syntax, preserve genuinely absent owners, and test the two real rows plus a Notion mirror with owner Rakha. Both should generate Owner=Fatih updates, with no unrelated field writes.

### P2 — duplicate mirror IDs are silently collapsed

`scripts/sync-notion.mjs:108` builds a Map directly from the mirror rows. With two pages carrying the same task ID, the last page silently wins; only that page gets an update, with no missing/phantom warning. Reproduced using two Pending W2-D11-04 pages and a Done backlog row: only the second page is selected. A maintained-looking stale duplicate remains visible to readers.

Requested correction: reject/report duplicate mirror IDs before any PATCH and identify all conflicting page IDs. Preserve the current explicit behavior for missing/extra rows. No live duplicate was observed in today's mirror; this is a reproduced ambiguity-handling defect, not a claim that today's board already contains duplicate IDs.

### W2 report and tracking corrections

- `docs/W2-REVIEW.md:14` says 26 tasks but its categories sum to 27. On the actual PR head there are **27 W2 rows: 19 Done, 3 In progress, 1 Blocked, 2 Pending, 2 Dropped**. Across all weeks: 146 checkbox rows plus one standing obligation = 147 registered IDs. The earlier 145/146 figures in the PR description are older snapshots.
- After adopting #105's D11 state, the combined projection is **22 Done, 2 In progress, 1 Pending, 2 Dropped**. This projection is not merged reality. Packaging rehearsal closure would change those totals again; generate final numbers from the final integrated backlog.
- The report/snapshot says no live extension has run. Preserve original raw captures, but add a dated update linking #105 and its raw receipt/screenshots; do not present the earlier snapshot as current state.
- The multi-contract implementation is in this PR, while the snapshot still describes the singular-parser failure. Mark that capture as the before state and link the fix/tested current head.
- W1 accounting is 50 completed checkbox tasks plus W1-D4-09 as a standing obligation. The recurring ID should not be presented as an unfinished task or silently mixed into a completed-task denominator.
- Current mirror: 147 rows. Main/review branch has 146 registered IDs and no missing rows, with only retired Dropped predecessor ~~W3-D18-02~~ extra. PR #102 introduced W2-D10-01c without a Notion row. This review copies the exact registered row to the review branch and creates its mirror entry with explicit open-PR provenance; no new task ID was invented. After this reconciliation the review branch has 147 registered IDs and the mirror has 148 rows including the retired predecessor. Final presence diff verified: no missing IDs or duplicate mirror IDs; only the retired predecessor remains extra. Automated sync intentionally cannot create missing rows.
- Notion marked W2-D14-03 Done while integrated closeout remained unfinished. Repo-first review state is In progress and the mirror was corrected, with the anomaly recorded in STATUS. Existing D11 live-proof completion is not reopened.

## Validated and no new blocker identified

- Explicit --dry-run preserves simulation; contradictory --submit is refused; valid explicit submit remains representable in tests.
- Multi-contract IDs are validated, duplicates refused, and ambiguous multi-contract --keys-file refused. Missing B remains degraded (exit 3) in the actual installed CLI replay.
- Write-guard changes rename threshold/expiry metadata and messages; the guard still refuses unconditionally without explicit acknowledgement, rather than expiring on a date.
- [Full check and package evidence](evidence/2026-09-12-pr102-review/README.md): 496 tests, coverage, CLI-only fresh installation, offline scans and contradictory-flag refusal.
- D14-02b's install/packaging behavior passed again; its prior technical defect is resolved. Record closure using these results while keeping the separately deferred D14-02c rehearsal and npm publication in W4.

## Remaining external dependency

The Notion automation needs NOTION_TOKEN and database access. Do not infer operational success from a parse-only green job. No token was requested, provisioned or read in this review. Assign configuration ownership and verify a controlled sync once available. CI being non-blocking does not remove the need to check the job outcome.

## Proposed message to Fatih — not sent

@Fatihmaull reviewed #102 at 06041e5c. Full check passed 496 tests; fresh CLI-only installation and offline scan/flag smoke checks passed. Please address two mirror correctness gaps before merge: annotated `(F, was R)` owners parse as undefined (real D9 rows), and duplicate mirror IDs silently select the last page instead of reporting ambiguity. Also update the W2 summary against current head and #105, The missing W2-D10-01c mirror row was reconciled separately, preserving your ID and ownership. Existing live proof is complete in #105; no transaction repeat is needed. I recommend request changes on those points, with Fatih retaining branch and merge ownership.

After corrections: recheck the affected tests, reconcile #102/#105 on their merge order, refresh final W2 counts/evidence and the narrative Task Tracker, then close related issues. Do not start W3 as a substitute for this closeout.
