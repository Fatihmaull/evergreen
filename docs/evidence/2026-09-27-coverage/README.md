# Test coverage — 2026-09-27, five days before submission

SOW §6.1 asks for a test coverage report under Deliverable 1. One was committed on
[2026-09-10](../2026-09-10-coverage/README.md) and that report stands as its own
dated record. **This is a fresh one, because the figures have moved and the
submission index quotes them.**

## Current

```
All files          |   94.35 |    90.43 |   94.42 |   96.45 |
Statements   : 94.35% ( 1839/1949 )
Branches     : 90.43% ( 1607/1777 )
Functions    : 94.42% ( 254/269 )
```

Full per-directory table: [`coverage-report.txt`](coverage-report.txt). Produced by
`npx vitest run --coverage`, which is what `pnpm test` runs — the floor is evaluated
in CI on every change, enforced since 2026-09-12.

## What changed since 2026-09-10, stated rather than rounded

| | 2026-09-10 | 2026-09-27 | |
|---|---|---|---|
| statements | 93.24% | **94.35%** | ↑ |
| branches | 85.29% | **90.43%** | ↑ **+5.1 points** |
| lines | 94.57% | **96.45%** | ↑ |
| functions | 97.64% | **94.42%** | ↓ **−3.2 points** |

**Three went up and one went down, and the one that went down is worth naming.**
Function coverage fell from 97.64% to 94.42% — 254 of 269 rather than the earlier
ratio — because the codebase roughly tripled in that period (725 statements →
1,949) and the functions added late, in release tooling and evidence scripts, are
less exercised than the core that was written first.

**Branches gained five points over the same period**, which is the number that
matters most for this project: a branch is a decision the tool makes about
somebody's contract, and branch coverage is the measure of how many of those
decisions a test has ever seen.

Nothing here was tuned to make a number look better. The figures are whatever the
suite reports.

## Why a second report rather than an edit

The 2026-09-10 report is a dated artifact and its bytes are not rewritten — the same
rule every capture bundle in this directory follows. A figure that has moved gets a
new record with the delta named, not a quiet correction to the old one.
