# `W2-D9-02` — rent model validated against a real transaction's actual fee

**2026-09-10.** The model is compared against the three real `ExtendFootprintTTLOp` transactions recorded on 2026-09-09 in [`extendTTL-fees-guinea-pig-a.json`](../../../packages/core/test/fixtures/extendTTL-fees-guinea-pig-a.json).

**Read-only.** `simulateTransaction` prices a prepared transaction and submits nothing: no signature, no sequence consumed, no chain state changed. The source account is used for its public key only. Guinea-pigs B and C and the shared `ContractCode` entry were not involved.

## The result

Guinea-pig A's instance entry, 1,425,485 ledgers remaining at ledger 4,600,104:

| Target `extendTo` | Delta needed | Baseline fee | Fee at target | **Rent** | Stroops per delta-ledger |
|---|---|---|---|---|---|
| 1,000,000 | 0 | 11,708 | 11,708 | **0** | — (no extend needed) |
| 2,000,000 | 574,515 | 11,708 | 91,309 | **79,601** | 0.13855 |
| 3,110,400 | 1,684,915 | 11,708 | 239,106 | **227,398** | 0.13496 |

**Recorded real extend, 2026-09-09:** 154,503 stroops over 1,312,941 ledgers = **0.11768** per ledger.

**Verdict: the model agrees to within ~18%.** The backlog's bar is *"worthless if it's off by an order of magnitude"* — it is off by a factor of 1.15–1.18. The residual is expected rather than unexplained: the recorded extend was priced by the network on Sep 9 and these simulations on Sep 10, and Soroban rent pricing varies with network state. **That variance is itself the argument for simulating rather than computing** — a coefficient fitted to Sep 9 would already be 18% wrong by Sep 10.

## Two findings that changed the implementation

### `extendTo` is a target remaining TTL, not a delta

Verified on chain: targets at or below an entry's current remaining priced *identically* to each other, and only targets above it scaled with the gap. A model treating `extendTo` as "extend by N" would overcharge every entry that already has headroom — and would report a cost for an operation that does nothing.

### Rent is now the DIFFERENCE between two simulations, and needs no constant

The first implementation subtracted a measured non-refundable constant (2,237–2,359 stroops across the three recorded extends) to isolate rent from the operation's fixed cost. Running it exposed the flaw: **it reported 9,349 stroops of "rent" for an extend that needed none.**

A constant that is correct for the transactions it was measured on is still a fitted number — the same trap [the fee fixture warns about](../../../packages/core/test/fixtures/extendTTL-fees-guinea-pig-a.json) when it says *"do NOT fit a coefficient to this."*

The fix removes the constant entirely. `extendTo: 1` is a target any live entry already satisfies, so simulating it prices the operation's fixed cost with **zero rent in it**; subtracting that isolates rent exactly, whatever the fixed cost currently is. The no-op case now correctly prices **0**, and both simulated fees are reported in the quote so the subtraction is visible rather than implied.

## What this does not establish

- **One entry type, one contract, one day.** The instance entry of guinea-pig A. Persistent and temporary entries are priced by the same path but were not re-validated here; the recorded fixture shows durability is a first-order term, so their rates differ.
- **It does not pin a formula, deliberately.** The per-delta-ledger rate moved between the two simulated targets (0.13855 → 0.13496) and again against the recorded value. Three or five points still do not determine how rent scales — the fixture's `size-scaling-unresolved` observation stands.
- **`minResourceFee` is a simulated minimum**, not a guaranteed charge. A submitted transaction is priced at execution.
