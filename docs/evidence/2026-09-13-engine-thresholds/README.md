# W3-D15-02 — read-only two-tier validation

Subject: implementation on feat/W3-D15-02-thresholds, based on #120 head dda2530,
runtime source recorded in c32918e and built by the full passing pnpm check. No transaction or signature was produced.

## Live observation

[capture-readonly.mjs](capture-readonly.mjs) loads the public A-only dogfood config
and adds warning 2000000 **only to a validation copy**. Action remains 17280 and
target remains 518400. The helper validates Testnet via connectTestnet and uses
only the read-only core reader/runEngine path; no secret variable is looked up.

At ledger **4,648,013**:

| Observed entry | Ends at ledger | Remaining | Health | Action needed |
| --- | --- | --- | --- | --- |
| A instance | 6,026,591 | 1,378,578 | warning | no |
| A's shared code | 5,290,829 | 642,816 | warning | no |

Remaining is hand-checkable subtraction, e.g. 6,026,591 − 4,648,013 = 1,378,578.
Both values are below the warning horizon and above the action horizon. The
[full result](result.json) records two skips and liveness.isAlarm=false. The code
entry's sharing status remains undetermined: this scan sees only A, not a census.
Only instance/code scope was observed; no storage enumeration is claimed.

The `read-*.json` files are normalized LedgerEntryReader snapshots, not raw RPC
transaction receipts. They include the key requests and the state-archival read.
No EVIDENCE.md transaction row is applicable.

## Real script

The existing script was then run against the validation config:

```bash
EVERGREEN_CONFIG=docs/evidence/2026-09-13-engine-thresholds/validation-config.json pnpm engine:run
```

It returned **exit 0**. [Captured output](runner.txt) explicitly shows WARNING,
warning=2000000, action=17280, action-needed=no and would-extend=0. This later read
has slightly lower remainders; it is a separate observation, not the snapshot above.
Operational dogfood config, the cron and all protected keys were unchanged.

## Offline verification

[Mutation checks](mutation-checks.json) reintroduced hidden warning, premature
warning-triggered action and silently widened explicit warning. Each failed the
relevant behavioral tests. Source was restored and the focused suite passed.
The full check passed 634 tests (552 Vitest + 82 Node), without lowering coverage.

## Capture notes

The first default-sandbox attempt could not fetch getNetwork. Only the public
config copy had been written; it is preserved as preflight-config.json. A permitted
read-only retry captured the successful observation. No failed attempt created a
transaction or a TTL observation. The recorder uses exclusive file creation;
future validation must use a new directory rather than overwrite these results.


## Internal review follow-up

Review of 53cd395 found no blocking defect and made no production change. Four
additional engine cases cover distinct consumer horizons in both orders, a legacy
high action override and explicit zero boundaries. Full check now passes **638
tests (556 Vitest + 82 Node)**. The two [review mutation checks](review-mutation-checks.json)
fail as expected; source was restored. The current compiled engine and formatter
replayed the saved observations without network access, matching result.json.
See [the review report](../../W3-D15-02-REVIEW.md). Original captured files remain unchanged.
