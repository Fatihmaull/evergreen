# Deliverable 1 §6.1 — scan capture showing TTL, archive prediction and cost

Captured 2026-09-13 against guinea-pig A, which runs to ~2026-12-01 and will not
archive under a reviewer.

All four recapture conditions from [`docs/EVIDENCE.md`](../../EVIDENCE.md) are
met **except the screenshot**, which needs a human at a terminal.

| §6.1 requirement | in this capture |
|---|---|
| TTL | ✅ 4 entries, `remaining:` on each |
| archive prediction | ✅ 4 × `expires ~` |
| cost | ✅ total, rent and non-refundable fee, split |
| both output modes | ✅ [`scan-human.txt`](scan-human.txt) + [`scan.json`](scan.json), both exit 0 |
| all four entry types | ✅ instance, persistent, temporary, code |
| **real terminal screenshot** | ❌ **outstanding — see below** |

## The command

```bash
pnpm cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  --keys-file docs/evidence/2026-09-08-scan-entry-types/data-keys.json \
  --cost --ledgers 518400
```

Add `--json` for the machine-readable mode. Exit 0 in both.

## What the cost block says

```
Cost to extend 4 entries by 518,400 more ledgers
  total   about 0.83 XLM  (8,311,540 stroops) — what leaves the account
    rent  about 0.83 XLM  (8,264,288 stroops)
    fees  about 0.0047 XLM  (47,252 stroops) — non-refundable resource + base fee
  98% of that rent is one entry (AAAAB8flXw…)
```

That last line is `W4-D28-01`'s closing beat, measured rather than asserted: the
**one entry every contract shares is simultaneously the biggest availability
risk and the biggest line item.**

## ❌ Outstanding: the screenshot — Fatih's, and the gate is Wed Sep 16

`EVIDENCE.md` is explicit that a rendered image of saved stdout is not a
screenshot, and that a reviewer comparing §6.1's wording to the artifact should
not have to accept a substitution. So this needs a photograph of a real
terminal.

**What to capture, exactly:**

1. Run the command above in a real terminal, wide enough that **no line wraps**
   — the cost block is the part that matters and it is the widest.
2. The frame must include the **command line itself** and the **whole cost
   block**, down to the `98% of that rent is one entry` line.
3. Then run it again with `--json` and capture that too.

**Where it goes:** this directory, as `scan-human.png` and `scan-json.png`.

**What would make it unusable:** a cropped cost block, wrapped lines, or a
capture taken from a different contract. If what you already have on your
machine was taken *before* `--cost` landed, it will not show a cost figure at
all and is superseded — recapture rather than commit it.
