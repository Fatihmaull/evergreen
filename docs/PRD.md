# Evergreen — Product Requirements Document

**Project:** Evergreen — a Soroban State-Archival Autopilot
**Team:** Apex — Fatih Maulana & Rakha
**Funding:** Stellar Instawards, $4,800 / 30-day scoped engagement
**Sprint window (official):** 2026-09-03 → 2026-10-02 (30 calendar days)
**Doc owner:** Fatih Maulana (fatihmaulanamail@gmail.com)
**Status:** Team-aligned — open questions resolved 2026-09-04, ready to guide Week 1

---

## 0. Primer — why TTL matters on Soroban (context for new contributors)

Soroban contract data lives in ledger entries that each carry a **Time-To-Live (TTL)**, measured in ledgers remaining, not wall-clock time. Every ledger that passes decrements it. Contracts prepay **rent** in XLM to keep entries alive; extending TTL means topping up that rent via an `ExtendFootprintTTLOp` operation ("extendTTL").[^1]

If TTL hits zero, the entry doesn't just vanish — behavior depends on entry type, but functionally the data is **archived** to off-chain cold storage and becomes unusable until someone submits a `RestoreFootprintOp` to bring it back. Restoring is slower and more expensive than a normal read, because archived entries are treated as disk-based data during recovery.[^1]

Developers currently track and extend TTLs manually. There's no dedicated automation layer for this on Stellar today — that's the gap Evergreen fills.

The Soroban RPC exposes `getLedgerEntries`, which returns a `liveUntilLedgerSeq` per entry; comparing that against the current ledger tells you how much TTL headroom remains.[^2] Non-custodial automation is possible via **smart wallet policy signers** — contract accounts where a policy signer can be scoped to a narrow, capped capability (e.g. "may call extendTTL, may not move funds") instead of holding a full private key.[^3]

---

## 1. Problem Statement

Soroban developers must manually monitor and extend the TTL of every contract's ledger entries or risk unplanned downtime from state archival. Stellar has no native tooling for this, unlike more mature smart-contract ecosystems. The operational burden scales with the number of contracts a team runs, and a single missed extension can archive a production contract, forcing a costly restore before it's usable again.

## 2. Goals

1. Let a developer check any deployed contract's TTL health, projected archive date, and rent cost from a single CLI command (target: under 10 seconds per contract).
2. Prevent state archival on contracts opted into monitoring by automatically submitting `extendTTL` before expiry. This is non-custodial by construction: `extendTTL` is permissionless, so Evergreen never needs — and never asks for — authority over a user's contract (see §6.2 and `docs/SOROBAN-PRIMER.md`).
3. Give a non-technical reviewer (e.g. an Ambassador Chapter Lead) a way to visually verify the system is working — dashboard + CI check, not just logs.
4. Ship all three components as public, installable artifacts (npm packages, a GitHub Action, a live testnet dashboard) within the 30-day Instaward window.
5. Produce evidence — testnet tx hashes, screenshots, a demo video — sufficient to pass Instawards verification and support a follow-on SCF Build Award application.

## 3. Non-Goals (v1, per SOW scope)

- **Mainnet auto-bump** — v1 runs and is validated on testnet only; mainnet is a follow-on phase once the non-custodial signer model is battle-tested.
- **Hosted billing / rent-as-a-service** — Evergreen estimates and reports rent cost; it does not collect payment or manage a billing relationship.
- **Rent subsidy** — Apex never pays another party's extend fees, in any phase. The user always pays their own (ADR-004). This is unbounded cost and it is the hosted-billing non-goal in disguise.
- **A hosted multi-tenant service** — v1 is self-hosted by the user. A single public engine is a genuine SOW 2 direction (ADR-004), but v1 must only avoid foreclosing it, never implement it.
- **Multi-sig custody** — out of scope; the policy-signer model is capped-permission, single-org, not a multi-party custody product.
- **Non-Soroban chains** — Evergreen is Stellar/Soroban-specific; no EVM or other chain support.
- **Formal verification / audit tooling** — Evergreen assumes contracts are already correct; it doesn't try to verify contract logic.

## 4. Users & Personas

Per team decision, Evergreen targets individual developers first, then teams/protocols:

- **P1 — Individual Soroban developer.** Runs one or a few contracts (testnet or a small mainnet deployment). Wants a fast way to check TTL health and avoid surprises without standing up infrastructure. Primary CLI + lightweight dashboard user.
- **P2 — Protocol/team running multiple contracts.** Needs the auto-bump engine and the CI check (`evergreen-check` GitHub Action) so TTL monitoring is enforced automatically in their deploy pipeline, not left to one person's memory.

## 5. User Stories

- As an individual developer, I want to run `evergreen scan <contract-id>` so that I immediately see remaining TTL, projected archive ledger/date, and estimated rent cost.
- As an individual developer, I want JSON output from the CLI so that I can pipe it into my own scripts or CI.
- As a protocol engineer, I want to register a contract for auto-monitoring so that Evergreen submits `extendTTL` automatically once TTL drops below a threshold I configure.
- As a protocol engineer, I want the auto-bump engine to be non-custodial and permission-capped so that I never hand over a key that could move funds — only one scoped to `extendTTL`.
- As a protocol engineer, I want a webhook or email alert when a bump succeeds or fails so that I'm not silently trusting a black box.
- As a CI/CD user, I want `evergreen-check` as a GitHub Action so that a PR or deploy fails loudly if a contract's TTL is dangerously low.
- As an Ambassador Chapter Lead, I want a dashboard showing contract status and bump history, plus a short demo video, so that I can verify the Instaward deliverables without reading code.
- As a new contributor to Apex, I want a documented storage-optimizer report so that I understand which contract entries are costing the most in rent and why.

## 6. System Architecture

Three components, shipped in this order across the 30-day window:

### 6.1 Core CLI (`evergreen`)
TypeScript npm package. Talks to Soroban RPC (`getLedgerEntries`) to read `liveUntilLedgerSeq` per entry, computes TTL-remaining and a projected archive date from network ledger-close time, and estimates rent cost. Outputs both human-readable and JSON. Ships with unit tests and a quickstart README.

### 6.2 Auto-Bump Engine (non-custodial, testnet)
A monitoring worker that watches registered contracts and submits `extendTTL` before expiry.

**Corrected 2026-09-04 — read this before §6.2.1, which was written under the older assumption.** `extendTTL` is **permissionless**: anyone may extend any ledger entry's TTL provided they pay the resource fee ("There is no access control for TTL extension operations" — Stellar state-archival docs). The engine therefore needs no authority over a user's contract at all, and non-custodiality is not something we engineer — it is a property of the chain we inherit. There is no key to hand over and no permission to revoke.

That changes what the capped policy signer[^3] is *for*, without removing it. In v1 the user self-hosts the engine and funds a bot account they own (ADR-004), so the engine's hot key sits on the user's server with the user's lumens on it. Scoping that key to `extendTTL` limits **the user's** blast radius if it leaks. Hence two stages:

- **Stage 1 (critical path, P0):** a plain funded Ed25519 account. Shortest quickstart, and what the README teaches.
- **Stage 2 (off the critical path, SOW-committed):** the capped policy signer per ADR-002, plus `docs/POLICY-SIGNER.md`. Documented and demonstrated, not mandatory.

**Who pays:** the user, always. See ADR-004 — this is precisely how the engine stays clear of the hosted-billing non-goal in §3.

**Architecture recommendation (you asked me to propose this):** build v1 as a **scheduled serverless job** (e.g. a cron-triggered function, checked every 5–15 minutes), not an always-on server.

Reasoning:
- TTL is measured in ledgers, not seconds — Soroban ledgers close roughly every 5–6 seconds, so a contract with any sane safety margin (days of TTL headroom) doesn't need sub-minute reaction time. Polling every 5–15 minutes is more than enough buffer.
- Zero infrastructure to keep alive during a 30-day, part-time-hours engagement — no server to patch, monitor, or pay for if idle.
- Cheaper and simpler to demo/verify: the Ambassador Lead can see scheduled-run logs and tx hashes without needing to trust an opaque long-running process.
- It fits naturally with the CI-check component (§6.3) — both are triggered/scheduled workflows rather than daemons.

This is a v1 default, not a permanent constraint: flag it as a P2/future item if a protocol partner later needs faster reaction (e.g. sub-minute) or higher-frequency contract churn — that's when a long-running service becomes worth the added ops burden.

#### 6.2.1 Policy-signer provider: build vs. buy (resolved 2026-09-04)

The non-custodial part of the engine needs a signer that can be authorized to call `extendTTL` and *nothing else* — never able to move funds. Three real options exist as of this research pass:

| Option | What it is | Testnet readiness | Est. integration effort |
|---|---|---|---|
| **A — `stellar/passkey-kit` (smart-account-kit)** | TypeScript SDK for Soroban smart wallets. Supports Ed25519 keys and **policy signers** with context rules (not only WebAuthn/passkey signers), ships pre-deployed testnet factory/wallet/policy contracts.[^4] Originated at kalepail, now moved under the official `stellar` GitHub org — a strong signal of ecosystem backing. | Good — testnet contracts already deployed, actively maintained. | ~15–25h: learn SDK, use an Ed25519 signer scoped via a policy (skip the passkey/WebAuthn signer type — that's for human browser auth, not our headless bot), wire calls into the auto-bump worker. |
| **B — OpenZeppelin Stellar Contracts (smart accounts)** | Audited Rust framework, context-centric: signers / scope rules / policies as separate concerns. Ships multisig and spending-limit policies out of the box; no "single function allowlist" policy yet, so we'd author a custom `extendTTL`-only policy against their trait.[^5] | Good — actively released, but younger than their EVM-side OZ contracts. | ~25–40h: learn the Rust framework, write + test a custom policy contract, deploy to testnet. |
| **C — Fully custom `__check_auth` contract** | Write our own minimal Soroban authorization contract from scratch, no base framework. | N/A — greenfield. | ~40–60h, plus unaudited-signer risk (this is exactly the kind of contract attackers target). |
| *(infra add-on, either path)* **Launchtube** | SDF-run relayer/fee-sponsorship service for Soroban ops — lets the bot submit ops without holding a funded G-address.[^6] Explicitly labeled **experimental**, "no guarantees on stability." | Available, testnet + mainnet. | Optional; ~4–8h to integrate if we want it. |

**Recommendation: go with Option A (`passkey-kit`/smart-account-kit) for v1.** At $30/hr team rate that's roughly **$450–$750**, versus **$750–$1,200** for Option B or **$1,200–$1,800** for Option C — spending over a third of the entire $4,800 SOW budget on one sub-component (Option C) would starve the CLI, dashboard, and docs. Option A also removes the need to design and deploy our own account contract in Week 3, which is the tightest week on the calendar.

**Risk / fallback:** `passkey-kit` is less battle-tested than OpenZeppelin's audited contracts, and its policy-signer path for a fully headless (non-passkey) bot hasn't been validated by us yet. Treat the first 1–2 days of Week 3 as a spike: confirm an Ed25519-signed, policy-scoped call to `extendTTL` actually works end-to-end on testnet with `passkey-kit`. If it doesn't fit cleanly by day 2 of Week 3, fall back to Option B rather than burning the rest of the week debugging an unproven path. Building a fully custom signer contract (Option C) is explicitly **out of scope for this Instaward** — if the audited/SDK options both prove insufficient, that becomes a candidate feature for a follow-on Instaward (SOW 2) rather than something we improvise under this budget.

### 6.3 Dashboard + CI Check + Docs

The dashboard ships in two layers, and the second must be genuinely removable.

**P0 — public read-only. No wallet, no signup, no accounts.**
- **Scan any contract.** Scanning is a permissionless read, so anyone may paste any contract ID and see TTL health, projected archive date, and rent estimate. `core` already does this and the dashboard already renders `ScanResult`, so it costs close to nothing and makes the deployed instance a real "check my contract's TTL" utility rather than a display case — which is the standard-rent-tooling position we are aiming at, and a far better artifact for a reviewer than a page showing only our own contracts.
- **Bump history for contracts this instance monitors.** Everything else reads "not monitored by this instance."

**P1 — wallet connect + "extend now."** The user signs a payment to extend a contract themselves. Wallet-connect authorizes a *payment*, never *access*. Additive only: the read-only layer must ship complete and shippable on its own — no dead buttons, no auth-gated empty regions — if the write path never lands.

**Scope guard.** The deployed instance is a demonstration instance, **not a service**: no registration, no accounts, no storing strangers' contract IDs, no write path for contracts we do not monitor, and no automated write path ever. If it starts growing toward a service, stop and flag it.

Reads from the same data the CLI/engine produce. `evergreen-check` GitHub Action wraps the CLI's scan so teams can gate CI on TTL health. Plus docs, a 3–5 minute demo video, and published npm packages.

## 7. Requirements

### P0 (must ship — Instaward evidence depends on these)
- CLI: scan command works against Soroban testnet RPC, reports TTL/archive projection/rent estimate, JSON + human output, unit tests, README. *(Deliverable 1)*
- Auto-bump: scheduled worker successfully executes `extendTTL` on testnet; produces verifiable tx hashes; configurable threshold rules. Stage 1 uses a plain funded account and is the critical path. *(Deliverable 2)*
- Capped policy signer (Stage 2) + `docs/POLICY-SIGNER.md`: **SOW-committed but off the critical path** — sequenced after the core proof so a spike failure costs hardening, not the deliverable. If the spike fails, policy scoping ships documented as partial with full scoping deferred to SOW 2. *(Deliverable 2)*
- Alerting: email notification on bump success/failure, built behind a `NotificationChannel` interface so Telegram/Discord/webhook channels can be added later without touching the engine core. *(Deliverable 2)*
- Dashboard: **public read-only** — scan any contract with no wallet, plus bump history for contracts this instance monitors. No signup, no accounts. *(Deliverable 3)*
- `evergreen-check` GitHub Action published and usable in a real repo. *(Deliverable 3)*
- Docs + 3–5 min demo video + published npm packages. *(Deliverable 3)*

### Candidate headline capability — pending measurement (`W2-D12-02b`)

**Shared code-entry detection.** Contracts deployed from identical Wasm share a single `ContractCode` ledger entry (`docs/SOROBAN-PRIMER.md`). That is the factory pattern — per-user vaults, per-pair pools, per-market instances — so one entry expiring breaks every instance at once, while a per-contract scan reports them all healthy right up to the outage.

Detecting and reporting that is already a **P0 correctness requirement** (it lands in the scan, the rent model, the severity model, and the engine's within-run dedupe). The open question is one of *positioning*, and it is being answered empirically rather than assumed: `W2-D12-02b` measures how often deployed testnet contracts actually share code entries.

- **Common** → it is a headline capability and leads the demo. "Your 40 vault contracts share one code entry that expires Thursday" is the kind of non-obvious operational trap that makes tooling worth installing, and it serves the standard-rent-tooling ambition in §2 directly.
- **Rare** → it stays a correctness requirement and a footnote.

### P1 (strongly desired, can slip a few days into follow-on if needed)
- Dashboard wallet-connect + user-signed "extend now". The DX feature and the reason the write path exists at all; if it does not fit, it is the headline of SOW 2, which is a strong position. Spiked early at `W2-D13` so the Week 4 decision is cheap.
- Storage optimizer recommendations (which entries are inefficient / costly).
- Telegram or generic webhook `NotificationChannel` implementation (the interface ships in v1 per P0 above; this is the second concrete channel, likely the first thing built in SOW 2).
- Multi-contract batch scanning in the CLI.

### P2 (explicitly future — do not architect against these blocking v1)
- Mainnet support for the auto-bump engine.
- Long-running/always-on engine mode for high-frequency protocols.
- Multi-sig or DAO-style approval before a bump executes.
- Support for teams managing hundreds of contracts (current design assumes small-to-medium fleets).
- Fully custom (non-SDK) policy-signer contract, only if Option A/B from §6.2.1 prove insufficient.

## 8. Success Metrics

**Leading (check at day 30 / Instaward submission):**
- All 3 deliverables have "Evidence Present" per the SOW's verification checklist (§6.2 of the SOW).
- At least one real testnet contract survives a full monitored TTL cycle with zero manual intervention (auto-bump does the work).
- CLI + Action installable and runnable by someone outside the Apex team following only the README.

**Lagging (check 30–60 days after launch):**
- Evergreen adopted (npm installs / Action usage) by at least one Soroban project outside Apex.
- Instaward evidence accepted by the Ambassador Chapter Lead without a revision cycle.
- Progression to a follow-on SCF Build Award application (per SOW §7.1 next-step alignment).

## 9. Phased Plan (mapped to SOW weekly breakdown, official start 2026-09-03)

| Week | Dates | Focus | Output |
|---|---|---|---|
| 1 | Sep 3 – Sep 9 | Monorepo setup (Jest, ESLint), Soroban TTL/rent/RPC research, initial scan command + cost model | Working monorepo, first scan command on testnet, first tech spec draft |
| 2 | Sep 10 – Sep 16 | Manual `extendTTL`, refine prediction model, storage optimizer, unit tests | Successful testnet TTL extension w/ tx hash proof, optimizer recommendations |
| 3 | Sep 17 – Sep 23 | Auto-bump service (Day 1–2: `passkey-kit` headless-signer spike, see §6.2.1), threshold rules, alerts, end-to-end testnet validation | Fully functional auto-bump workflow, tx proofs, alert notifications |
| 4 | Sep 24 – Oct 2 | Dashboard (public read-only; wallet-connect at P1), `evergreen-check` Action, docs, demo video, npm publish, evidence packaging | Live testnet dashboard, published Action + packages, docs, demo, evidence bundle submitted to Ambassador |

**Deadline: 2026-10-02** (30 calendar days from the official 2026-09-03 start).

## 10. Team & Roles

Apex is Fatih Maulana and Rakha. Budget/compensation split is settled between them outside this doc — what's left is jobdesc. Proposed split, for the two of them to confirm or adjust:

- **Fatih** — CLI (§6.1), dashboard + wallet-scoping (§6.3), docs, demo video, and Ambassador/evidence liaison (he's the SOW's primary contact).
- **Rakha** — Auto-Bump Engine (§6.2), including the passkey-kit spike in Week 3, threshold rules, and the notification-channel abstraction.
- **Shared, all weeks:** testnet evidence collection (tx hashes, screenshots) as work lands — not batched at the end — and the `evergreen-check` GitHub Action, since it depends on both the CLI (Fatih) and the engine's data model (Rakha).

Ambassador Chapter Lead (Kenny Rivaldi, Indonesia chapter) is the evidence reviewer, not a builder on the team.

## 11. Risks

- **Scope creep into mainnet or multi-chain** — mitigated by explicit non-goals above; anything mainnet-flavored gets parked for the SCF follow-on.
- **Policy-signer model turns out more complex than 30 days allows** — if smart-wallet policy signers prove too immature/undocumented, fall back to a simpler capped-key model (a dedicated low-privilege Ed25519 signer with an allowlisted contract function) and document the trade-off; this still satisfies "non-custodial" in spirit if the signer can't touch funds.
- **Solo-to-team ramp** — bringing on contributors mid-sprint costs onboarding time; keep the monorepo and docs unusually clear from Week 1 so a new contributor can ramp same-day.
- **Testnet flakiness** — Soroban testnet RPC/network resets happen; don't hard-code assumptions that break across a reset.

## 12. Open Questions — resolved 2026-09-04

- ~~**(Team)** Who are the other Apex contributors, and how is the budget split?~~ → Fatih + Rakha; compensation settled between them; jobdesc proposed in §10.
- ~~**(Engineering)** Is there stable testnet tooling for the policy signer, or do we build our own?~~ → Use `passkey-kit`/smart-account-kit (Option A, §6.2.1); validate with a Week 3 Day 1–2 spike before committing further.
- ~~**(Product)** Public dashboard or wallet-scoped?~~ → **Revised 2026-09-04:** public read-only at P0 (scan any contract, no wallet — scanning is a permissionless read), wallet-connect + user-signed extend at P1 (§6.3, §7). The original wallet-scoped answer assumed contract "control" was derivable from chain data; it is not — it would only ever have been an app-level registry.
- ~~**(Product)** Email vs. webhook alerting for v1?~~ → Email for v1, built behind a `NotificationChannel` interface so Telegram/webhook can be added in SOW 2 without rework (§7 P0/P1).
- ~~**(Ambassador)** What's the official sprint start date?~~ → 2026-09-03, superseding the SOW's suggested 2026-08-17; the 30-day clock therefore runs Sep 3 (day 1) → **2026-10-02** (day 30). *Still worth a quick confirmation message to Kenny Rivaldi so the Ambassador side's records match, even though this doc treats it as settled.*

### Remaining open item
- **(Engineering, non-blocking until Week 3)** Confirm during the passkey-kit spike whether an Ed25519 policy signer can be driven fully headlessly (no browser/WebAuthn ceremony) end-to-end — the kit's docs and demos lean toward browser passkey flows, so this needs hands-on verification rather than doc-reading alone.

## 13. Evidence & Grant Alignment

Maps directly to SOW §6.1 — keep evidence collection continuous, not a Week 4 scramble:

| Deliverable | Evidence to capture as you go |
|---|---|
| CLI | Public repo link, published npm package, CLI output screenshots, test coverage report |
| Auto-Bump Engine | Testnet tx hashes (save every one), engine logs, alert screenshots, policy-signer config guide |
| Dashboard + CI + Docs | Dashboard URL, GitHub Action link, demo video, docs, npm links |

---

## Sources

- [Smart contract state archival — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [Test TTL extension logic in smart contracts — Stellar Docs](https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension)
- [Extend a deployed contract's storage entry TTL — Stellar Docs](https://soroban.stellar.org/docs/guides/cli/extend-contract-storage)
- [Soroban JSON RPC Explained — LumenQuery](https://lumenquery.io/blog/soroban-json-rpc-explained)
- [Smart wallets — Stellar Docs](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Stellar Smart Contracts Suite — OpenZeppelin Docs](https://docs.openzeppelin.com/stellar-contracts)
- [stellar/passkey-kit (smart-account-kit) — GitHub](https://github.com/kalepail/passkey-kit)
- [Smart Accounts — OpenZeppelin Docs](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account)
- [OpenZeppelin/stellar-contracts, accounts package — GitHub](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/accounts)
- [kalepail/launchtube — GitHub](https://github.com/kalepail/launchtube)

[^1]: Stellar Docs, state archival & TTL extension guides.
[^2]: Soroban RPC `getLedgerEntries` returns `liveUntilLedgerSeq`; compare against current ledger to compute remaining TTL.
[^3]: Stellar Docs, smart wallets — policy signers can be scoped to narrow, capped capabilities distinct from full custody.
[^4]: `passkey-kit`/smart-account-kit supports Ed25519 and policy signers alongside WebAuthn passkeys, with pre-deployed testnet factory/wallet/policy contracts; moved from kalepail's personal repo to the official `stellar` GitHub org.
[^5]: OpenZeppelin's Stellar smart-account framework separates signers, scope/context rules, and policies; ships multisig and spending-limit policies initially, not a single-function allowlist policy.
[^6]: Launchtube is an SDF-run relayer for Soroban ops (fee sponsorship, nonce handling), explicitly labeled experimental with no stability guarantees.
