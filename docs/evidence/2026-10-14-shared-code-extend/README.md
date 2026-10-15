# Shared `ContractCode` entry extended — 2026-10-14 (`W3-D18-02d`)

**The entry that governs whether A, B and C are usable at all was 104,101 ledgers
from archival — about six days — and has been extended to the protocol ceiling.**

Scheduled for Sat 2026-09-26 and done on **2026-10-14**, eighteen days late. The
departures from the plan are named in the backlog row and in §Departures below.

## Before and after, per ledger key

Measured by `getLedgerEntries` directly, and independently by `evergreen scan`.

| entry | key (truncated) | liveUntil before | liveUntil after | Δ |
|---|---|---|---|---|
| **code** *(shared: A, B, C)* | `AAAAB8flXw…` | **5,290,829** | **8,297,162** | +3,006,333 |
| instance | `AAAABgAAAAEblswW…BQAAAAB` | 6,370,261 | **8,300,246** | +1,929,985 |
| persistent | `AAAABgAAAAEblswW…UGVyc2lzdGVudA` | 6,025,595 | **8,300,247** | +2,274,652 |
| temporary | `AAAABgAAAAEblswW…VGVtcG9yYXJ5` | 6,025,598 | 6,025,598 | **not touched** |

Remaining on the code entry went from **104,101** ledgers to **3,107,326**
(≈ 184 days at the close rate measured below).

**Temporary was deliberately left alone.** It is outside the scope given for this
task, and it is the one kind that is *deleted* rather than archived at expiry, so
extending it buys a different thing than keeping the project readable.

## Transactions

| what | hash | fee charged | ledger |
|---|---|---|---|
| code | [`ef581718…340fb`](https://stellar.expert/explorer/testnet/tx/ef5817188b0405bea7e5622365cc2fb8585438fc164890104aff5114630340fb) | **289,112,648** stroops (28.9113 XLM) | 5,186,763 |
| instance | [`3fac25af…64e1`](https://stellar.expert/explorer/testnet/tx/3fac25afe8e786c43d9a3030b1a01885686fc26c0a97a62249557ff43d3664e1) | 1,588,629 stroops (0.1589 XLM) | 5,189,847 |
| persistent | [`00f210dc…5fb6`](https://stellar.expert/explorer/testnet/tx/00f210dcf88f9ab5a7a62efe626c6c5d66f6d542e6d692455255467c57995fb6) | 1,249,391 stroops (0.1249 XLM) | 5,189,848 |

**Total 29.1951 XLM**, confirmed against the payer's balance (10,000.0000000 →
9,970.8049332). All three `successful=true` on Horizon.

**The code entry is 99.0% of the bill.** Evergreen's own `--cost` predicted
exactly this shape before anything was submitted — *"99% of that rent is one
entry … Code entries hold the Wasm and are usually the expensive one"* — and
quoted 34 XLM for all four entries against 29.20 actual for three.

## Target, read live rather than assumed

`max_entry_ttl` was read from the network's own `ConfigSetting` entry
(`AAAACAAAAAo=`, the key recorded at `packages/core/src/network-config.ts:12`):

```
max_entry_ttl      3,110,400
min_persistent_ttl   120,960
min_temporary_ttl        720
```

The backlog's figure of 3,110,400 was correct, but it was verified live rather
than trusted — it is network configuration, not a constant.

**Target used: `extendTo = 3,110,399`** (`max_entry_ttl - 1`, the bound noted at
`network-config.ts:135`).

**On the absolute-vs-delta trap** (`BACKLOG.md`, `W3-D18-01`): confirmed by
decoding the built transaction before submitting. `stellar contract extend
--ledgers-to-extend N` maps directly to the operation's `extend_to: N`, which
means *live for N ledgers from the current ledger* — not N added to the existing
remaining TTL. Decoded footprint was `read_only: [contract_code c7e55f0a…]`,
`read_write: []`.

**The fee was checked before submitting**, per the recorded tripwire that a cost
near ~11,700 stroops means no rent was charged. `--build-only` produced an
*unsimulated* envelope (fee 100, instructions 0), so it was useful for verifying
the footprint and `extend_to` but not for pricing. Pricing was done read-only
with `evergreen scan --cost` instead.

## Ledger close rate, measured

Two `getLatestLedger` reads 92 seconds apart: ledger 5,186,700 → 5,186,718,
18 ledgers in 92 s = **5.1111 s/ledger**. On that rate the code entry would have
archived ~**2026-10-20 09:41 UTC**. The backlog's ≈06:38 UTC estimate assumed
exactly 5.000 s/ledger.

## Departures from the plan

1. **Eighteen days late.** Scheduled Sat 2026-09-26, done 2026-10-14.
2. **Done with the `stellar` CLI (28.0.0), not with Evergreen.** Evergreen's own
   CLI *cannot* extend this entry — see §The product gap.
3. **Three entries, not four.** Temporary deliberately excluded (above).
4. **A fresh friendbot-funded payer** was used rather than any existing identity.
   Its secret lives only in the `stellar` keystore; it never appeared in a
   command line, a committed file or a report.

## The product gap this exposed

**The shipped Evergreen CLI cannot extend the one entry Evergreen exists to
protect.**

- `packages/core/src/write-guard.ts:133` and `:154` both tell the operator
  `To override: --acknowledge-protected <key>`.
- `packages/cli/src/extend.ts:76-92` accepts nine flags and
  `--acknowledge-protected` is not among them; anything else returns
  `Unknown or conflicting extend option`.
- `packages/cli/src/bin.ts` never passes `acknowledgeProtected` into core.
- `packages/core/src/extend.ts:21` and `write-guard.ts:93` *do* accept it, so the
  override exists in the library and nowhere a user can reach.

Registered as a backlog item rather than fixed here: fixing it means a CLI
change, a PR and CI against a six-day clock, to produce a dogfooding story
nothing was waiting for. The extend was the only thing with a deadline.

**Also logged, not fixed:** `write-guard.ts:132` still tells the reader the
extension is *"scheduled for extension at W3-D18-02d, after 2026-09-26"* — a date
now eighteen days past. It is in `packages/core/`, which this change does not
touch, because `check:evidence-integrity` pins `core/dist` and retiring that pin
is its own decision.

## What Evergreen said about A before this landed

Kept because it is a finding in its own right. The full output is in
`raw/pre-extend-scan-A.txt`. Six days from the entry that takes down all three
contracts, a bare `scan` of A printed:

```
HEALTHY  instance  AAAABgAAAA…        remaining: 1,183,568   expires ~2026-12-21
WARNING  code      AAAAB8flXw…        remaining:   104,136   expires ~2026-10-20
  health: WARNING — Low. … Above action threshold (17280 ledgers);
          warning only, no bump needed.

Worst entry health: WARNING
```

**The healthy instance prints first and the binding constraint prints second**,
and the binding constraint is annotated **"no bump needed"**. The threshold logic
is behaving exactly as specified — 104,136 is far above 17,280 — but the advice
is wrong for a code entry that governs three contracts, and the ordering buries
it. A reader who stopped at the first entry would have concluded A was fine until
December.

After the extend, the same scan reads `Worst entry health: HEALTHY`
(`raw/post-extend-scan-A.txt`).

## Reproducing the readback

```bash
# independent of any Evergreen code
curl -s -X POST https://soroban-testnet.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLedgerEntries","params":{"keys":[
       "AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7"]}}'

# and through the product
npx @evergreen-stellar/cli scan \
  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  --keys-file raw/data-keys-A.json
```

## Files

| file | what it is |
|---|---|
| `raw/pre-extend-scan-A.txt` | bare scan of A immediately before, 2 entries |
| `raw/pre-extend-scan-A-full.{txt,json}` | scan with data keys, all 4 entries |
| `raw/post-extend-scan-A.{txt,json}` | the same scan after |
| `raw/readback-code.json` | `getLedgerEntries` on the code key after |
| `raw/readback-all-four-keys.json` | all four keys in one call after |
| `raw/tx-{code,instance,persistent}.json` | full Horizon transaction records |
| `raw/data-keys-A.json` | A's persistent and temporary keys, copied from `2026-09-08-scan-entry-types` |
