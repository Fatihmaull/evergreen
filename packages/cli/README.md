# `evergreen` (CLI)

```bash
npx evergreen scan <contract-id>
```

Reports remaining TTL, projected archive date, and estimated rent cost for a Soroban contract. Human-readable by default, `--json` for scripts and CI.

**Published name reserved at `W1-D5-01`; published at `W4-D27`.** `private: true` until then, so an accidental `npm publish` cannot fire early.

## Two stable contracts

The `evergreen-check` GitHub Action consumes nothing but these, so they don't change casually once published:

- **Exit code** — `0` healthy, non-zero when any contract is below threshold.
- **`--json` output shape.**

## Safety

Anything that can submit a transaction defaults to dry-run. Live submission needs an explicit flag (CLAUDE.md hard rule 6).
