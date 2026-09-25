# Evidence index — Evergreen, Stellar Instawards

**For the Ambassador Chapter Lead.** One row for every evidence item in SOW §6.1,
in §6.1's own order. The **first link in each row opens in a browser** — a
screenshot, a live page, a transaction on the explorer. The machine-verifiable
record sits behind it for anyone who wants it.

**Nothing on this page needs a terminal.** Commands live one level down, in the
records themselves.

| | |
|---|---|
| Project | Evergreen — a Soroban state-archival autopilot |
| Team | Apex — Fatih Maulana, Rakha Dhifiargo |
| Network | **Stellar testnet only.** No mainnet path exists in this build |
| Repository | https://github.com/Fatihmaull/evergreen |
| The SOW itself | [`docs/SOW.md`](SOW.md) |

> **§6.2 asks whether each deliverable's evidence is Present, Partial or Missing.**
> Our own reading is stated at the head of each section — including where it is
> partial, and why. We would rather name a gap than have it found.

---

## Deliverable 1 — Core CLI

> **Our reading: Partial.** Three of four items are complete. The npm package is
> the fourth and it is the last thing outstanding.

| # | §6.1 asks for | Open this | Behind it |
|---|---|---|---|
| 1 | Public repository | **[github.com/Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen)** — MIT, CI green | — |
| 2 | Published npm package | ⬜ **not yet published** — see below | [dry-run record](evidence/2026-09-15-publish-dry-run/README.md) |
| 3 | CLI screenshots showing TTL, archive prediction and cost | **[Four entry types](evidence/2026-09-14-d1-capture/capture-1-four-entry-types/1.png)** · **[JSON output](evidence/2026-09-14-d1-capture/capture-2-json/1.png)** · **[Storage advice](evidence/2026-09-14-d1-capture/capture-3-storage-advice/1.png)** · **[Blast radius](evidence/2026-09-14-d1-capture/capture-4-blast-radius/1.png)** · **[Error handling](evidence/2026-09-14-d1-capture/capture-5-error-handling/1.png)** | [what each shows](evidence/2026-09-14-d1-capture/README.md) |
| 4 | Test coverage report | **[coverage report](evidence/2026-09-10-coverage/coverage-report.txt)** — 93.24% statements, 85.29% branches, 97.64% functions, 94.57% lines | [how it was produced](evidence/2026-09-10-coverage/README.md) |

**On item 2, plainly:** the package is built, packed and rehearsed — installed
into a clean directory from its tarball and run there, twice, most recently at
the release candidate. What has not happened is the publish command itself. When
it lands, this row carries a registry link and D1 is complete.

---

## Deliverable 2 — Auto-Bump Engine (non-custodial, testnet)

> **Our reading: Present on all four §6.1 items — with one honest qualification
> below, which belongs to §4.1's description rather than to the evidence list.**

| # | §6.1 asks for | Open this | Behind it |
|---|---|---|---|
| 5 | Testnet `extendTTL` transaction hashes | **[The unattended save](https://stellar.expert/explorer/testnet/tx/dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128)** — the engine decided and submitted on its own · **[the first manual extension](https://stellar.expert/explorer/testnet/tx/e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a)** | [full table](EVIDENCE.md) with raw RPC for each |
| 6 | Engine logs / auto-bump execution logs | **[Explorer view of the save](evidence/2026-09-14-scheduled-a-save/explorer.jpg)** · **[what the run did](evidence/2026-09-14-scheduled-a-save/README.md)** | `attempt.jsonl`, per-decision records, 32 raw RPC files, `SHA256SUMS` in that directory |
| 7 | Alert screenshots | **[Success alert in the inbox](evidence/2026-09-22-alert-screenshots/success-alert-inbox.png)** · **[Critical refusal alert](evidence/2026-09-22-alert-screenshots/shared-code-refusal-alert-inbox.png)** | [provenance](evidence/2026-09-22-alert-screenshots/README.md) — Resend IDs tie each image to the send record |
| 8 | Policy-signer configuration guide | **[`docs/POLICY-SIGNER.md`](POLICY-SIGNER.md)** — what the signer path is today and what it is not | [feasibility report](W3-POLICY-SIGNER-FEASIBILITY.md) · [ADR-002](adr/ADR-002-policy-signer-provider.md) |

### The one thing we want to say before you find it

**§4.1 describes Deliverable 2 as using a capped policy-signer. That capability
is not delivered, and we are not claiming it.**

The Week 3 spike established why, and it is a property of Soroban rather than of
the library we chose: **contract-level authorization does not constrain the
signature on the native transaction that pays for `extendTTL`.** A smart account
can police what a contract call may do; it does not police the ordinary payment
that funds the TTL extension. So a policy signer of that shape does not actually
cap the key it was meant to cap.

What ships instead is the path that was verified end to end: a plain funded
account that the self-hoster owns and funds. `POLICY-SIGNER.md` documents exactly
that, its hot-key limits, and what a future hardened path would require — rather
than describing a capability that does not exist. Full scoping is scheduled for a
follow-on.

**The two strongest pieces of evidence here are both refusals**, which is worth a
moment: the engine detected guinea-pig B below its threshold and **declined to
act**, because B was the decay subject and extending it would have destroyed the
proof. The same guard refused to extend a shared code entry. A tool that knows
what not to touch is the one worth putting near production.

---

## Deliverable 3 — Dashboard, CI check, docs and demo

> **Our reading: Partial. Three of five are complete.** The demo video is not
> recorded, and the npm links fill the moment Deliverable 1's publish lands.

| # | §6.1 asks for | Open this | Behind it |
|---|---|---|---|
| 9 | Live testnet dashboard | **[evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/)** — paste any contract ID, no wallet, no signup, no account | [landing page](https://evergreen-stellar.pages.dev/) · source in `apps/` |
| 10 | Published `evergreen-check` GitHub Action | **[`action.yml`](../action.yml)** — add it to a workflow and the job fails when an entry is at or below your threshold | [how to use it](../README.md#use-it-in-ci) · [demo workflow](../.github/workflows/evergreen-check-demo.yml) — see the note below |
| 11 | 3–5 minute demo video | ⬜ **not yet recorded** — see below | [script](W4-D28-01-DEMO-SCRIPT.md), timed at 4m20s |
| 12 | Documentation | **[README](../README.md)** — what it is, install, quickstart · **[dashboard](https://evergreen-stellar.pages.dev/)** | [setup](SETUP.md) · [conventions](CONVENTIONS.md) · [ADRs](adr/) |
| 13 | Links to the published npm packages | ⬜ **fills with item 2** | — |

**On items 11 and 13, plainly:** the demo script is written and timed; its one
remaining dependency is the install line, which resolves when the package
publishes. Item 13 is the same publish.

**On item 10, one thing we would rather say than have noticed.** The Action is
complete and usable, and the linked demo workflow — which runs it against a real
contract twice, once where it must pass and once where it must fail — **has not
been run yet.** It installs the CLI from the registry, so it cannot run until the
package in Deliverable 1 is published. Nothing about the Action is waiting; the
recorded green-and-red pair is.

---

## The proof we would point to first

If only one thing is read, we would choose this: **a contract was watched from
health into expiry, and every step was recorded at the time rather than
reconstructed.**

| observed (UTC) | remaining TTL | what the engine did |
|---|---|---|
| Sun 2026-09-20 12:00:29 | **17,279 ledgers** | detected it below threshold, **refused to extend** |
| Mon 2026-09-21 00:00:19 | **8,641** | refused |
| Mon 2026-09-21 06:00:30 | **4,319** | refused |
| Mon 2026-09-21 12:00:35 | **expired** | — |

Roughly a halving at each step, on a contract nobody touched. Two operators
captured independently at the first three. **[The closing
record](W3-B-WATCH-CLOSING.md)** describes the watch, including what went wrong
with it — a machine that slept through part of the window — because the honest
version is more useful than the tidy one.

A second contract, guinea-pig C, is on the same path on **25–26 September** as
the documented spare.

---

## Where the rigour is, if you want it

Everything above is backed by sealed records rather than by our word. This is the
part that needs a terminal, and **none of it is required to assess the evidence.**

- **Every capture is a sealed bundle**: raw RPC responses, a manifest, and
  `SHA256SUMS` over its own contents. `shasum -a 256 -c SHA256SUMS` in any
  evidence directory re-checks it.
- **The repository gates its own evidence.** `pnpm check` runs eighteen checks,
  one of which — `check:sow` — verifies that each §6.1 item above actually
  exists, and reports this page's Present/Partial reading independently of this
  page.
- **59 dated evidence directories** under [`docs/evidence/`](evidence/), one per
  observation, none edited after the fact.
