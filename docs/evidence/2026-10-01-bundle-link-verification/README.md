# Bundle link verification — 2026-10-01 (`B-D30-01`)

Every link on the three surfaces an assessor actually reads —
[`B-D30-01-HANDOVER.md`](../../B-D30-01-HANDOVER.md),
[`SUBMISSION-INDEX.md`](../../SUBMISSION-INDEX.md) and
[`SUBMISSION-WALKTHROUGH.md`](../../SUBMISSION-WALKTHROUGH.md) — checked for
**existence**, not for syntax.

**Result: 57 of 57 resolve.** 18 of 18 external URLs return 200; 39 of 39
repository files exist. Full output in [`verification-run.txt`](verification-run.txt).

## Why this run exists

`check:links` checks **reciprocal** links — that documents point at each other
both ways. It does not check that a URL opens. Link-existence is parked as
`B-D31-02`, deliberately, for after submission. So until this run, **nothing in
the repository answered the only question that matters to the Chapter Lead: does
this link open when I click it?**

## Two hosts whose answers meant nothing

The point of this record. Both were found by testing the checker against a
target that must fail, rather than by trusting a green result.

| host | what it returns for a **real** target | for a **fabricated** one | usable? |
|---|---|---|---|
| `npmjs.com` | 403 | 403 | **no** — bot protection answers both identically |
| `stellar.expert` | 200 | **200** | **no** — a single-page app serves its shell before knowing the hash |
| `registry.npmjs.org` | 200 | 404 | yes |
| `horizon-testnet.stellar.org` | 200 | 404 | yes |

**`stellar.expert` is the one that mattered.** Deliverable 2's primary evidence is
two `extendTTL` transaction hashes, and the explorer link is what a reader clicks.
A checker trusting its 200 would have reported those two hashes verified **whether
or not the transactions existed** — the precise failure this project has recorded
twice before, where a check that cannot fail and a check that passes look the same.

Both hashes were re-verified against Horizon, which does discriminate:

| hash | ledger | closed | successful |
|---|---|---|---|
| `dae63da8…369128` | 4,670,261 | 2026-09-14T08:34:52Z | yes |
| `e18e0822…a4115a` | 4,626,423 | 2026-09-11T19:41:42Z | yes |

## Commissioned before it was believed

A clean sweep is a hypothesis about the instrument until the instrument is shown
to fail. Three faults were injected into a scratch copy of the index and all three
were caught, while a live control stayed green:

| injected | caught as |
|---|---|
| a GitHub release tag that does not exist | `404` |
| `@evergreen-stellar/cli@0.1.2` — never published | `404` (via the registry reroute) |
| a repository path that does not exist | `MISSING` |
| **control:** the real demo video URL | stayed `200` |

Exit code went to `1`. The fabricated transaction hash was **not** caught before
the Horizon reroute was added, and is caught after — which is what justified it.

## Re-running it

```bash
pnpm verify:bundle-links
```

**Deliberately not part of `pnpm check`.** It needs the network, and a gate that
fails because a third-party host is slow would block merges for a reason that has
nothing to do with the change under review. Run it by hand before sending.
