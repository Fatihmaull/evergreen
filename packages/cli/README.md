# `evergreen` (CLI)

```bash
npx @evergreen-stellar/cli scan <contract-id>
```

Reports remaining TTL, projected archive date, and estimated rent cost for a Soroban contract. Human-readable by default, `--json` for scripts and CI.

**Published as `@evergreen-stellar/cli`** — we own the `evergreen-stellar` npm org, so nothing in that scope can be squatted. `private: true` until `W4-D27`, so an accidental publish cannot fire early.

**Only the install line changes; the command does not.** `bin` maps to `evergreen`, so:

```bash
npm i -g @evergreen-stellar/cli && evergreen scan <contract-id>
```

`publishConfig.access` is set to `public` in `package.json` — **scoped packages default to private, and private needs a paid plan.** Without it, publishing either fails or silently ships a private package, and the day to discover that is not `W4-D27`.

## Two stable contracts

The `evergreen-check` GitHub Action consumes nothing but these, so they don't change casually once published:

- **Exit code** — `0` healthy, non-zero when any contract is below threshold.
- **`--json` output shape.**

## Safety

Anything that can submit a transaction defaults to dry-run. Live submission needs an explicit flag (CLAUDE.md hard rule 6).
