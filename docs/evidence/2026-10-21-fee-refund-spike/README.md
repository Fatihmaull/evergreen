# Spike: does Soroban refund the unused refundable resource fee, rent included? [PH2-E4-02]

**Testnet, 2026-10-21. Research only: no product code changed.** This answers ADR-007's `[to verify]` for
`PH2-E4-02` (lines 103-108) and item 3 of Fatih's plan on #299. Every number below is read back from the
network: `stellar tx fetch fee` / `meta` (CLI 27.0.0) and Horizon account balances. Raw records are in `raw/`.

| | |
|---|---|
| S1, "engine" and source of every extend | `GCWZYY2IGZ4RKBS7GPPQLK74CXD6XVSGOTQN3UVJK3GJEPWTCS6NLFNW` |
| S2, "user" holding the allowance | `GBPT6PI5445GZOXXQJA4FI6PBW24BUDB7OROHJEFIO5JELWTYNG3FTXB` |
| Subject: fresh guinea-pig deploy | `CDILMZ7SDADARYNX2TMGTRLUE5VQW6ODYC6E6AZ44XV4WSWZMUT2EGCN` (Wasm `e9b58ac6…14489`) |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

S1 and S2 are throwaway Friendbot identities made for this spike; their secrets live only in the local
`stellar` keystore. No engine or treasury key was used. The A/B/C subjects and the shared code entry were not touched.

## Verdict

1. **Yes, the unused refundable resource fee is refunded, and rent is part of it.** For every one of 13
   transactions, the source's balance fell by exactly `feeCharged`, never by the envelope `fee`. In the rent-heavy
   cases the refundable part charged equals `rent_fee_charged`, so the unused rent is what comes back:
   - #2 declared 2x its simulated resource fee (3,604,176 stroops) and was charged 1,563,116; the 2,041,160 difference stayed with the source.
   - #3 declared 1,802,088 of rent on an entry already near its target and was charged 2,588.
2. **It holds for the pull too.** `transfer_from` declared at 2x (#7) was charged 9,032 of 27,714.
3. **A failed transaction keeps only the non-refundable fee** (plus inclusion). Its refundable part charged is 0 in both:
   - #5 (declared 0.5x, failed `insufficient_refundable_fee`, the extend did not happen) was charged 1,315;
   - #8 (over-cap `transfer_from`, `trapped`) was charged 8,553.
4. **Simulation over-estimated what was charged in every case measured here:**
   - #1, instance+code: charged 13.0% below the simulated resource fee;
   - #10, persistent control: charged 21.9% below;
   - #4, simulated 20+ ledgers earlier and declared at 1.25x: charged 35,299 of the 56,500 declared.

## Implication for ADR-007's x1.25 margin (decided 2026-10-26)

**Decision (Fatih, #385, 2026-10-26):** the recommendation below is accepted. Keep a small retry-only margin, sized
from measurements across several days, and reconcile records what was charged, not what was declared. The margin's
size stays undetermined until those measurements exist.

- Pulling the **declared maximum** (simulated resource fee + inclusion fee) covers the extend. The protocol returns the
  unused part to the engine account, and reconcile passes it back to the user. So the margin protects only against a
  **retry that re-simulates and declares more**, as the ADR expected.
- One day of data shows no simulation under-estimate. That is not proof it cannot happen: the CLI measured rent
  varying ~18% between days (W2-D9-02). **Recommendation:** keep a margin for retries, sized from more measurements;
  it may be smaller than x1.25. Undetermined until measured across days.
- **Reconcile must read the charged fee, not the declared one**:
  - `feeCharged`, plus `rent_fee_charged` and `total_refundable_resource_fee_charged` from the meta;
  - a failed extend still costs the engine the non-refundable fee (1,315 stroops for #5), which pricing must cover (`PH2-E5-03`).

## Transactions

Fees in stroops. "Not charged" = envelope fee − feeCharged. Δ balance is the source's, read from Horizon around each tx.
Inclusion fee 100 everywhere. N = 2,500,000, Δ = 50,000 ledgers (`extendTo`).

| # | Op | Hash | Declared RF (sim RF × k) | Envelope fee | feeCharged | Not charged | Δ balance | Non-ref | Refundable | Rent | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0a | upload Wasm (CLI) | `e41ba097…0309d4` | 17,379,785 (CLI sim) | 17,379,885 | 15,110,003 | 2,269,882 | −15,110,003 | 9,611 | 15,100,292 | 15,100,194 | success |
| 0b | create contract (CLI) | `57be774b…a906` | 108,472 (CLI sim) | 108,572 | 90,633 | 17,939 | −90,633 | 3,199 | 87,334 | 87,236 | success |
| 0c | `seed(1)` (CLI) | `3a2f7a67…71e2` | 143,002 (CLI sim) | 143,102 | 120,981 | 22,121 | −120,981 | 5,678 | 115,203 | 115,193 | success |
| 1 | extend instance+code → N | `efd0e68b…0903` | 344,175,698 (×1) | 344,175,798 | 299,279,425 | 44,896,373 | −299,279,425 | 1,232 | 299,278,093 | 299,278,093 | success |
| 2 | extend persistent → N | `9fdc602c…32b2` | 3,604,176 (×2 of 1,802,088) | 3,604,276 | 1,563,116 | 2,041,160 | −1,563,116 | 1,215 | 1,561,801 | 1,561,801 | success |
| 3 | extend persistent → N again | `3d2fc888…6da1` | 1,802,088 (= #2's sim; own sim 7,481) | 1,802,188 | 2,588 | 1,799,600 | −2,588 | 1,215 | 1,273 | 1,273 | success |
| 4 | extend persistent → N+Δ, stale sim (+20 ledgers) | `6792676b…edd2` | 56,500 (×1.25 of 45,200) | 56,600 | 35,399 | 21,201 | −35,399 | 1,215 | 34,084 | 34,084 | success |
| 5 | extend persistent → N+2Δ, under-declared | `ebcb2eb5…85cb2` | 22,599 (×0.5 of 45,198) | 22,699 | 1,315 | 21,384 | −1,315 | 1,215 | 0 | 0 | **failed** `insufficient_refundable_fee` (landed on chain; not refused at submission) |
| 10 | extend persistent → N+2Δ, control for #2 | `0fb0f4a5…68b9` | 45,202 (×1) | 45,302 | 35,389 | 9,913 | −35,389 | 1,215 | 34,074 | 34,074 | success |
| 6 | `approve(S2→S1, 100 XLM)` | `27b2964a…f1f8` | 34,253 (×1) | 34,353 | 26,204 | 8,149 | −26,204 (S2) | 3,807 | 22,297 | 21,769 | success |
| 7 | `transfer_from` 1 XLM S2→S1 | `793d1215…c35b` | 27,614 (×2 of 13,807) | 27,714 | 9,032 | 18,682 | +9,990,968 (= +10,000,000 − 9,032) | 8,453 | 479 | 0 | success |
| 8 | `transfer_from` 200 XLM (over the cap) | `4b1ad59d…e04a` | 27,614 (×2 of 13,807) | 27,714 | 8,553 | 19,161 | −8,553 | 8,453 | 0 | 0 | **failed** `trapped` |
| 9 | `approve(S2→S1, 0)` revoke | `833bf08c…4170` | 9,224 (×1) | 9,324 | 4,441 | 4,883 | −4,441 (S2) | 3,813 | 528 | 0 | success |

Full hashes, fee breakdowns and balances: `raw/tx-setup.json`, `raw/tx-1-to-10.json`.

Run order: 0a, 0b, 0c, 1, 2, 3, 4, 5, 10, 6, 7, 8, 9 (plan revision of 2026-10-21; #10 added as the control for #2).

## Method

- 0a–0c used the `stellar` CLI's own simulation; their Δ balance is from Horizon readings (S1 started at Friendbot's
  10,000 XLM).
- 1–10 used `@stellar/stellar-sdk` 17.0.1 (`raw/run.mjs.txt`, kept byte-for-byte as run and stored as text so lint does not treat it as repo code): simulate, set `resourceFee` to k × the simulated
  `minResourceFee`, sign, send, then read back with `stellar tx fetch fee|meta|result`.
- Footprints for the extends come from a `get_persistent` simulation (instance, code and the `Persistent` key).
- #8 reuses the footprint and source-account auth of a valid 1 XLM `transfer_from` simulation, with the amount
  raised over the allowance. Simulating the over-cap call itself fails, so it could not be built otherwise.

## Undetermined

- **Why #8 trapped.** It is expected to be the SAC's allowance check, but diagnostic events are not stored on chain,
  so the over-cap cause is not proven by this record.
- **Whether simulation can under-estimate.** Every case measured here over-estimated; that is one day on testnet.
- **Mainnet:** fee parameters differ, and nothing was run there.
