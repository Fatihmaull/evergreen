# W3 notification and scheduled-save publication — 2026-09-14

Published after local implementation, internal review and Rakha authorization.
Public surfaces use task IDs and concrete deliverables; local grouping labels stay
in private planning/chat. Historical run IDs and original raw evidence remain exact.

| Task / scope | PR | Integration head |
| --- | --- | --- |
| W3-D17-05 — run/liveness events | [#142](https://github.com/Fatihmaull/evergreen/pull/142) | `dc2c9d8` |
| W3-D17-05 — persisted alert runner | [#143](https://github.com/Fatihmaull/evergreen/pull/143) | `089f4ab` |
| W3-D17-05 — independent scheduler watcher | [#144](https://github.com/Fatihmaull/evergreen/pull/144) | `0f4736f` |
| W3-D18-02a — bounded save-proof harness | [#145](https://github.com/Fatihmaull/evergreen/pull/145) | `83387d5` |
| W3-D17-05 / W3-D16-01 — failure evidence and fixture clock | [#146](https://github.com/Fatihmaull/evergreen/pull/146) | `cbf4038` |
| W3-D16-01 / W3-D17-04 / W3-D18-02a — scheduled-save evidence | [#147](https://github.com/Fatihmaull/evergreen/pull/147) | `47947f6` |

The integration heads above passed full CI and Cloudflare checks and have Fatih
requested as reviewer. These are publication-validation snapshots; current PR
checks are authoritative after subsequent metadata commits. No new task PR was
merged or auto-merged by this agent. Before merging/deleting a parent, retarget
its children to main so GitHub does not silently close the dependent PRs.

Fatih approved/merged #137 and #138 during publication. All six task branches retain
their EmailChannel/stub exports and current main #139, including its scheduler-window
warning and revised Sep 20 preflight. Conflicting append-only exports and doc-gap
rows were reconciled without dropping either workstream. The final integrated local
`pnpm check` passed 743 Vitest + 95 Node = 838 tests. Intermediate PR CI executes the
same canonical full check. Existing signed proof and checksums remain verified.

Tracking: [engine alert/failure acceptance #140](https://github.com/Fatihmaull/evergreen/issues/140),
[independent watcher #141](https://github.com/Fatihmaull/evergreen/issues/141),
[W3 coordination #104](https://github.com/Fatihmaull/evergreen/issues/104),
[Shared save-proof acceptance #130](https://github.com/Fatihmaull/evergreen/issues/130),
and [test-clock finding #128](https://github.com/Fatihmaull/evergreen/issues/128).

Notion read-back verified seven affected rows with unchanged formal owners:
D16-01, D17-01/02/03/04/05 Done for their implemented/verified outcomes; D18-02a
In progress for Shared acceptance and merge. Notes explicitly distinguish merged
#137/#138 from open task PRs. All-ID presence check: 149 registered IDs, 150 mirror
rows, no missing/duplicate IDs; the sole extra is the known retired Dropped predecessor.
The Knowledge Base now mirrors the review findings and proof boundaries.

A main-driven Notion sync can temporarily replace statuses for still-unmerged work;
published outcomes and PR/evidence links remain in Notes. No status here asserts
that an open PR is merged. Session sync follows the verified published branch per
AGENTS and preserves this limitation explicitly.

[Scheduled A evidence](evidence/2026-09-14-scheduled-a-save/README.md) preserves one
transaction, actual timer provenance, full RPC/receipt/TTL verification and confirmed
success/liveness inbox receipts. [Failure evidence](evidence/2026-09-14-stage1-failures/README.md)
distinguishes injection from real provider delivery and records the one spam placement.
The original executing commit 32670fe is retained through the archived reviewed-source
branch. Later fixes, #139 and #138 are not retroactively claimed as that build.

D18-02a still needs Fatih's Shared acceptance of the local OS-timer proof. Production
GitHub stays decide-only. No new email, transaction, timer activation or funding was
performed during publication; the proof timers remain stopped.
