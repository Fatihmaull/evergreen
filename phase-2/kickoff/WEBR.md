# Kickoff — WEBR (Rakha's web agent)

You are the web agent working for **Rakha**. Fatih has his own web agent (WEBF). Your track is **every screen where XLM moves**:
- manual extend;
- the allowance (approve / renew / revoke);
- the "Support Evergreen" page.

Each of these is a place where the UI must be exactly as honest as the chain.

## Read first, in order

1. [`../README.md`](../README.md): role codes and the **standing rules**, which bind you.
2. [`../PHASE2-PLAN.md`](../PHASE2-PLAN.md): your cards are marked **WEBR**. Read §3.3 (allowance flow, fee rule, support tip) closely.
3. `docs/evidence/2026-10-14-sac-allowance-spike/README.md` (PR #297), which is what the allowance can and cannot do, measured on testnet.

## Your paths

**Yours:** inside `apps/`:
- the extend flow;
- the allowance flow;
- the support page;
- wallet-transaction components (building, signing, submitting, showing results);
- bundle-size work.

**WEBF's** (open an issue mentioning Fatih instead of editing): login, account, watchlist, scan, landing and docs pages.

**Shared:** layout, design tokens, the API client, the wallet-connect primitive. Agree these with WEBF at the start.

## Facts your screens must reflect (from #297 and the docs, all verified)

- **A new `approve` replaces the cap; it does not add to it.** The UI says so at the moment of signing.
- The allowance expires at most about **180 days** after signing (`live_until_ledger` ≤ current + 3,110,399). The UI shows the expiry as a date *and* a ledger.
- **One allowance covers all of a user's contracts.** Per-contract budgets are ours, kept in the DB, and the UI must not imply the chain enforces them.
- **A Soroban transaction holds only one operation**, so a fee never shares the extend's transaction.

## Your cards, in the order to take them

**Start now. Nothing blocks it:**

1. **E3-06 — the wallet prompt test, done early.** #297 left it `undetermined` whether Freighter shows `approve` as **one legible prompt**.
   - Build a throwaway testnet page that asks Freighter to sign a native-XLM SAC `approve`.
   - Report how many prompts appear and exactly what the user sees: amount, spender, expiry.
   - Screenshot each prompt.
   - If the prompt is illegible (raw XDR, no amount), that is a finding the allowance UX must design around.
2. **BL-03 — bundle size.** `core` is embedded separately in each data bundle (732–768 KB each). Measure, then propose one shared chunk. Coordinate with WEBF before restructuring the build.

**After E4-01 (CER's multi-tenant engine):**

3. **E3-05 — the allowance flow:**
   - **Cap sizing.** Show the estimate: rent for the watched contracts × horizon × (1 + fee) × margin. The margin exists because rent has varied about 18% day to day.
   - approve;
   - renewal reminders at 30, 7 and 1 days;
   - revoke, which is `approve(0)`.
   - An expired allowance shows as **stopped**, never as protected.

**After E4-02 and E4-07:**

4. **E3-04 — manual extend with the fee.**
   - **Allowance users: one click, no wallet prompt.** The extend runs as an engine job.
   - **Users without an allowance** follow E4-07's verdict: the router contract (one signature) if viable; otherwise the dashboard requires an allowance first.
   - **Never build a two-signature extend.** Fatih ruled it out.

**After E4-03 (treasury address exists):**

5. **E3-07 — "Support Evergreen" page.**
   - The user chooses the amount, sends a wallet payment to the treasury address, and gets a clear receipt.
   - Opt-in only. Never pre-checked, never bundled with another action.

## Report format

Each report covers:
- what landed (PR links plus the live preview URL);
- what you verified in a real browser with a real wallet on testnet;
- what is `undetermined`;
- questions for Rakha, as decisions with options and a recommendation.
