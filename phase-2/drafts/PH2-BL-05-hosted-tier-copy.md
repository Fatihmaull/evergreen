# PH2-BL-05 — landing copy for the paid hosted tier (DRAFT)

**Status: draft for Fatih's review. Not wired to any page, and it must not be.**
This file lives under `phase-2/`, which the site build does not read. Nothing
here is published by merging it.

**Why it cannot ship today.** `web-reference/design-language/claims-and-copy.md`
holds the rule, and four of its rows apply. Each is quoted by what it says, and
none of them is lifted yet.

| Row | What it forbids | Where this draft stands |
|---|---|---|
| Fees, prices, percentages, billing | a fee number "appears only after Fatih sets it (`PH2-E5-03`) **and it ships**" | The number is set but **provisional** (`packages/core/src/fee.ts`), and `PH2-E5-03` stays open until Fatih confirms it final. Nothing charges it: see the ledger below |
| "Non-custodial", "zero-privilege", "no keys" | any use outside the **public custody statement Fatih approves** (`PH2-E4-06`), quoted, not paraphrased | That statement is a draft (#423), not approved. **This draft does not use the word**, nor a paraphrase of it. The allowance model is described by its mechanics instead |
| Any mainnet reference, path or promise | naming mainnet writes or autopilot before DoD-2 (`PH2-E5-02`) and launch (`PH2-E5-04`) | The copy says **testnet only**. It does not say "until" anything, because "until" is a promise |
| A daemon, uptime, "always on" | an uptime figure, or "always on" | The copy says **scheduled** and gives no figure. A hosted autopilot may be described as scheduled only when it ships (`PH2-E4-01`–`PH2-E4-05`) |

Fatih reviews the copy before it merges anywhere that publishes, and
`claims-and-copy.md` itself is one of the files only Fatih edits.

---

## The copy

### Section on the landing page, beneath the thesis

> **Let it watch for you.**
>
> Evergreen is open source. The command line, the GitHub Action and a
> self-hosted engine are MIT-licensed, and Evergreen charges nothing for any of
> them. Extending a contract's life is permissionless on Stellar: anyone can do
> it, with this tool or with the `stellar` CLI.
>
> The hosted tier is for people who would rather not run the schedule
> themselves. It is **testnet only**.
>
> **How it is paid for.** You sign one allowance from your own wallet: a cap and
> an expiry you choose. Evergreen can draw on your funds only through that
> allowance, only for the rent and the fee, and only until it expires. You can
> revoke it whenever you like. A new allowance **replaces** the old one rather
> than adding to it, and the screen where you sign says so.
>
> **What it costs.** For each extension Evergreen runs for you, the fee is 2% of
> the rent charged, with a minimum of 25,000 stroops (0.0025 XLM). The minimum
> only applies below 0.125 XLM of rent. **This figure is provisional.** It is
> re-measured before it is final.
>
> **A real example.** Extending a large contract entry for the first time cost
> 28.9 XLM of rent on testnet. The hosted fee on that extension would be
> 0.578 XLM.
>
> **If an extension fails.** When Evergreen has drawn your funds and the
> extension still fails, the whole amount is refunded, fee included.
>
> Evergreen pays the network fee of a refunded failed attempt itself, as
> ADR-007 sets out (`docs/adr/ADR-007-allowance-funded-hosted-engine.md`).
>
> The fee pays for the convenience of having it done on a schedule. It is not a
> toll on the chain.

### Fee worked examples (computed with `hostedFeeStroops`, not by hand)

| Rent charged | Hosted fee |
|---|---|
| 0.01 XLM | 0.0025 XLM (the minimum) |
| 0.1 XLM | 0.0025 XLM (the minimum) |
| 0.125 XLM | 0.0025 XLM (the two are equal here) |
| 1 XLM | 0.02 XLM |

The table is optional on the page. If it appears, it must be generated from
`hostedFeeStroops` at build time, never typed, for the same reason no ledger is
typed into a page (`futureEnd`, #337).

---

## The claims ledger: every sentence, its source, and whether the code does it

"Claim nothing the code doesn't do" is the instruction. This is the check.
**Most rows say NO**, and that is the finding.

| Claim in the copy | Source | Does code do it today? |
|---|---|---|
| The CLI, the Action and a self-hosted engine are MIT, with no fee | Q10, Q21; `claims-and-copy.md` says "Open source, MIT" may be said now | **Yes.** Nothing charges in any of them |
| Extension is permissionless | measured in `W1-D4-06` (two independent accounts, no auth entries); `docs/SOROBAN-PRIMER.md` | **Yes**, measured on testnet |
| You sign one allowance: a cap and an expiry | ADR-007; spike #297, four limits measured | The chain side **yes** (spike). The screen that asks for it **no**: `/allowance/` on production is revoke-only, and there is no approve screen or cap sizing (`PH2-E3-05` is `[~]`) |
| Evergreen draws on funds only through that allowance, only for rent and fee | ADR-007; `AGENTS.md` hard rule 4 as amended | **Policy, not yet mechanism in the hosted path:** the pull (`PH2-E4-02`) is not built |
| You can revoke it | `approve(0)`; `GET /wallets/{account}/allowance` | The chain side **yes**. The revoke screen **exists on production** (`/allowance/`, #567), and `/login/` says unlinking does not revoke (#569, #574). But the spender is unset until `PH2-E4-01`/`PH2-E4-03`, and status stays undetermined until `GET /wallets/{account}/allowance` answers, so **no allowance to Evergreen's engine can exist to revoke yet** |
| A new allowance replaces the old one | spike #297 (measured: one allowance per user–spender pair) | **Yes** (protocol behaviour). The screen copy that says so is not built |
| Fee = 2% of rent charged, minimum 25,000 stroops | `packages/core/src/fee.ts` `PROVISIONAL_HOSTED_FEE`; ADR-007 amendment | The **formula exists** and is tested. **Nothing outside core calls it:** `grep` finds no use in `apps/`, `packages/engine` or `apps/api`. **K11 (Fatih, 2026-11-03, relayed by the PM; the decision text is not in the repo):** the fee stays `max(2% × charged rent, 25,000 stroops)`, final at reconcile. The copy sentence states only that formula and says nothing about *when* the fee becomes final, because the repo disagrees with itself on that: #581 (open, Rakha, 2026-11-02) rewrites `fee.ts` to say the fee is **locked at pull, on the simulated rent**, and "reconcile does not recompute it", booking only the charged-vs-declared difference as a `fee_ledger` row. If #581 stands, "2% of the rent charged" is true only up to that difference. **Undetermined; Fatih decides which wording is real, and this sentence is re-read the day he does** |
| The minimum binds only below 0.125 XLM | 25,000 ÷ 2% = 1,250,000 stroops | **Yes**, arithmetic, and the examples above come from the function |
| The figure is provisional | `fee.ts` header; ADR-007 | **Yes**, and the copy must keep saying so |
| A failed extension refunds the whole pull, fee included | ADR-007 step 5 (Fatih, #414) | **No.** The refund is `PH2-E4-02`, not built |
| It runs on a schedule | `PH2-E4-04`; `apps/scheduler/src/evaluate.ts`; `docs/ops/README.md` | **Not for anyone.** A scheduler Worker has ticked on **production** since 2026-10-31 (cron `*/15`; DevOps counted 139 `scheduler_ticks` rows to 2026-11-01 15:15 UTC), but it is a heartbeat and a read-only dry run: it signs nothing, holds no key, enqueues nothing, and extends nothing for any user. Stage 2, the money path, waits on `PH2-E4-02`. Which scheduler build is deployed was not read from the Worker: **undetermined** |
| Email me when something needs attention (alerts, renewal reminders) | `PH2-E2-06`, `PH2-E3-05` | **Not claimed, and must not be.** User alerts are off: #571 (the outbox and preferences tables) is unmerged and the dispatcher is not wired to the scheduler. What exists is operator email: F10 (testnet reset) and F11 (stale scheduler heartbeat, about 45 minutes; `docs/ops/secrets.md`). **`ALERTS_SEND` on production is exactly `send`, set by Fatih (2026-11-02, relayed by the PM), so #568's statement that a stalled scheduler alerts the team in about 45 minutes is true as a statement about operator email.** `docs/ops/secrets.md` still reads "undetermined to DevOps" for the value (it cannot be read), so there is no citation yet; **add it when DevOps records it**. It is an operator alert and says nothing to users Renewal reminders belong to `PH2-E3-05` and are not built |
| Evergreen's email comes from `mail.evergreenstellar.biz.id` | `docs/ops/secrets.md` (#493) | The sender domain is **live**, and email sign-in works on production (#500). **No sentence in the copy mentions email**, so this row backs nothing. It is here so a later sentence about email is checked against it and against the row above |
| Testnet only | footer on every page; `PH2-E1-03` refuses non-testnet builds | **Yes** |

**Refreshed 2026-11-02 against `origin/main` `9c1ad2b`; re-read 2026-11-04 against `107cc2c` for K11 and the `ALERTS_SEND` decision (rows above).** What moved since
the last check: the revoke screen shipped (#567) and the unlink control with it
(#574); the sender domain is live; a scheduler Worker ticks on production, as a
heartbeat. What did not move: nothing pulls, refunds or extends for anyone
(`PH2-E4-02` is `[ ]`), the fee function is still called by nothing outside
`packages/core`, there is no approve screen, and user alerts are off. The copy
text above is unchanged by this refresh.

**Consequence.** Four sentences describe behaviour the engine does not have:
the pull, the refund, the scheduled run, and the allowance screen. They are
true as a design and untrue as a product. A scheduler ticking on production
does not make "it runs on a schedule" true: the sentence promises extensions.
The copy therefore cannot go live until `PH2-E4-02`, `PH2-E4-04` and
`PH2-E3-05` ship, and it should be re-checked row by row against `origin/main`
on the day it does, because every "No" above is a claim that may have become a
"Yes" or may have changed.

## Words deliberately not used

- **"non-custodial"**, and any paraphrase of it: gated on the approved custody
  statement (#423, `PH2-E4-06`).
- **"free"** as a price, in the fee sense. "Charges nothing" is used for the
  CLI because the row's lift condition is a fee that has shipped, and the
  sentence is only true of tools that do not charge.
- **"mainnet"**, and **"until"** anything.
- **"always on"**, any uptime or delivery figure.
- **"guaranteed"**, **"safe"**, **"secure"**: nothing here is measured.

## The router path is left out on purpose

`fee.ts` also names a router fee: 2% of rent, no minimum, because the user pays
the network costs on that path. It is **excluded** from this copy. The router
contract is unaudited, the fee on that path is proposed by the dashboard and not
enforced by the contract (`fee.ts`, ADR-009 §3), and the claims gate has no row
that lets it be described.

## Decided (Fatih, K2, 2026-10-29)

1. **The worked example uses the real extension.** The shared code entry
   extension in `docs/evidence/2026-10-14-shared-code-extend/` cost 28.9113 XLM,
   shown as 28.9 XLM. At 2% the hosted fee is 0.578 XLM (0.5782 XLM rounded up
   in stroops by `hostedFeeStroops`).
2. **The section stays off the landing page until `PH2-E4-02` ships.** This file
   is the reviewed text. The fee numbers in it (2%, 25,000 stroops, 28.9 XLM,
   0.578 XLM) are also held back: the "Fees, prices, percentages, billing" row
   in `claims-and-copy.md` allows a fee number only after `PH2-E5-03` is set
   and it ships. They live in this draft only.
3. **The failed-attempt network fee is said, in one sentence and without a
   stroop figure.** It cites ADR-007 step 5. The 8,000 to 12,400 stroop range
   stays in the ADR and is not copy.
