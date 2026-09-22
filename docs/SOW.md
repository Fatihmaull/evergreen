# The SOW — the document that grades this project

**This is the primary source. Until 2026-09-22 it was not in the repository at all.**

Every deliverable requirement in `docs/EVIDENCE.md`, `docs/PRD.md` and `BACKLOG.md` was a
*restatement* of a document nobody here could open. Three restatements agreed, which is why
the drift went unnoticed for seven weeks — agreement between copies is not the same as
agreement with the source.

| | |
|---|---|
| Source of record | [`sow/Evergreen-Instawards-SOW.pdf`](sow/Evergreen-Instawards-SOW.pdf) · [text](sow/Evergreen-Instawards-SOW.txt) |
| `sha256` (pdf) | `9cbf1c2447c0fbdd9363ee0f38b179e02b1057908a88ab75b6a9d6ae0a621714` |
| Project | Evergreen: a Soroban State-Archival Autopilot |
| Team | **Apex** |
| Primary contact | Fatih Maulana — fatihmaulanamail@gmail.com |
| Ambassador Chapter | Indonesia · **Lead: Kenny Rivaldi** |
| Submitted | 2026-07-31 |
| Suggested sprint start | **2026-08-17** — superseded; actual start 2026-09-03, so the 30 days run to **2026-10-02** |
| Budget | $4,800 — 6 h/day × 30 days × $30/h |

> ⚠️ **The Oct 2 deadline is derived, not quoted.** The SOW names only a *suggested* start of
> 2026-08-17 and a 30-day window. The actual start was agreed at 2026-09-03. `docs/PRD.md:203`
> already flagged that this wants a confirmation message to Kenny Rivaldi so the Ambassador
> side's records match. **That confirmation has still not been sent.**

---

## §6.2 — how this is actually graded

This is the part the repo never had, and it changes how the remaining days should be spent.

> *"For each deliverable, the Ambassador Chapter Lead will assess whether evidence is present
> and sufficient."*

| Deliverable | Evidence Present | Evidence Partial | Evidence Missing | Comments |
|---|---|---|---|---|
| Deliverable 1 | ☐ | ☐ | ☐ | |
| Deliverable 2 | ☐ | ☐ | ☐ | |
| Deliverable 3 | ☐ | ☐ | ☐ | |

**Three rows, three states each. There is no itemised pass/fail.** A deliverable is graded as a
whole by one person, and §6 sets the standard for that person explicitly:

> *"Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead
> **with minimal technical expertise**."*

Two consequences, and both should drive scheduling:

1. **Breadth beats depth.** One missing evidence *type* can pull an entire deliverable from
   Present to Partial, no matter how strong the other four are. Never cut a whole evidence
   type to buy depth in another — that trade loses a row.
2. **A JSON file is not evidence to this reader.** `inbox-confirmation.json` containing a
   colleague's chat reply fails the "minimal technical expertise" clause on its own terms,
   independently of the word *screenshots* in §6.1.

---

## §6.1 — required evidence, quoted

**Deliverable 1 — Core CLI (`evergreen`)**

> *Evidence type:* "GitHub repository, npm package, CLI screenshots, and test coverage report"
>
> *Description:* "Public repository, published npm package, sample scan output showing TTL,
> archive prediction, and cost estimates, along with unit test coverage."

**Deliverable 2 — Auto-Bump Engine (non-custodial, testnet)**

> *Evidence type:* "Testnet transaction hashes, engine logs, **alert screenshots**, and setup
> documentation"
>
> *Description:* "Proof of successful `extendTTL` transactions on Stellar testnet, auto-bump
> execution logs, alert notifications, and **policy-signer configuration guide**."

**Deliverable 3 — Dashboard + CI Check + Docs / Demo**

> *Evidence type:* "Dashboard URL, GitHub Action, demo video, documentation, and npm links"
>
> *Description:* "Live testnet dashboard, published `evergreen-check` GitHub Action, complete
> documentation, a 3–5 minute demo, and links to the published npm packages."

**The repo's restatements were substantively accurate.** Checked clause by clause against the
source: no requirement was invented and none was dropped. `alert screenshots` is verbatim, so
the reading that JSON receipts could substitute was wrong.

---

## §4.1 — what the deliverables are, quoted

**D1** — "A TypeScript-based npm package and CLI for scanning a contract's ledger entries
through Soroban RPC. It reports remaining TTL, estimates archive timing and rent cost, and
highlights potential storage inefficiencies. The package includes JSON and human-readable
output, unit tests, and a quickstart README."

**D2** — "A monitoring service that watches contract TTLs and automatically submits `extendTTL`
before they expire. It uses a **capped policy-signer**, applies configurable threshold rules,
and supports webhook or email alerts. The workflow is fully validated on Stellar testnet."

**D3** — "A lightweight dashboard displaying contract status, bump history, and estimated
storage costs. The deliverable also includes the `evergreen-check` GitHub Action, complete
documentation, a 3–5 minute demo video, and published npm packages."

> 🔴 **The capped policy-signer is named in D2's own description, not only in its evidence
> list.** `docs/adr/ADR-002-policy-signer-provider.md:62` read this correctly. ADR-002's
> pre-authorised exit — ship the core proof and document policy scoping as partial, deferring
> full scoping to SOW 2 — remains available, but it is a *Partial* on D2, not a free pass.

---

## §4.1 — explicitly OUT of scope

Quoted, because it tells us what we do **not** owe, and three of these have consumed
sprint time:

> "This does not include production mainnet auto-bump, real billing, hosted billing or rent
> management, enterprise APM, multi-sig custody, support for non-Soroban chains, or formal
> verification/audit tooling. These are planned for a later phase."

---

## §5.1 — weekly expected output, quoted

| Week | Expected output |
|---|---|
| 1 | "Working monorepo with an initial scan command running on testnet, including TTL analysis, archive prediction, cost estimation, and the first technical specification draft." |
| 2 | "Successful TTL extension on testnet with transaction hashes as proof, accurate predictions, and optimizer recommendations for storage improvements." |
| 3 | "Fully functional auto-bump workflow that prevents state archival on testnet, complete with transaction proofs, alert notifications, and **validated non-custodial authorization**." |
| 4 | "Live dashboard on testnet, published GitHub Action and npm packages, complete documentation, demo video, and a project ready for review." |

§5.1 is a *plan*, not the evidence contract — §6 is. It is recorded here because Week 3's
"validated non-custodial authorization" is the clearest statement anywhere of what the policy
signer was promised to be.

---

## §8 — constraints acknowledged

> "This scope will be completed within 30 days or less. Instawards support execution, not
> open-ended exploration. A project may receive no more than two follow-on Instawards. Each
> Instaward is capped at $5,000. Total Instawards funding may not exceed $15,000."

## §7.1 — anticipated next step

Options offered: Apply to SCF Build Award · Continue development independently · Apply for a
follow-on Instaward (if eligible) · Seek other ecosystem support · Other. **No selection is
marked in the submitted PDF.**
