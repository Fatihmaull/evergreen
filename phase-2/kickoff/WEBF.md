# Kickoff — WEBF (Fatih's web agent)

You are the web agent working for **Fatih**. Rakha has his own web agent (WEBR). Your track is the **product surface**: login, watchlist and scan, and the landing pages. WEBR owns the flows that move XLM.

## Read first, in order

1. [`../README.md`](../README.md): role codes and the **standing rules**, which bind you.
2. [`../PHASE2-PLAN.md`](../PHASE2-PLAN.md): your cards are marked **WEBF**. Also read §3.1 (auth) and the decision record, especially Q4 and Q20.
3. `AGENTS.md`, `docs/ONBOARDING.md`, and the dashboard's current state under `apps/dashboard` and `apps/web`.

## Your paths

**Yours:** `apps/` — the routes and components for login, account, watchlist, scan, landing and docs pages.

**WEBR's** (open an issue mentioning Rakha instead of editing):
- the extend flow;
- the allowance flow;
- the "Support Evergreen" page;
- wallet-transaction components;
- bundle-size work.

**Shared inside `apps/`:**
- layout and design tokens;
- the API client;
- the wallet-connect primitive.

Agree these with WEBR at the start rather than discovering a conflict in a PR.

## What the product must keep, from the sprint spec

The dashboard's honesty rules still hold, because they are the product's thesis:
- three states, never two: **undetermined is its own colour and word**, never a green check;
- absence is not health;
- **ledgers are the truth; dates are estimates.**

Q4 changes the scope, not the rules. The dashboard now serves **anyone's contracts**, not only ours.

## Your cards, in the order to take them

1. **Now: an audit of the dashboard as it is.**
   - List every route, what it renders, and whether it assumes "our three contracts".
   - Measure bundle sizes. The extraction found 732–768 KB per data bundle because `core` is embedded separately in each.
   - Report only; change nothing yet.
2. **PH2-E2-02 — API spec, co-authored with CEF.** You own the client's needs:
   - which screens call what;
   - which errors the UI must distinguish;
   - which data must be live and which may be cached.

   Nothing is built against the API until the spec is merged.
3. **PH2-E3-01 — login UI.**
   - Email is the account (passwordless code or link).
   - The wallet is linked by signing a challenge.
   - **The UI never suggests an email session can move money.**
4. **PH2-E3-02 — watchlist UI.**
   - The **binding expiry leads**: the earliest entry, usually the shared code entry, not the instance.
   - Health uses the three honest states.
   - Contracts are added by pasted ID (Q14).
5. **PH2-E3-03 — scan any contract**, with "add to watchlist". The existing `/dashboard/scanner/` route is the starting point.
6. **PH2-BL-05 (backlog)** — landing and pricing copy for the paid hosted tier, once Fatih sets the fee. Say plainly that extension is permissionless and the fee buys convenience (plan §3.3).

## Report format

Each report covers:
- what landed (PR links plus the live preview URL);
- what you verified in a real browser;
- what is `undetermined`;
- questions for Fatih, as decisions with options and a recommendation.
