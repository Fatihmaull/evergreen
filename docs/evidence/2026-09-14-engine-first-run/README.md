# Engine first live run — 2026-09-14

`W3-D15-01`'s decision pass, against live Testnet. **Decide-only: nothing signed,
nothing submitted.**

This is the first code in the project that selects targets without a human
choosing them, so it was watched rather than assumed.

## The Sep 20 sequence, rehearsed six days early

| input | result |
|---|---|
| A, default threshold 17,280 | both entries `SKIP` — above threshold |
| A, threshold raised to 1,500,000 | A instance `EXTEND`; **shared code entry REFUSED** |
| A + B, threshold raised | A `EXTEND`; **B REFUSED**; **shared code REFUSED** |

The third row is `W3-D18-02b`'s Sep 20 sequence: the engine detects B below
threshold, and the guard refuses. **Proven on live chain before the date rather
than on it**, which is the point of de-risking early.

Note the second row: even scanning A alone, the shared `ContractCode` entry is
refused — because the guard matches by **ledger key**, not by consumer list. A
single-contract scan reports one consumer, which is exactly how the first
version of that guard let `extend A --include-code` through.

## How `W3-D18-02a` triggers honestly

A was extended to ~2026-12-01 by the live transaction in #105, so **it will not
approach a threshold on its own**. The save proof works by raising the
*threshold* above A's current TTL — not by faking a TTL, and not by touching the
chain:

```
bumpWhenRemainingLedgersBelow: 1_500_000     # A has ~1,386,937 remaining
```

The engine then genuinely detects A as below *that* threshold and decides to
extend. **This must be narrated exactly that way** — "we raised the alert
threshold above its remaining TTL so the engine would fire" — and not implied as
natural decay. See `W4-D28-01`.

## Reproducing

`engine-probe.mjs` here must be copied into `packages/cli/` to run, because the
repo root cannot resolve workspace dependencies.
