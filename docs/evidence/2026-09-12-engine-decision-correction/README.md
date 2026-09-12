# W3-D15-04 — read-only engine correction verification

Base: origin/main cc0fb16. Runtime subject: corrected engine source on
`fix/W3-D15-04-engine-decisions`, built by the successful full `pnpm check`.
No transaction, signature, secret lookup, restore or scheduler dispatch occurred.
The three-artifact transaction rule is not applicable to these read-only runs.

## Existing compiled command

`EVERGREEN_CONFIG=evergreen.config.dogfood.json pnpm engine:run` returned exit 0.
[Captured output](dogfood-command.txt): two observed entries, both above the default
17,280 action threshold. A's instance had 1,386,579 remaining and shared code
650,817. This is health of observed instance/code scope, not whole-contract storage.

The existing dogfood config and workflow were not modified. It does not declare
any additional data keys, so the scan's scope caveats remain relevant.

## Controlled override, still read-only

[Capture helper](capture-readonly.mjs) loads the public dogfood config, sets a
per-contract action threshold of 1,500,000 and remaining-TTL target of 2,000,000
**in memory**, and calls the built `runEngine` using the real Testnet reader.
The helper uses exclusive file creation so recorded results cannot be overwritten
by an accidental rerun. A later validation must use a new capture directory.

[Config](validation-config.json) contains only public config and environment
variable names. [Result](result.json) shows:

- At ledger **4,640,020**, A instance ends at **6,026,591**, hence remaining
  **1,386,571**. The hand calculation is 6,026,591 − 4,640,020.
- Engine decision is extend with **target 2,000,000**. The internal delta is
  613,429; the config target is not added to the current remainder.
- The shared code still ends at **5,290,829**. Its decision is a guard refusal,
  even though A is the only configured consumer.
- Liveness alarms despite the global threshold staying at 17,280, because the
  contract override is 1,500,000. There was no confirmed action in this preview.

The `read-*.json` files are **normalized LedgerEntryReader snapshots**, not raw
JSON-RPC receipts. They record request keys and reader responses, including the
state-archival setting used for the ceiling. No transaction evidence is claimed.

The same validation config was passed to the actual compiled script through
`pnpm engine:run`; it returned **exit 1**, the expected liveness alarm. See
[override command output](override-command.txt). This checks process behavior as
well as module return values. Nothing was submitted in either run.

## Regression checks

24 added tests exercise target-vs-delta, real ceiling and cap boundary, no valid
ceiling, target unable to clear the action threshold, expired/zero boundary,
shared payer/target agreement and conflicts in both consumer orders, missing
consumer/payer policy, override alarm and false-alarm avoidance, and missing
network settings. The four original startup reproductions failed on main before
correction; their source is preserved in the adjacent startup-review bundle.

[Mutation results](mutation-checks.json): reintroducing target-as-delta fails 1
selected test; allowing expired candidates fails 1; bypassing payer agreement
fails 2; reverting to global-only liveness fails 2; bypassing the write guard
fails 3. Every mutation failed a behavioral assertion, then original source was
restored and all 69 focused engine/liveness/agreement tests passed.

Full `pnpm check` passed with 491 Vitest + 78 Node = **569 tests**. Coverage was
94.42% statements, 89.16% branches, 94.52% functions, 95.95% lines. Final checks
are recorded in the implementation report if later tests change these totals.
