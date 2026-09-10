# `W1-D7-08` — guinea-pig A extended past the sprint

**2026-09-09, 10:58–10:59 UTC.** Public Stellar Testnet. Three `ExtendFootprintTTLOp` transactions, submitted from `evergreen-b`, which holds no authority over A and needs none.

## Why

A's instance, persistent and temporary entries were all due to expire **2026-09-16 ~19:27 UTC** — found on the day Week 1 closed, recorded nowhere. Every mention of ledger `4,712,648` in the repo treated it as a number to match a scan against, never as a deadline.

A is not a decay subject. B (Sep 20) and C (Sep 25) are, deliberately. A is the *working* contract: the `W1-D7-01` milestone record, every live scan, the reproduction command in PR #60, the real bump `W3-D17-04` needs before Sep 18, and the screenshots that go into the evidence bundle. **Each of those artifacts stops being verifiable the moment A archives** — the same failure as a dead explorer link, and evidence has to outlive the sprint that produced it.

So the extension targets **2026-12-01**, not Sep 19. Extending to just past the immediate deadline would solve this week and reintroduce the identical problem in three weeks, with nobody watching by then.

## Result — read back from the chain, not from the success messages

Observed at ledger **4,585,600**:

| Entry | Before | After | Delta | Projected expiry | On expiry |
|---|---|---|---|---|---|
| instance | 4,712,648 | **6,025,589** | +1,312,941 | 2026-12-01 19:18 UTC | archived |
| persistent | 4,712,658 | **6,025,595** | +1,312,937 | 2026-12-01 19:18 UTC | archived |
| temporary | 4,712,659 | **6,025,598** | +1,312,939 | 2026-12-01 19:18 UTC | **deleted — unrecoverable** |
| code *(shared)* | 5,290,829 | 5,290,829 | **0 — untouched** | 2026-10-20 06:38 UTC | archived |

Projections use the measured 5.0008 s/ledger, not the assumed 5.000.

## The code entry was deliberately not extended

`SETUP.md` says of the shared `ContractCode` entry: *"Do not 'helpfully' extend or shorten it; doing so affects both proofs at once."* That rule is about B and C — but it applies to A as well, because **all three share one code entry.** Verified rather than inferred: each contract's Wasm was fetched and hashed independently.

```
A: c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb
B: c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb
C: c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb
```

One hash, therefore one `ContractCode` ledger key, therefore extending "A's code" would have extended B's and C's. Every command below names its ledger key explicitly with `--key-xdr` rather than relying on `--id` alone, precisely so that no command could implicitly reach the shared entry.

**This leaves a real, dated gap: A's code entry still expires 2026-10-20.** A contract is only as alive as its code entry, so A becomes unusable that day regardless of the three extensions above. It was not extended now because both decay proofs are still live. **Extend it after Sep 25**, once B's and C's proofs are captured, at which point touching the shared entry costs nothing. Tracked as `W3-D18-02d`.

## Transactions

| Entry | Hash | Ledger | Fee | Explorer |
|---|---|---|---|---|
| instance | `f15efca7bfabed10df9ec61f5b2bcb2a8bdfdd53c16d574e0f56766b81db77c0` | 4,585,589 | 156,840 stroops | [tx](https://stellar.expert/explorer/testnet/tx/f15efca7bfabed10df9ec61f5b2bcb2a8bdfdd53c16d574e0f56766b81db77c0) |
| persistent | `f48b7e796f9727758de59b8864320033265daf4eff72a70dc9db7183350af787` | 4,585,595 | 106,308 stroops | [tx](https://stellar.expert/explorer/testnet/tx/f48b7e796f9727758de59b8864320033265daf4eff72a70dc9db7183350af787) |
| temporary | `2963ac1e4cf818fe979dafba009d8d281424638779b0873df1a84e877f90d4fb` | 4,585,598 | 55,655 stroops | [tx](https://stellar.expert/explorer/testnet/tx/2963ac1e4cf818fe979dafba009d8d281424638779b0873df1a84e877f90d4fb) |

All three `successful: true`, all sourced from `GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE` (`evergreen-b`), confirmed through Horizon rather than trusted from the CLI's output.

**Total: 318,803 stroops ≈ 0.0319 XLM for ~83 days across three entries.** That is the product's whole economic argument in one number.

### What the fees actually say

`fee_charged` bundles the base fee, the non-refundable resource fee and rent. Isolating `rentFeeCharged` from each transaction's `resultMetaXdr` gives the real breakdown:

| Entry | Data bytes | Key bytes | Ledgers | **Rent** | Non-refundable | Total | Rent share |
|---|---|---|---|---|---|---|---|
| instance | 136 | 48 | 1,312,941 | **154,503** | 2,237 | 156,840 | 98.5% |
| persistent | 88 | 76 | 1,312,937 | **103,849** | 2,359 | 106,308 | 97.7% |
| temporary | 88 | 76 | 1,312,939 | **53,196** | 2,359 | 55,655 | 95.6% |

**Durability is a first-order price term.** The persistent and temporary entries are byte-for-byte identical and were extended by the same number of ledgers to within two — the only variable is durability, and persistent cost **1.95×** temporary. That is the actionable finding: *"move this to temporary storage"* is *"halve this entry's rent"*, which is what `W2-D12-01` needs to turn a lint into a reason to act. It is not free — temporary entries are deleted rather than archived, and unrecoverable.

**Correction.** An earlier version of this note said the instance cost 2.8× the temporary entry *"because rent is priced per entry size, not per extension"*. The 2.8× is real, but the mechanism was wrong and the numbers above are what showed it: persistent and temporary are the *same size* and still differ by ~2×, so durability was doing most of the work I attributed to size. Size does matter and does not explain it alone either — the instance is 1.12× the persistent entry's total bytes and 1.49× its rent. **Three points do not determine the size coefficient, and fitting one to them would produce a model that matches these rows and nothing else.** Recorded as a gap rather than an answer in the fixture.

Wired into `packages/core` as [`extendTTL-fees-guinea-pig-a.json`](../../../packages/core/test/fixtures/extendTTL-fees-guinea-pig-a.json) — the anchor `W2-D9-02` validates against, with `rent-fixture.test.ts` pinning the relationships rather than a formula.

## B and C were not touched

Verified independently after the fact with `scripts/check-decay-drift.py`, which reads B's and C's own instance and persistent entries:

```
B (primary proof)    crosses ~2026-09-20 12:00 UTC   drift +0.0h vs plan
C (staggered spare)  crosses ~2026-09-25 12:01 UTC   drift +0.0h vs plan
```

Unchanged. This doubles as the fifth `W1-D4-09` drift reading.

## Artifacts

- Before: [request](01-before-request.json) · [full response](01-before-response.json) — all four keys at ledger 4,585,583
- Extends: [instance](02-extend-instance.txt) · [persistent](03-extend-persistent.txt) · [temporary](04-extend-temporary.txt) — verbatim CLI output
- After: [request](05-after-request.json) · [full response](05-after-response.json) — same four keys at ledger 4,585,600
- Horizon confirmations: `tx-<hash>.json`, one per transaction

## Reproduce the read

```bash
curl -s -X POST https://soroban-testnet.stellar.org \
  -H 'Content-Type: application/json' \
  -d @docs/evidence/2026-09-09-guinea-pig-a-extend/05-after-request.json
```

Values will differ as ledgers advance or if testnet resets. The `liveUntilLedgerSeq` figures should not change until something extends them again.
