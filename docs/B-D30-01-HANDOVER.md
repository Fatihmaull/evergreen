# Evergreen — evidence handover

**For Kenny Rivaldi, Ambassador Chapter Lead.** Everything needed to complete the
Instawards assessment form. **Nothing here needs a terminal, an account or a wallet.**

| | |
|---|---|
| Project | Evergreen — a Soroban state-archival autopilot |
| Team | Apex — Fatih Maulana, Rakha Dhifiargo |
| Engagement | 2026-09-03 → 2026-10-02 |
| Network | **Stellar testnet only.** No mainnet path exists in this build |
| Repository | https://github.com/Fatihmaull/evergreen |

---

## Start here — pick one

| | |
|---|---|
| ▶ **[Watch the 4-minute demo](https://youtu.be/MIv26uSiOAQ)** | All three deliverables in one sitting. The fastest way to form a view |
| 🧭 **[Walk the evidence](SUBMISSION-WALKTHROUGH.md)** | Ten steps, ~10 minutes, saying at each step what seeing it *proves* |
| ☑ **[Check coverage](SUBMISSION-INDEX.md)** | One row per §6.1 evidence item, browser-openable artifact first |

**The video and the walkthrough cover the same ground.** Watching it first and then
spot-checking two or three steps is a faster and better assessment than reading
straight down.

---

## §6.2 — the three rows, and our own reading

§6.2 grades **per deliverable, not per artifact**: three rows, each *Present /
Partial / Missing*. One missing evidence **type** pulls a whole deliverable down,
however strong its siblings are.

| Deliverable | Our reading | Evidence items |
|---|---|---|
| **1 — Core CLI** | **Present** | 4 of 4 |
| **2 — Auto-Bump Engine** | **Present** | 4 of 4 §6.1 items |
| **3 — Dashboard, CI check, docs, demo** | **Present** | 5 of 5 |

**All thirteen §6.1 evidence types exist.** The repository checks this itself and
will say so independently of this page — see *The repository argues with us*, below.

### Deliverable 1 — Core CLI

| §6.1 asks for | Open this |
|---|---|
| Public repository | **[github.com/Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen)** — MIT, CI green |
| Published npm package | **[`@evergreen-stellar/cli`](https://www.npmjs.com/package/@evergreen-stellar/cli)** — `0.1.1` current |
| CLI screenshots: TTL, archive prediction, cost | **[Four entry types](evidence/2026-09-14-d1-capture/capture-1-four-entry-types/1.png)** · **[JSON](evidence/2026-09-14-d1-capture/capture-2-json/1.png)** · **[Storage advice](evidence/2026-09-14-d1-capture/capture-3-storage-advice/1.png)** · **[Blast radius](evidence/2026-09-14-d1-capture/capture-4-blast-radius/1.png)** · **[Errors](evidence/2026-09-14-d1-capture/capture-5-error-handling/1.png)** |
| Test coverage report | **[94.35% statements, 2026-09-27](evidence/2026-09-27-coverage/coverage-report.txt)** |

### Deliverable 2 — Auto-Bump Engine

| §6.1 asks for | Open this |
|---|---|
| Testnet `extendTTL` transaction hashes | **[The unattended save](https://stellar.expert/explorer/testnet/tx/dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128)** — the engine decided and submitted on its own · **[the first manual extension](https://stellar.expert/explorer/testnet/tx/e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a)** |
| Engine / auto-bump execution logs | **[What the run did](evidence/2026-09-14-scheduled-a-save/README.md)** · **[explorer view](evidence/2026-09-14-scheduled-a-save/explorer.jpg)** |
| Alert screenshots | **[Success alert](evidence/2026-09-22-alert-screenshots/success-alert-inbox.png)** · **[Critical refusal alert](evidence/2026-09-22-alert-screenshots/shared-code-refusal-alert-inbox.png)** |
| Policy-signer configuration guide | **[`POLICY-SIGNER.md`](POLICY-SIGNER.md)** |

### Deliverable 3 — Dashboard, CI check, docs, demo

| §6.1 asks for | Open this |
|---|---|
| Live testnet dashboard | **[evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/)** — paste any contract ID; no wallet, no signup |
| Published `evergreen-check` GitHub Action | **[`Fatihmaull/evergreen@v1`](https://github.com/Fatihmaull/evergreen/tree/v1)** · [a green run and a red run](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235) |
| 3–5 minute demo video | **[4 min 31 s](https://youtu.be/MIv26uSiOAQ)** |
| Documentation | **[README](../README.md)** · [self-host the engine](ENGINE-SETUP.md) · [use the Action](ACTION-GUIDE.md) |
| Links to published npm packages | **[npmjs.com/package/@evergreen-stellar/cli](https://www.npmjs.com/package/@evergreen-stellar/cli)** — one package ships |

---

## What we would rather tell you than have you find

Three things. None of them changes a §6.2 row, and we would rather state them than
have them discovered.

**1 · The capped policy-signer in §4.1 is not delivered, and we are not claiming it.**
The reason is a property of Soroban, not a shortcut: contract-level authorization
does not constrain the signature on the native transaction that pays for
`extendTTL`. A smart account can police what a contract call may do; it does not
police the ordinary payment that funds the extension. So a policy signer of that
shape does not cap the key it was meant to cap. What ships instead is the path that
was verified end to end — a plain funded account the self-hoster owns.
[`POLICY-SIGNER.md`](POLICY-SIGNER.md) documents that path and its limits rather
than describing a capability that does not exist.

**2 · One known limit in the CLI's `--json` output.** For an entry that is already
archived, the structured output still reports a TTL of zero rather than flagging it.
The human-readable output was fixed in `0.1.1`; the JSON is tracked openly as
[#235](https://github.com/Fatihmaull/evergreen/issues/235) and deliberately left
open rather than closed to tidy the count.

**3 · The demo video's dashboard segment is a few hours out of date.** It was
recorded at 13:49 UTC on 2026-09-30; the site's logo landed at 16:17 UTC the same
day. The video shows an empty square where the live page now shows the mark. The
readings on that page are live testnet data in both.

---

## The proof we would point to first

**A contract was watched from health into expiry, and every step was recorded at
the time rather than reconstructed.**

| observed (UTC) | remaining TTL | what the engine did |
|---|---|---|
| Sun 2026-09-20 12:00 | **17,279 ledgers** | detected it below threshold, **refused to extend** |
| Mon 2026-09-21 00:00 | **8,641** | refused |
| Mon 2026-09-21 06:00 | **4,319** | refused |
| Mon 2026-09-21 12:00 | **expired** | — |

Roughly a halving at each step, on a contract nobody touched.

**The two strongest pieces of evidence here are both refusals**, which is worth a
moment: the engine found the contract below its threshold and **declined to act**,
because extending it would have destroyed the proof it existed to produce. The same
guard refused to extend a shared code entry. A tool that knows what not to touch is
the one worth putting near production.

---

## The repository argues with us

You do not have to take our reading on trust. The repository runs a check of its
own, `check:sow`, which looks for each of the thirteen §6.1 artifacts and reports
Present / Partial **independently of this page**. If we quietly marked something
complete here, that check would still say otherwise.

**Every link above was verified to open on 2026-10-01** — 56 links across both
assessor surfaces, all resolving. Two of the hosts involved turned out to answer
identically for a real and a fabricated target, so they were replaced with hosts
that can actually tell the difference; the transaction hashes were re-checked
against Horizon directly. The record, including the faults deliberately injected to
prove the checker works, is
[here](evidence/2026-10-01-bundle-link-verification/README.md).

Every evidence directory is a sealed bundle — raw RPC responses, a manifest and a
`SHA256SUMS` over its own contents, none edited after the fact. **None of that is
required to assess the three rows.**
