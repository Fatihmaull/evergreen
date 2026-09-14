# W3 notification and evidence review — reconciliation

Updated 2026-09-14 after main advanced through #154 (`91ad650`). The remaining
PRs target main independently; no serial #145 → #146 → #147 merge is required.
Old branch commits remain in merge ancestry and the recorded proof source remains
accessible through the archived reviewed-source branch. No force push was used.

| Scope | PR | State at reconciliation |
| --- | --- | --- |
| Run/liveness event mapping | [#142](https://github.com/Fatihmaull/evergreen/pull/142) | Merged by Fatih; #152 corrected diagnostic suppression |
| Persisted alert runner | [#143](https://github.com/Fatihmaull/evergreen/pull/143) | Merged by Fatih |
| Independent scheduler observer | [#144](https://github.com/Fatihmaull/evergreen/pull/144) | Merged by Fatih |
| Bounded save-proof harness | [#145](https://github.com/Fatihmaull/evergreen/pull/145) | Main plus harness files only; 842 tests passed |
| Failure acceptance and fixture clock | [#146](https://github.com/Fatihmaull/evergreen/pull/146) | Main plus failure scope only; 839 tests passed |
| Saved A evidence and observation-gate docs | [#147](https://github.com/Fatihmaull/evergreen/pull/147) | Evidence/docs only; baseline full gate 836 tests passed, doc/gate checks separately verified |

## Which change closes which gate

- **W3-D17-05:** merged #142–#144 and #152 supply runtime behavior; #146 supplies
  failure evidence and its acceptance. It does not need #145 or #147 to merge.
- **W3-D17-04:** success/liveness receipt proof is in #147, failure proof in #146.
  Both evidence scopes need acceptance; the harness is not a functional dependency.
- **W3-D18-02a:** the local OS-timer save is already captured in #147. Fatih Shared
  acceptance remains #130. Reviewing reusable harness code #145 and accepting the
  historical proof are distinct; no second A transaction is needed for reconciliation.
- **W3-D18-02b/c:** readiness uses the read-only in-memory probe from #149 and
  rehearsal-resistant gate from #151. Corrected preflight dates and gate wording
  are in #147. No B/C timer, write or restore is activated by this documentation.
- **W3-D18-03:** the A artifacts exist; future B/C observations and final bundle
  acceptance still remain. Published implementation is not a claim that those
  future events have happened.

## Corrections retained and checked

Main #148 D1 captures, #149 B/C verification/probe, #151 rehearsal exclusion,
#152 every-diagnostic alerting, #153 gate rules and #154 two-tier CLI display are
retained. No production package source is replaced by the older branch versions.

The old failure rehearsal expected one alert for an insufficient-balance simulation.
Against #152 it reproducibly returned two. The corrected test requires a failed-bump
alert and a distinct EXECUTION_INCOMPLETE event, unique IDs and no network/signer
access. Historical delivery JSON and message counts were not rewritten or resent.

The preflight now says Friday September 18, Sunday September 20 and Monday
September 21. The real probe command unsets BELOW rather than relying on an operator
to revert a rehearsal variable. Exit zero alone is not crossing evidence. Minimum
C crossing/refusal capture remains required by the existing date gate; full backup
expiry proof is conditional on B's outcome. An isolated fixture check confirmed
B-only evidence is red on September 25, real C evidence makes it green, and a C
rehearsal remains red. No synthetic capture was committed to the evidence tree.

A carries the scheduled-save claim; manual B/C observations are recorded as manual.
A separately requested unattended B observation needs an agreed read-only timer,
not a live B configuration. Shared review remains explicit. The guard, probe,
crossing checker and dogfood config are byte-identical to main.

The [A bundle](evidence/2026-09-14-scheduled-a-save/README.md) is byte-identical to
its previous published version. Signed envelope/receipt/TTL/control verification
still passes. Failure artifacts and operation guidance are independently reviewed
in [#146](https://github.com/Fatihmaull/evergreen/pull/146).

Tracking remains #104 (coordination), #140 (failure acceptance), #141 (watcher),
#128 (fixture-clock finding), and #130 (Shared proof acceptance). Current PR checks
and reviewer decisions are authoritative; no PR is merged by this agent.
