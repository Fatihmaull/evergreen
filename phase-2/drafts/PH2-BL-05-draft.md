# PH2-BL-05 — Hosted tier landing copy (DRAFT, not for PR)

Source: origin/main @ 76592f7 (2026-10-22 21:25 WIB). Draft by Evergreen WEBF for PM review.

> **Publish gate.** `web-reference/design-language/claims-and-copy.md:36` forbids fees, prices,
> percentages, "paid tier" and "free" as a price until PH2-E5-03 sets the fee and it ships;
> `:34` forbids sign-in/wallet copy until PH2-E3-01 ships; `:39` allows "scheduled" autopilot
> copy only once PH2-E4-01–E4-05 ship. Rows lift only when on origin/main AND verified on
> production (`:25-26`). This draft is held until then. It also avoids "non-custodial" (`:35`).

## Section headline

**Extended on a schedule, from an allowance you set.**

## Benefit lines

1. **Set a cap once.** You sign one capped, expiring XLM allowance; the engine draws rent plus fee from it, never more than what remains of the cap.
2. **Your contract's rent is still yours.** Every extend is paid from your own allowance. Evergreen never pays another party's rent.
3. **Scanning, watchlist and alerts move no XLM, and carry no fee.** A fee applies only when XLM moves through Evergreen's own infrastructure. The percentage is undetermined (set in PH2-E5-03).
4. **The CLI and self-hosted engine stay open source, MIT, with no fee.** Extension is permissionless: you can always extend yourself.

## What it does and doesn't do

**Does**
- Extends instance and code entries for contracts on your watchlist, on a schedule, on Stellar testnet.
- Extends persistent data **only for users with an allowance**.
- Stops and emails you when an allowance expires, instead of quietly stopping.
- Sends renewal reminders at 30, 7 and 1 days. An allowance needs re-signing about every 180 days.

**Doesn't**
- Without an allowance, the one-signature dashboard extend covers instance and code only. **Your persistent data can still be archived.** We do not call such a contract safe.
- Signing in with email cannot move XLM.
- A new approve replaces your cap; it does not add to it.
- No mainnet. Testnet only.
- Fee percentage: undetermined.

## CTA

Primary: **Open dashboard →** (`/dashboard/`)
Secondary: **The code on GitHub →**
Label line: *Stellar testnet.*

## Claims → sources (origin/main @ 76592f7)

| # | Claim | Source |
|---|---|---|
| 1 | Capped, expiring allowance signed once; engine pulls rent + fee | docs/adr/ADR-007-allowance-funded-hosted-engine.md:42, :63; phase-2/PHASE2-PLAN.md:18 |
| 2 | Never more than remaining cap; spender can't raise/extend it | ADR-007:33, :21, :86; PHASE2-PLAN.md:182 |
| 3 | User pays own rent; Evergreen never subsidises | ADR-007:46, :117 |
| 4 | Fee only when XLM moves via Evergreen infra; no-XLM actions free | ADR-007:50-51; PHASE2-PLAN.md:19, :108 |
| 5 | Fee % undetermined, set in PH2-E5-03 | ADR-007:53 |
| 6 | CLI + self-hosted engine MIT, fee-free | ADR-007:52; PHASE2-PLAN.md:93; claims-and-copy.md:36 ("Open source, MIT" true now) |
| 7 | Extension is permissionless; fee is not a toll | ADR-007:88 |
| 8 | Scheduled (not "always on") | claims-and-copy.md:39; BACKLOG.md:645 (PH2-E4-04) |
| 9 | Router: instance + code only; persistent needs allowance; never "fully safe" | docs/adr/ADR-009-router-scope-and-fee-destination.md:21; BACKLOG.md:649 |
| 10 | Allowance users: one click extend | ADR-007:73; BACKLOG.md:634 |
| 11 | Expiry stops autopilot and alerts; reminders 30/7/1 days | ADR-007:90; BACKLOG.md:635 |
| 12 | Re-sign about every 180 days | ADR-007:34; PHASE2-PLAN.md:91 |
| 13 | New approve overwrites cap | ADR-007:34, :90 |
| 14 | Email sign-in cannot move XLM | ADR-008:48; claims-and-copy.md:92 |
| 15 | Testnet only | ADR-007:78; claims-and-copy.md:32, :80 |
| 16 | CTA targets | apps/web/src/pages/landing.mjs:130-131, :294-295 |

## Open questions (PM / Fatih)

1. **Publish gate:** claims-and-copy.md:36 bans "paid tier"/fee copy until E5-03 ships. Is this draft only staged for later (recommended), or does Fatih want to lift the row earlier (design-authority edit with evidence, `:24-28`)?
2. Where does it live: new landing section or a separate `/hosted/` page? landing.mjs:4-8 caps the page at three middle sections, each beside an artefact. Recommendation: a separate page. Undetermined which artefact goes with it.
3. Benefit 1 is close to custody wording (`:97-99`, gated on PH2-E4-06). Should it be replaced with a quote from the approved custody statement once that exists? Recommendation: yes.
4. Is a one-click "Extend now" daily limit (BACKLOG.md:634) worth stating? The number is undetermined.
5. Does "about 180 days" hold for the production allowance? It was measured in spike #297 only.
