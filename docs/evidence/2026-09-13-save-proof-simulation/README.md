# W3-D18-02a — save proof, simulation half

2026-09-13, guinea-pig A. **Nothing signed, nothing submitted.**

Scheduled before Sep 20 deliberately: the save is Deliverable 2's headline claim
and had one point of failure. Finding a broken save path on Sep 21 costs a week
that does not exist.

## Result

```
EXTEND  AAAABgAAAAEblswW…  CRITICAL — At or below action threshold (1,500,000 ledgers)
SKIP    AAAAB8flXwrYnvsG…  REFUSED BY WRITE GUARD — shared ContractCode entry

target        1,700,000   capped: false
fee           59,176 stroops   (cap 2,000,000)
outcome       simulated        mode: dry-run
liveness      critical, isAlarm: true      exit 1
```

`exit 1` is correct and documented: a **successful low-TTL simulation still
alarms**, because simulating a save is not saving anything.

## Why the numbers are shaped this way

A was extended to ~2026-12-01 by the live transaction in #105, so **it will not
approach a threshold on its own.** The action threshold is raised above A's
remaining TTL (~1,367,663) so the engine genuinely detects it as due. A's TTL is
not faked and nothing was written to make this true.

**The target must clear the raised threshold** — Rakha's correction in #120. A
target of 518,400 under a 1,500,000 threshold would extend to a value still
below its own alert line, and the engine would re-propose it forever. Hence
1,700,000.

## 🎬 Narration (`W4-D28-01`)

Say it plainly: *"we raised the alert threshold above its remaining TTL so the
engine would fire."* Implying natural decay on A would be a false claim to a
funder, and the honest version costs nothing — **detection and the save are
real, the timing was arranged.** The genuinely unattended decay is B, on Sep 21,
and it is better evidence precisely because nobody arranged it.

## What is left, and who has it

**The signature.** Live execution needs `mode=live`, `--submit`, an attempt
journal, and the secret for `GCEUQTTH53VM…` — Rakha's dev payer, in
`EVERGREEN_SIGNER_SECRET`. Everything up to the signing boundary is proven here.

Command:

```bash
pnpm engine:execute --config evergreen.config.save-proof.json --dry-run
```
