# Custody statement (PH2-E4-06)

> **DRAFT. Not approved, not final, not quotable.** Fatih approves the final text. `PH2-E4-06` is not ticked in `BACKLOG.md` and depends on `PH2-E4-02`.
>
> **How to read this draft.** Every fact below cites the file it came from. [#382](https://github.com/Fatihmaull/evergreen/pull/382), the `PH2-E4-02` fee-refund spike, merged on 2026-10-26, and its result is folded in below. A statement about the hosted flow or the router's final deployment stays **`undetermined`** until the work it gates lands (`PH2-E4-02`, `PH2-E4-03`, `PH2-E4-08`). Nothing here is copy for the site: `web-reference/design-language/claims-and-copy.md` allows custody wording only in the words of the *approved* statement.
>
> **Where this file lives.** `BACKLOG.md` `PH2-E4-06` names no location, and #380 lists "where the statement is published (docs page path)" as open. This draft uses `docs/CUSTODY.md`, following the upper-case file names in `docs/` (`docs/POLICY-SIGNER.md`, `docs/ACTION-GUIDE.md`). Moving it is a path change only.
>
> **Verified against** `origin/main` at `436d6ab72fa7ea0919a96d1ae49895ad7a81c18f` (2026-10-27).

## 1. What Evergreen custodies

**No user balance.** Evergreen holds no user balance, account or deposit. ADR-007 rejected a "custodial prepay" option for exactly that reason (`docs/adr/ADR-007-allowance-funded-hosted-engine.md`, *Options considered*: option A is custodial prepay; option B, the chosen one, says "Evergreen never holds a user balance"). Email recovers an account, never funds: "Funds were never ours to recover" (`docs/adr/ADR-008-authentication.md`, *Recovery*).

**No authority over any contract.** `extendTTL` is permissionless, so Evergreen never needs authority over a user's contract (`AGENTS.md` hard rule 4, and the note under hard rule 3: a wallet signature authorises a payment, never access).

**What Evergreen does hold, stated exactly:**

| Held | What it is | Source |
|---|---|---|
| **The engine's float** | The balance of the engine's own funded account: Evergreen's money, "a hot, expendable key", funded to a capped amount. The **cap is `undetermined`** (`PH2-E4-03`). | `AGENTS.md` hard rule 4; `docs/adr/ADR-007-allowance-funded-hosted-engine.md` *Consequences* |
| **XLM pulled for one job, in transit** | In the hosted flow the engine pulls `rent + fee` with one `transfer_from` into the engine account, then extends from that account. Between the pull and the extend (and a refund, if one is due), that job's XLM sits in the engine account. This is the one moment Evergreen's account holds a user's XLM. The unused part is reconciled and refunded from the engine pool. **#382 answered ADR-007's `[to verify]` on testnet:** the protocol returns the unused refundable resource fee, rent included, to the transaction's source. In all 13 transactions the source was charged `feeCharged`, never the declared fee. So pulling the declared maximum covers the extend, and the margin only guards a retry that re-simulates (Fatih accepted Rakha's recommendation on #385, 2026-10-26). Reconcile records what was **charged**, not declared. **The margin's size is `undetermined`** until measured across several days, and nothing has been measured on mainnet. | `docs/adr/ADR-007` *The flow for one hosted action*, steps 2 to 5; *Shortfall*; `docs/evidence/2026-10-21-fee-refund-spike/README.md` |
| **Collected fees** | Fees accumulate in the engine account until a scheduled sweep to treasury. The sweep interval and float limit are **`undetermined`** (`PH2-E4-03`). | `docs/adr/ADR-007` flow step 6; `BACKLOG.md` `PH2-E4-03` |
| **Account data** | Email address and linked wallet addresses, plus observation and allowance history. Accounts are **"deactivated and can be reactivated by email"**, and the data stays stored. The privacy statement this implies is a separate document and is `undetermined`. | `docs/API.md` §10; `docs/adr/ADR-008-authentication.md` line 82 and the 2026-10-22 log entry |

**The router holds nothing.** `fee_and_extend` moves the fee from the payer to the treasury and extends the target. It "holds no funds, has no admin, no upgrade and no withdraw path" (`router/contract/src/lib.rs` module doc), and the test `takes_fee_to_treasury_and_extends_instance_and_code` asserts the router's balance is `0` (`router/contract/src/test.rs`).

**Evergreen never pays another party's rent.** The user pays their own rent (`AGENTS.md` hard rule 5; ADR-007 *The invariant that survives from ADR-004*). The shortfall rule exists to keep it true: the pull carries a margin, so the engine never pays part of a user's rent (`docs/adr/ADR-007` *Shortfall*). The router never pays rent either: rent is charged to the transaction's source account, the user (`router/contract/src/lib.rs`). That the zero-subsidy property holds in the real flow is what DoD-2 measures from the fee ledger (`docs/API.md` §7). **It is not verified for the hosted flow yet: `undetermined`** until the hosted flow (`PH2-E4-01`, `PH2-E4-02`, both unticked in `BACKLOG.md`) is built and measured.

**Network fees are a different matter, stated plainly.** The engine account is the source of the pull, the extend and any refund, so it pays each transaction's network fee up front. A **failed** attempt keeps its non-refundable fee: 1,315 stroops for a failed extend on testnet (#382, transaction #5). That cost is Evergreen's, from the float, and the fee percentage is meant to recover it (`PH2-E5-03`; the cost floor proposed on #414 is about 18,400 stroops per action, simulated on mainnet, **not approved**). It is not rent, and no user pays for another user's.

**Status of the hosted flow.** Designed (ADR-007), not shipped. `PH2-E4-01` has a read-only multi-tenant plan with per-contract budgets merged (#440); it signs and moves nothing. `PH2-E4-02`, the money path, is open in `BACKLOG.md`. The only fee path with an on-chain test is the router, on testnet (§4).

## 2. Who signs what

| Signer | Signs | Never signs | Source |
|---|---|---|---|
| **The user's wallet** | The allowance `approve(engine, cap, live_until_ledger)`. The revoke, `approve(0)`. The wallet-link challenge. The router call `fee_and_extend` as `payer`. | Anything for another user. | ADR-007 *Option B*; `docs/API.md` §4 (wallet linking, revoke next to unlink); `router/contract/src/lib.rs` (`payer.require_auth()`) |
| **The engine key** (Evergreen) | `transfer_from` within a signed allowance, `ExtendFootprintTTL`, a refund from the engine pool, the fee sweep to treasury. "Anything beyond that list is a security regression requiring explicit human sign-off." | An `approve` (needs the holder), a change to any allowance's expiry, anything for a user without a live allowance. | `AGENTS.md` hard rule 4; `docs/evidence/2026-10-14-sac-allowance-spike/README.md` §6 |
| **The challenge-signing key** (the API Worker secret `CHALLENGE_SIGNING_KEY`) | Wallet-link challenges only. Distinct from the engine and treasury keys, and unfunded. | Transactions that move XLM. The API "never signs or submits anything" for XLM. | `docs/API.md` §4 and §8; `docs/adr/ADR-008-authentication.md` |
| **The treasury key** | Nothing on any server. The sweep only sends *to* the treasury, so it never needs this key. Testnet key: in Fatih's OS secure store. Mainnet key: to be generated offline on a hardware wallet before `PH2-E5-02`, **not yet done: `undetermined`**. | | `docs/adr/ADR-007` flow step 6; `BACKLOG.md` `PH2-E4-03` |
| **An email session** | Nothing that moves XLM. "Nothing that moves XLM is ever authorised by an email session." | | `docs/adr/ADR-008-authentication.md` *The wallet is authority over money*; `docs/API.md` §4, §7 |

Self-hosted CLI and engine: the self-hoster supplies their own funded testnet payer account and keeps the key; the CLI and self-hosted engine are fee-free (`docs/POLICY-SIGNER.md` *What Stage1 provides*; ADR-007 *The fee rule*). Submitting is opt-in: dry-run is the default (`AGENTS.md` hard rule 6). The CLI's `extend` refuses mainnet until DoD-2 is met (`BACKLOG.md` `PH2-E1-04`, done via #343). The policy signer is not available (`docs/POLICY-SIGNER.md`), so no claim is made that the engine key is capped by a signer: the cap is on the money, at the token layer.

## 3. Permissions and limits

### 3.1 Allowance path (hosted autopilot)

An allowance is one `approve` the user signs: capped, expiring, revocable in one transaction (ADR-007 *Option B*; spike §3).

If an attacker holds the engine key, they get exactly (spike §6, ADR-007 *Consequences*):
1. **the engine float**, the whole balance of the engine's own account (cap: **`undetermined`**, `PH2-E4-03`);
2. **plus, for every user at once, the remaining allowance** until its `live_until_ledger`.

They **cannot**, each tested on testnet (spike §3 and §6, evidence tx `41fd6270…b2f8`):
- raise an allowance (`approve` needs the holder);
- extend an allowance's expiry (the stored `live_until_ledger` governs, not the entry's TTL);
- revive an expired allowance (temporary entries are deleted at expiry);
- reach any balance beyond the approved amount;
- act after a revoke (`approve(0)`, one transaction).

**Caveats, stated plainly:**
- **The bound is the sum of all outstanding allowances**, not any single one. A compromise drains every live allowance at once (spike §6; ADR-007).
- **The float risk is unchanged by the allowance design.** It is a hot key with Evergreen's own money (spike §6).
- **The daily limit is not an account-level brake.** One-click "Extend now" is limited to `EXTEND_NOW_PER_USER_CONTRACT_PER_DAY = 3` per (user, contract) in a rolling 24 hours. A session takeover's ceiling per 24 hours is `3 × (that user's autopilot-enabled contracts) × perJobMaxStroops`, capped by the allowance (`docs/API.md` §7). Each item's `per30DaysMaxStroops` is **computed** by the tenant plan (#440: a rolling 30-day window on `jobs.pulled_at`, net of refunds) **but not yet enforced**: nothing refuses a job over it until `PH2-E4-02` calls `checkBudget`. On `origin/main`, `checkBudget` (`packages/engine/src/tenants.ts`) is exported and has no caller. **The allowance is the real ceiling, and today it is the only enforced one.** Every use sends an email notice (`docs/API.md` §7). Do not describe "the daily limit" as a per-account limit.
- **Reactivating an account by email does not re-enable autopilot** (`docs/API.md` §10; ADR-008). **What the code does, as of this draft:** reactivation turning autopilot off on every watch item is in review (#454), not merged. Requiring a fresh wallet signature before autopilot can be turned back on is **not built**: deactivation keeps the wallet links, and the fix needs a schema decision (asked on #385). Until both land, this sentence describes the rule, not the code.
- A new `approve` **replaces** the cap rather than adding to it (ADR-007 *Consequences*).
- **Default allowance cap and expiry the dashboard proposes: `undetermined`.** The cap-sizing estimate waits for the fee percentage, `PH2-E5-03` (`docs/API.md` §7).

### 3.2 Router path (no allowance)

One transaction, one signature (`docs/adr/ADR-009-router-scope-and-fee-destination.md`). `fee_and_extend(payer, fee, target, threshold, extend_to)` (`router/contract/src/lib.rs`):
- requires the **payer's** authorisation (tests `refuses_without_payer_auth`, `another_signer_cannot_spend_the_payers_balance`);
- sends the fee to the one treasury address stored at deploy; no argument names a destination (`the_caller_cannot_redirect_the_fee`);
- refuses a negative fee and `threshold > extend_to` (`refuses_a_negative_fee_and_moves_nothing`, `refuses_threshold_above_extend_to`);
- if the fee cannot be paid, the whole call fails and nothing is extended (`an_unaffordable_fee_fails_the_whole_call_and_extends_nothing`);
- extends the target's **instance and code only**, never its persistent or temporary data (`never_extends_the_targets_persistent_or_temporary_data`).

**Permanent by construction.** The fee token and treasury are set once, by `__constructor(fee_token, treasury)`. The contract has no admin, upgrade, withdraw or setter function (`router/README.md`; `router/contract/src/lib.rs` module doc). A different treasury means a new deployment. The constructor refuses the router itself as treasury (`refuses_the_router_itself_as_treasury`).

**Limits to state, not hide:**
- **The router does not keep persistent data alive.** For a user without an allowance, persistent data can still be archived. **This statement may not call a contract "fully safe", or anything equivalent, for such a user** (ADR-009 §1a; `PH2-E4-06` is named there). The instance-and-code share was 99.21% on one spike subject; on real contracts it is **`undetermined`** (ADR-009 *Context*).
- **The fee is voluntary on-chain.** The router accepts `fee == 0`; it then skips the transfer and still extends. The UI and CLI send the agreed fee; anyone calling the router directly can pay 0 (ADR-009 decision 3; `zero_fee_extends_without_a_transfer`). Free extension is available without Evergreen anyway: `extendTTL` is permissionless (ADR-007 *A fee can never be a toll on the chain*).
- **The router is unaudited.** An audit is part of `PH2-E4-08` (`BACKLOG.md`), and **a written router audit is a precondition of `PH2-E5-02`, before any immutable contract goes to mainnet** (Fatih, 2026-10-26, #414). No mainnet router has been deployed, even for measurement. The audit status of the final deployment is **`undetermined`**.

## 4. Treasury and deployments

- **Testnet treasury:** `GD7LISFDUOWIVEW3FX452FIGARVRACPTHXVJ42XOBHMJMOQAPIRRMMRZ` (`BACKLOG.md` `PH2-E4-03`; ADR-007 flow step 6).
- **Testnet router:** `CAADZRZBFZ4BQQYWID6LTPRVQCWR4R7L4EGJ6CBXEBPF2BJGGRUU6YM3`, constructed with that treasury (`docs/EVIDENCE.md` § PH2-E4-08). The testnet router is **not** the production router.
- **Mainnet treasury: `undetermined`.** **Mainnet router: `undetermined`** (`docs/EVIDENCE.md`; ADR-009 *Consequences*: the production router cannot ship before `PH2-E4-03` fixes the treasury address). Phase 2 is testnet only until DoD-2 (`AGENTS.md` hard rule 1; `docs/API.md` §2 and §8).
- **Fee percentage: `undetermined`** until `PH2-E5-03` (ADR-007 *The fee rule*). It is set from read-only mainnet simulation plus #382's measured ratios, with no mainnet transactions (Fatih, 2026-10-26). A proposal is on #414; Fatih sets the number. Clients use 0.1 XLM (`1000000` stroops) on testnet for now (ADR-009 decision 3).
- **The "one revenue destination" claim** (ADR-007: all fees fund development, no profit split) is a decision record, not something the chain enforces.

## 5. Open items

| Item | Blocked on |
|---|---|
| Final hosted fee path: pull, margin, reconcile, refund. Size of the retry-only margin. | `PH2-E4-02`, after measurements across several days |
| ~~Whether the protocol refunds the unused refundable fee~~ | **Answered by #382 (merged 2026-10-26):** yes, rent included; reconcile records charged |
| Per-item 30-day budget enforced (computed today, not enforced) | `PH2-E4-02` calling `checkBudget` |
| Reactivation: autopilot off (#454, in review); fresh wallet signature before autopilot can return | #454; a schema decision on #385 |
| Float cap, refund headroom, sweep schedule | `PH2-E4-03` |
| Mainnet treasury address and hardware-wallet generation | `PH2-E4-03`, before `PH2-E5-02` |
| Final router deployment, its audit, the mainnet router | `PH2-E4-08`, `PH2-E4-03` |
| Zero-subsidy verified on the real hosted flow | `PH2-E4-01`, `PH2-E4-02`, DoD-2 |
| Default allowance cap and expiry | `PH2-E3-05`, `PH2-E5-03` |
| Fee percentage | `PH2-E5-03` |
| Privacy statement for stored email, wallets and history | not assigned in `BACKLOG.md`: `undetermined` |
| Publication path and the exact quotable wording | Fatih's approval |
