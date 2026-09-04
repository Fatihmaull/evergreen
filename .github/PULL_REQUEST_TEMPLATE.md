## What changed

<!-- One task per PR where possible. Reference the backlog task ID. -->

Task: `W?-D?-??`

## How it was verified

<!-- Not "tests pass" — what did you actually observe? Which contract, which
     command, what output? If it touched testnet, say so. -->

- [ ] `pnpm check` green (typecheck + lint + test)
- [ ] Verified against a guinea-pig contract (which one: A / B / n/a)

## Evidence captured

<!-- If this produced a testnet transaction, docs/EVIDENCE.md needs all three
     artifacts: tx hash + full JSON RPC response + explorer screenshot. A hash
     alone is not evidence — testnet resets make explorer links dead. -->

- [ ] `docs/EVIDENCE.md` updated, or n/a
- [ ] `docs/STATUS.md` updated
- [ ] `BACKLOG.md` checkbox flipped

## Checks

- [ ] No secrets in code, docs, tests, or this description
- [ ] Testnet only — no mainnet path added
- [ ] Anything that can submit a transaction still defaults to dry-run
- [ ] Docs updated if user-facing behavior changed
