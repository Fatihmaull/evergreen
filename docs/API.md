# Evergreen API v1: the contract between the backend and the dashboard

**Status: DRAFT for review (`PH2-E2-02`), 2026-10-20. Both halves are in (WEBF's #351 folded in), and Fatih's decisions are applied.**
- **Server side:** written by CEF. It covers auth, watchlist, scan, allowance state, jobs and history, and fee-ledger reads.
- **Client side:** WEBF — §9a the error taxonomy, §9b the screen→call map, §9c what may be cached. §9a replaces the provisional user-facing set.
- **Rakha (CER) reviews** against the Neon schema he is drafting (`PH2-E2-03`). The spec's shapes follow what the engine actually stores; where his schema says otherwise, the schema wins and this changes.

Nothing is built against this until it merges. "Written before either side builds" is the card.

**Inputs:**
- [ADR-007](adr/ADR-007-allowance-funded-hosted-engine.md): the allowance and the hosted flow.
- [ADR-008](adr/ADR-008-authentication.md): auth.
- [`phase-2/PHASE2-PLAN.md`](../phase-2/PHASE2-PLAN.md) §3.1–§3.3 and the Definitions of Done.
- Rakha's Workers spike ([evidence](evidence/2026-10-15-workers-spike/README.md)).
- The shared types in `packages/shared-types`.

---

## 1 · Where the backend lives: decided, option B (Fatih, 2026-10-20)

**A constraint found while writing this, and verified:** `pages.dev` and `workers.dev` are both on the Public Suffix List (publicsuffix.org, read 2026-10-20, Cloudflare's section). So `evergreen-stellar.pages.dev` and any `*.workers.dev` Worker are **different sites**. ADR-008's session cookie is `SameSite=Lax`, which a browser does not send on a cross-site `fetch`. **A backend on its own `workers.dev` hostname cannot use ADR-008's cookie from the dashboard.**

| Option | How | Trade-off |
|---|---|---|
| **A. Pages Functions** in the dashboard project | `/api/*` is a Function beside the static site, so it is same origin | Simplest. But the API's secrets (the SEP-10 signing key, Resend, Neon) live in the static site's project, and an API deploy is a site deploy |
| **B. Its own Worker, reached through a Pages Function proxy** (recommended) | API code in `apps/api` as its own Worker. The dashboard's `/api/*` is a few-line Pages Function forwarding over a **service binding** (Cloudflare: *"Service bindings enable you to call a Worker from within your Pages Function"*) | Same origin to the browser, so the cookie works. Secrets stay in the API Worker. The two deploy independently. One extra in-datacenter hop |
| **C. A custom domain** for both | Site and API as routes on one registered domain | Cleanest URLs. Needs a domain bought and owned. Not decided anywhere; that is Fatih's call |

**Decided: B** (Fatih, 2026-10-20; recorded in ADR-003's amendment). It moves to C unchanged if a domain is bought later, because only the proxy goes away. **Secrets live only in the API Worker:** the challenge-signing key, the Resend key, `DATABASE_URL`, and `SIGNIN_CODE_PEPPER`, the HMAC key that sign-in codes are stored under (`PH2-E2-04`). The Pages project holds the proxy and the service binding, nothing secret.
- **Folder:** `apps/api`.
- **Worker name:** `evergreen-api`.
- **Engine:** a separate Worker, Rakha's (`PH2-E4-04`). The API never signs or submits anything; it writes job rows the engine picks up.

**🔴 Open: the Pages project's account.** A service binding cannot cross accounts (Cloudflare: *"This Worker must be on your Cloudflare account."*). The site is served today from the shared account, and production Workers go in the project-owned one (ADR-003, 2026-10-15). The options (move Pages, `fetch` proxy, custom domain) are in ADR-003's 2026-10-21 amendment, for Fatih.

**Plan.** The spike recommends **Workers Paid** for the engine, and Fatih is upgrading the account.
- **Verified, per account:** Cloudflare's pricing page states a *"minimum charge of $5 USD per month for an account"* (developers.cloudflare.com/workers/platform/pricing, read 2026-10-20). The subscription is the account's, not one Worker's, so the API Worker runs under the same plan as the engine.
- **Undetermined:** whether the included allotments (10 million requests and 30 million CPU ms a month) are pooled across the account's Workers. The page describes them at account level but does not say how usage is aggregated. To confirm on the account's billing page after the upgrade, not by assumption.

---

## 2 · Conventions

- **Base path** `/api/v1`. JSON in and out, `Content-Type: application/json`.
- **Amounts** are stroops as decimal strings: the shared `Stroops` type, `` `${bigint}` ``. Never JS numbers, never XLM floats.
- **Ledgers** are integers. **Times** are ISO 8601 UTC strings. A TTL is in ledgers; a time is only ever an estimate derived from one, labelled as such.
- **`network`** appears on every contract-bearing object.
  - Until DoD-2 is met (`PH2-E5-02`), every write route (watchlist autopilot, jobs) accepts only `testnet`.
  - Reads may name `mainnet` where core can read it (`PH2-E1-03`).
- **Pagination** is by cursor: `?cursor=<opaque>&limit=<1..100>`, answered with `{ items, nextCursor: string | null }`.
- **Every health or TTL value carries the observation it came from**: `observedAtLedger` and `observedAt`. The API never returns a health state without them.
  - A false health state shown to a user is a **P0** under the Definitions of Done.
  - "Unknown" is a state, never a missing field.
- **No route returns another user's email, wallets or watchlist.** Only scan works anonymously, and it returns no personal data.

## 3 · Sessions, CSRF and rate limits

**The session cookie** (ADR-008):
- `__Host-evergreen_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, an opaque random ID.
- Its row is server-side (`PH2-E2-03`).
- Rotated on use. Lifetimes are **configuration, not constants** (Fatih's starting values, 2026-10-20; he may tune them): `SESSION_IDLE_TIMEOUT` **7 days**, `SESSION_ABSOLUTE_TIMEOUT` **30 days**.
- Logout deletes the row.

**CSRF:** every state-changing request (`POST`, `PATCH`, `DELETE`) must pass both checks, or it is refused with `403 CSRF_FAILED`:
- **an `Origin` check:** it must equal the dashboard's origin;
- **a synchronizer token:** the `X-Evergreen-CSRF` header must equal the token stored on the session row and returned by `GET /me`.

**Rate limits:**
- They answer `429` with `Retry-After` (seconds) and error code `RATE_LIMITED`.
- They are **required**, not polish. ADR-008: without per-address and per-IP limits, the login form is a free mail relay.

Every number below is **configuration** (named, read at startup), not a constant in code. The starting values are Fatih's (2026-10-20), and he may tune them.

| Route | Setting | Starting value |
|---|---|---|
| `POST /auth/email/start` | `EMAIL_SENDS_PER_ADDRESS`, `EMAIL_SENDS_PER_ADDRESS_WINDOW` | **3 per address per 15 minutes** |
| `POST /auth/email/start` | `EMAIL_SENDS_PER_IP`, `EMAIL_SENDS_PER_IP_WINDOW` | **20 per IP per hour** |
| `POST /auth/email/verify` | `SIGNIN_CODE_TTL`, `SIGNIN_CODE_MAX_FAILURES`, `SIGNIN_CODE_DIGITS` | a code lives **10 minutes**, is **single use**, and is void after **5 failed attempts**. **8 digits** by default; Fatih set the limits, not the length, and the arithmetic for 8 is in `apps/api/src/auth/config.ts` |
| `POST /jobs` (`extend-now`) | `EXTEND_NOW_PER_CONTRACT_PER_DAY` | **3 per contract per day** (plan §3.3's daily limit) |
| `POST /scans` | `SCANS_PER_IP`, `SCANS_PER_USER` | per IP for anonymous callers, per user when signed in. **No value set yet**, so it is set before launch |

## 4 · Auth (ADR-008; built by `PH2-E2-04`)

| Route | Auth | Does |
|---|---|---|
| `POST /auth/email/start` `{ email }` | none | Sends a one-time code through the Resend channel. **Always `202`, whether or not an account exists**, so the route cannot enumerate users. The code: `SIGNIN_CODE_TTL` (10 min), single use, stored hashed |
| `POST /auth/email/verify` `{ email, code }` | none | On success, creates the account if new, sets the session cookie, and returns `200 { user }`. Otherwise `401 CODE_INVALID`. An expired, used or wrong code gets the same answer |
| `POST /auth/logout` | session | Deletes the session row. Returns `204` |
| `GET /me` | session | `{ user: { id, email, createdAt }, wallets: Wallet[], csrfToken }` |

**A code, not a magic link** (Fatih, 2026-10-20). It survives a phone-to-laptop switch and gives phishing nothing to click. ADR-008 allows either.

**Wallet linking** (the SEP-10 pattern; the pinned SDK 17.0.1 ships `WebAuth`):

| Route | Auth | Does |
|---|---|---|
| `POST /wallets/challenge` `{ account }` | session | Builds a challenge with `WebAuth.buildChallengeTx`, signed by the **challenge-signing key**. Returns `{ challengeXdr, networkPassphrase, expiresAt }` |
| `POST /wallets` `{ challengeXdr }` (signed by the wallet) | session + CSRF | Verifies it with `WebAuth.readChallengeTx` and `verifyChallengeTxSigners`, then links `account` to the user. Returns `201 { wallet }`, or `200` if already linked to this user. If another user has the wallet, `409 WALLET_LINKED_ELSEWHERE` |
| `DELETE /wallets/{account}` | session + CSRF | Unlinks the wallet. **Refused with `409 WALLET_PAYS_FOR_WATCHED_CONTRACT` while any watch item uses it as `payerWallet`** (Fatih, 2026-10-20). An allowance on chain does not go away when the link does, so the dashboard shows the revoke (`approve(0)`, signed by the user's wallet) next to unlink |

`Wallet = { account: string /* G… */, network: 'testnet', linkedAt: string }`

**The challenge-signing key** is distinct from the engine and treasury keys and unfunded (ADR-008). It is passed by naming an environment variable: a Worker secret in the API Worker, which is one reason for option B.

**Email never authorises anything that moves XLM.** §7 says exactly how "Extend now" stays inside that rule.

## 5 · Scan

| Route | Auth | Does |
|---|---|---|
| `POST /scans` `{ network, contractIds: ContractId[] (1..10), dataKeys?: LedgerKey[], noDataKeys?: boolean }` | none, rate-limited | Runs core's `scanContracts` server-side. Returns **the same JSON as `evergreen scan --json`**: `ScanResult` plus `health`, from the shared type, so the dashboard and the CLI cannot disagree |

- **Scan is anonymous, as it is today** (ADR-008, `docs/READY.md`). The dashboard may keep scanning in the browser, as it does now. This route exists for the watchlist's "add" and "refresh" paths and for clients without the bundle.
- **CPU:** the spike measured a scan at 10–20 ms median CPU, deployed. That is over the free limit; see §1's plan note.
- **`network: 'mainnet'`** needs a mainnet RPC configured on the API Worker. Until one is, the route answers `422 NETWORK_UNAVAILABLE`, never a testnet answer labelled mainnet.

## 6 · Watchlist (`PH2-E2-05`, CER)

| Route | Auth | Does |
|---|---|---|
| `GET /watchlist` | session | `{ items: WatchItem[] }` |
| `POST /watchlist` `{ network, contractId, label?, scope }` | session + CSRF | Adds the contract. Returns `201`, or `200` if already present: idempotent on (user, network, contractId) |
| `PATCH /watchlist/{network}/{contractId}` `{ label?, scope?, autopilot? }` | session + CSRF | Updates the item. Turning autopilot on needs a linked `payerWallet` and a `budget` |
| `DELETE /watchlist/{network}/{contractId}` | session + CSRF | Removes it. Returns `204`. Any queued job for it is cancelled if it has not pulled yet |

```ts
type WatchItem = {
  network: NetworkName;
  contractId: ContractId;
  label?: string;
  addedAt: string;
  /** What the scan covers. Without declared data keys a scan is incomplete, and says so. */
  scope: { dataKeys: LedgerKey[] } | { noDataKeys: true };
  autopilot:
    | { enabled: false }
    | {
        enabled: true;
        payerWallet: string; // a linked G-account holding the allowance
        thresholdLedgers: number; // act below this many ledgers left
        extendToLedgers: number;
        budget: { perJobMaxStroops: Stroops; per30DaysMaxStroops: Stroops };
      };
  /**
   * "Extend now" use for this contract today, so the client can say "N of N"
   * without a second call (§9b: one watch item renders from the list).
   */
  extendNow: { limitPerDay: number; usedToday: number; resetsAt: string };
  /** The engine's most recent scan of this item, or null before the first one. */
  lastObservation: {
    observedAtLedger: number;
    observedAt: string;
    scan: ScanResult; // shared type, as `scan --json`
    health: EntryHealth; // core's 'healthy' | 'warning' | 'critical' | 'unknown'
  } | null;
};
```

**`thresholdLedgers` is per item** because the core config already allows it per contract (`bumpWhenRemainingLedgersBelow`). That bears on DoD-2's scheduler-gap threshold:
- The engine's worst scheduler gap has to clear the **lowest** threshold in use.
- So the API refuses a threshold below a floor the engine publishes: `422 THRESHOLD_BELOW_FLOOR`.
- The floor's value is Rakha's (`PH2-E4-04`, `B-D31-01`).

## 7 · Allowance state, jobs and history

### Allowance

| Route | Auth | Does |
|---|---|---|
| `GET /wallets/{account}/allowance` | session (own wallet only) | Reads the native-XLM SAC `allowance(from: account, spender: engine)` and the account's XLM balance **on chain, now**, and joins the engine's last stored record of this allowance |

```ts
type AllowanceState = {
  network: 'testnet';
  account: string;
  spender: string; // the engine's public account
  amountStroops: Stroops; // as read now: 0 after expiry, after a revoke, and when none ever existed
  liveUntilLedger: number | null; // as read now; null unless active
  /** From the chain read joined with stored history. See the note below: the chain alone cannot tell the last three apart. */
  status: 'active' | 'expired' | 'revoked' | 'none';
  /** The last allowance the engine recorded for this wallet, or null if it never saw one. */
  lastKnown: { amountStroops: Stroops; liveUntilLedger: number; observedAtLedger: number } | null;
  balanceStroops: Stroops;
  observedAtLedger: number;
  observedAt: string;
  /** Renewal reminders go at 30, 7 and 1 days before expiry (plan §3.3); this is the estimate they use. */
  expiresAtEstimate: string | null;
};
```

- **The chain cannot tell expired from revoked from never.** The #297 spike measured `allowance()` reading `"0"` after expiry **and** after revocation ([evidence](evidence/2026-10-14-sac-allowance-spike/README.md)); the allowance is a temporary entry, so expiry deletes it. So `expired` and `revoked` come from `lastKnown`, the engine's stored history (`PH2-E2-03`): an allowance last seen live whose `liveUntilLedger` has passed is `expired`, and one that reads zero before then is `revoked`. With no history, zero is `none`. §9a's `ALLOWANCE_EXPIRED` copy ("the ledger it expired at") reads `lastKnown.liveUntilLedger`.
- **The API never builds, signs or submits an `approve` or a revoke.** The dashboard builds it and the user's wallet signs it (`PH2-E3-05`, WEBR). The API reads the result.
- **"A new approve replaces the cap rather than adding to it"** (ADR-007) is UI copy. **The cap-sizing estimate waits for the fee percentage** (Fatih, 2026-10-20): no estimate route until `PH2-E5-03` sets the fee.

### Jobs: one hosted action

| Route | Auth | Does |
|---|---|---|
| `POST /jobs` `{ network: 'testnet', contractId, kind: 'extend-now' }` + header `Idempotency-Key` | session + CSRF | Queues a one-click "Extend now" for an autopilot-enabled item. Returns `202 { job }` |
| `GET /jobs?contractId=&cursor=` | session | The user's jobs, newest first |
| `GET /jobs/{jobId}` | session (own only) | One job with its steps |

**Why "Extend now" does not break "email never authorises XLM".**
- The XLM it moves is authorised by the user's **on-chain allowance**: their own wallet signature, capped and expiring (ADR-007).
- The session only asks the engine to use an authority the user already granted, within the item's `budget`.
- It is bounded by the **daily limit** and announced by an **email notice** on every use (plan §3.3, Rakha's proposal on #299). A takeover of the email session can therefore spend at most the remaining allowance, within the budget and the daily limit, and the user is told each time.
- **The limit is per contract, and that bound reads smaller than it is.** `EXTEND_NOW_PER_CONTRACT_PER_DAY` is 3, so a session takeover's daily ceiling is `3 × (autopilot-enabled contracts) × perJobMaxStroops`, capped by the allowance and by each item's `per30DaysMaxStroops`. For one contract that is three extends; for twenty it is sixty. **The allowance remains the real ceiling** — it is the user's own signature, capped and expiring — but the daily limit is not a per-account brake, and the custody statement (`PH2-E4-06`) should say so in those terms rather than naming "the daily limit" as though it were one.
- Linking a wallet or changing who pays (`payerWallet`) **does** require the wallet's signature (§4).

```ts
type Job = {
  id: string;
  network: 'testnet';
  contractId: ContractId;
  kind: 'extend-now' | 'autopilot';
  createdAt: string;
  status: 'queued' | 'preflight-failed' | 'pulled' | 'extended' | 'refunded' | 'failed';
  /** The §3.3 steps, each with its own transaction where one exists. */
  steps: {
    preflight?: { at: string; ok: boolean; reason?: string; rentStroops?: Stroops };
    pull?: { at: string; txHash: string; amountStroops: Stroops };
    extend?: BumpRecord[]; // shared type, one per entry: the engine's own record
    reconcile?: { at: string; rentPulledStroops: Stroops; rentChargedStroops: Stroops; differenceStroops: Stroops };
    refund?: { at: string; txHash: string; amountStroops: Stroops };
  };
};
```

**`steps.extend` is the engine's existing `BumpRecord`.** It is not a new shape:
- `succeeded` means a confirmed transaction **and** a verified post-extend observation;
- `submitted` is never shown as success.

**Idempotency on anything that moves XLM.** The only client route that can move XLM is `POST /jobs`.
- **`Idempotency-Key` is required.** A UUID v4 from the client, one per user intent. A missing key is refused with `400 IDEMPOTENCY_KEY_REQUIRED`.
- **Same key, same body:** returns the same job (`200`), never a second one.
- **Same key, different body:** `409 IDEMPOTENCY_KEY_REUSED`.
- **Keys are kept at least 24 hours,** scoped per user.
- **The job ID is the engine's pull idempotency key.** One job is at most one `transfer_from` (ADR-007 step 2), and a refund reuses the same key (step 5). That part is the engine's guarantee (`PH2-E4-02`); the API's part is that one intent makes one job.

**Refused before queuing:**

| Code | When |
|---|---|
| `422 AUTOPILOT_OFF` | the item has no autopilot |
| `422 ALLOWANCE_MISSING` / `ALLOWANCE_EXPIRED` | the payer wallet has no live allowance |
| `429 DAILY_LIMIT_REACHED` | this contract's "Extend now" uses today have reached `EXTEND_NOW_PER_CONTRACT_PER_DAY`. `details: { limit, used, resetsAt }` |
| `422 NETWORK_NOT_WRITABLE` | any network but testnet |

Balance and exact rent are checked by the engine's pre-flight, not here. A pre-flight failure is a job in `preflight-failed` with its reason, and the user is alerted (§3.3 step 1).

### Fee ledger (reads)

| Route | Auth | Does |
|---|---|---|
| `GET /ledger?wallet=&contractId=&cursor=` | session (own wallets only) | The user's fee-ledger rows, newest first |

```ts
type LedgerRow = {
  id: string;
  jobId: string;
  network: 'testnet';
  wallet: string;
  contractId: ContractId;
  kind: 'pull' | 'rent' | 'network-fee' | 'evergreen-fee' | 'refund';
  amountStroops: Stroops; // always positive; `kind` gives the direction
  txHash: string | null; // null only for derived rows, e.g. `rent` split out of a pull
  ledger: number | null;
  recordedAt: string;
};
```

This is what DoD-2's **zero subsidy** is measured from. Every XLM the engine moves for a user has a row, and the rows reconcile against the transactions:
- per job, `pull` = `rent` + `network-fee` + `evergreen-fee` + `refund` + any recorded difference;
- an unexplained difference is a P0 or P1 by definition.

The exact row split is Rakha's schema; this shape is the read view.

## 8 · What the API does not do

- **Sign or submit anything.** The engine signs (with the engine key) and the wallet signs (with the user's). The API holds only the challenge-signing key.
- **Return a health or TTL without its observation.**
- **Accept an RPC URL from a client.** RPC endpoints are server configuration, as for the MCP server (`PH2-E1-07`): a URL can carry a provider key.
- **Serve mainnet writes** before DoD-2 is met (`PH2-E5-02`).

## 9 · The error envelope (CEF)

```json
{ "error": { "code": "DAILY_LIMIT_REACHED", "message": "…", "retryable": false, "details": {} } }
```

- `code`: stable, `UPPER_SNAKE`. Clients branch on it, never on `message`.
- `message`: for logs and developers. The dashboard writes its own copy per code.
- `retryable`: true only where retrying the same request can succeed: `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`.
- **An error never echoes a secret, an RPC URL, an email that isn't the caller's own, or another user's data.**

Codes used above: `CSRF_FAILED`, `RATE_LIMITED`, `CODE_INVALID`, `WALLET_LINKED_ELSEWHERE`, `WALLET_PAYS_FOR_WATCHED_CONTRACT`, `CHALLENGE_INVALID`, `NETWORK_UNAVAILABLE`, `NETWORK_NOT_WRITABLE`, `THRESHOLD_BELOW_FLOOR`, `AUTOPILOT_OFF`, `ALLOWANCE_MISSING`, `ALLOWANCE_EXPIRED`, `DAILY_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `NOT_FOUND`, `UNAUTHENTICATED`, `UPSTREAM_UNAVAILABLE`.

**`UPSTREAM_UNAVAILABLE` means the RPC or the database did not answer.** It is never reported as "unhealthy" or "not found": absence is not health.

## 9a · The error taxonomy, user-facing (WEBF)

This replaces the provisional set. §9's envelope is unchanged; this is the part
the dashboard branches on and what it says to a person.

**Three rules before the table.**

1. **The client branches on `code` and never on `message` or on the HTTP
   status.** Two codes share a status all over this spec — `422` carries six —
   so a status is not a branch.
2. **The set is closed, and the default is `undetermined`.** An unrecognised
   code must render as *"we could not establish this"*, never as an empty
   state, a zero or a success. A dashboard that meets a code it does not know
   and shows nothing has invented an answer. A new code is therefore a
   deliberate client change, and adding one to the server without telling the
   client degrades gracefully instead of lying.
3. **Every code has one of two kinds of next step, and the table says which:**
   something the user can do, or nothing they can do. *Nothing they can do* is
   a real and acceptable answer, written as such. What is not acceptable is an
   error that implies an action the user does not have.

### Authentication and session

| Code | The UI shows | Next step |
|---|---|---|
| `CODE_INVALID` | "That code did not work. Request a new one." | Re-send. **One message for expired, used and wrong, because the server deliberately answers all three identically** (§4) — copy that distinguished them would leak what the server refuses to |
| `UNAUTHENTICATED` | the signed-out state for the whole screen, not an error toast | Sign in. The screen's own data is cleared first: a stale watchlist under a sign-in prompt is another user's data as far as the next person at that keyboard knows |
| `CSRF_FAILED` | "This page was open too long. Reload and try again." | Reload. Never retried automatically — a silent retry of a state-changing request is the thing CSRF protection exists to stop |
| `RATE_LIMITED` | "Too many attempts. Try again in N minutes." from `Retry-After` | Wait. The control is disabled for that long rather than left clickable, and the countdown is shown |
| `WALLET_LINKED_ELSEWHERE` | "That wallet is already linked to another account." | **Nothing they can do here.** No "contact support" — there is no support channel, and offering one is a promise with a date on it |
| `CHALLENGE_INVALID` | "The signing request expired. Try linking again." | Retry from the start. Never reuse a challenge |
| `WALLET_PAYS_FOR_WATCHED_CONTRACT` | which watched contracts this wallet pays for, and that unlinking does not stop the allowance on chain | Move those contracts to another wallet or turn their autopilot off, **and** the revoke button beside unlink. *(Row added by CEF when folding #351, for Fatih's unlink decision; copy for WEBF to confirm.)* |

**The rule the login screen is built around:** nothing on it may suggest an
email session can move XLM (`PH2-E3-01`, ADR-008). That is copy, not an error
code, and it is why "Extend now" is never reachable from a signed-in state
without a linked wallet and a live allowance — the button is absent, not
disabled.

### Health, and the three honest states

**This is not an error taxonomy and it must not be rendered as one.** Core
emits `'healthy' | 'warning' | 'critical' | 'unknown'` plus `isExpired`, and
`PH2-E1-01` adds `expired` as its own TTL status. The dashboard renders
**three conclusions**, which is the product's thesis and not a style choice:

| Conclusion | From | Rendered as |
|---|---|---|
| **healthy** | `health: 'healthy'` with its observation | the healthy chip and its word |
| **at risk** | `'warning'`, `'critical'`, or expired | the matching chip; `expired` carries *archived* or *deleted*, never the same chip for both |
| **undetermined** | `'unknown'`, a missing observation, or **any failed read** | its own colour, its own shape and its own word |

- **Absence is not health.** `UPSTREAM_UNAVAILABLE` on a watch item renders
  **undetermined**, never "healthy", never an empty row, never "not found".
  This is the one the taxonomy exists for.
- **The UI must distinguish two things that both render undetermined:** *the
  API answered and could not establish the state* versus *the API did not
  answer*. Same colour, different sentence, because the first is about the
  contract and the second is about us.
- **"No entry came back" is not undetermined.** It is a finding with its own
  copy, reported as a result with its observation. *(CEF, folding: on the wire
  it is never the `NOT_FOUND` error code. `POST /scans` answers `200` with an
  `entry-not-found` issue in the `ScanResult`, exactly as `scan --json` does.
  `NOT_FOUND` is for a missing route resource, such as an unknown job ID.)*
- **A health state without `observedAtLedger` is a client-side error, not a
  state to render.** §2 says the API never returns one; if it does, the
  dashboard shows undetermined and that is a P0 against the Definitions of
  Done, not a display bug.

### Watchlist, jobs and allowance

| Code | The UI shows | Next step |
|---|---|---|
| `AUTOPILOT_OFF` | the autopilot toggle, with what turning it on needs | Turn it on. This is a precondition stated as one, not a failure |
| `ALLOWANCE_MISSING` | "No allowance yet. Approve one to let Evergreen extend for you." | Approve, in the user's wallet — **with the full §3.3 disclosure, every time**: amount in XLM *and* stroops, the spender, the expiry as a date *and* a ledger, and that a new approve **replaces** the current cap |
| `ALLOWANCE_EXPIRED` | the amount and the ledger it expired at, not just the word | Re-approve, same disclosure. Shown with how long the autopilot has been stopped, because an expired allowance silently not protecting a contract is the failure this product names |
| `DAILY_LIMIT_REACHED` | "You have used today's extends for this contract (N of N)." with the reset time, from `details` or the item's `extendNow` | Wait, or let the autopilot handle it. **The screen states the limit before it is reached** (Fatih, 2026-10-21) — a limit a user discovers by hitting it reads as a fault, so the count is shown beside the control from the first use, not only on refusal |
| `THRESHOLD_BELOW_FLOOR` | the floor, and that it comes from the engine's measured scheduler gap | Raise the threshold. **The floor's number is quoted from the API, never typed into the client** |
| `NETWORK_NOT_WRITABLE` | nothing. **Unreachable from this UI** | — see below |
| `NETWORK_UNAVAILABLE` | "That network cannot be read here yet." | Switch back to testnet |
| `IDEMPOTENCY_KEY_REUSED` | "That action was already taken." and then the existing job | **Nothing to retry** — this is the protection working, so it reads as information, not failure |

**`NETWORK_NOT_WRITABLE` should be unreachable from the dashboard** and is
listed so it is handled rather than assumed away. The site refuses to be
*built* for anything but testnet (`PH2-E1-03`), so a client that could send a
mainnet write would be a second defect. If it ever arrives, it renders as
undetermined with the generic sentence — which is the closed-set default doing
its job.

**One thing the client needs that §7 does not provide.** `ALLOWANCE_EXPIRED`
and `GET /allowance` give a status, and the copy above needs *how long it has
been expired* to say "nothing has been protected since …". `liveUntilLedger`
plus `observedAtLedger` is enough to derive it, and the client should derive it
rather than ask for a field. Noting it so nobody adds one.

---

## 9b · Screen → call map (WEBF)

What each screen calls, and what it must not. **No screen calls a route it does
not need** — the watchlist does not fetch allowance state until an item shows
autopilot, because a page that reads a wallet's balance to render a list has
made a list into a financial disclosure.

| Screen | Card | On load | On action |
|---|---|---|---|
| `/` landing, `/docs/*`, `/about/` | shipped | **nothing.** Static, and they stay static | — |
| the shell's status bar | shipped | one RPC read, in the browser, no API | — |
| `/dashboard/scanner/` (anonymous scan) | `PH2-E3-03` | nothing | `POST /scans`, **or the browser's own scan as today** — see the note below |
| login | `PH2-E3-01` | `GET /me` | `POST /auth/email/start` → `POST /auth/email/verify` |
| account | `PH2-E3-01` | `GET /me` | `POST /wallets/challenge` → `POST /wallets`; `DELETE /wallets/{account}`; `POST /auth/logout` |
| watchlist | `PH2-E3-02` | `GET /watchlist` | `POST /watchlist`; `PATCH …`; `DELETE …` |
| one watch item | `PH2-E3-02` | from the list's `lastObservation` — **no second call** | `POST /scans` to refresh; `GET /jobs?contractId=` for its history |
| extend (WEBR) | `PH2-E3-04` | `GET /wallets/{account}/allowance` | `POST /jobs` with `Idempotency-Key`; then `GET /jobs/{id}` |
| allowance (WEBR) | `PH2-E3-05` | `GET /wallets/{account}/allowance` | nothing through the API — the wallet signs, the API reads |
| support (WEBR) | `PH2-E3-07` | nothing | nothing |

**Anonymous scan keeps working in the browser, and that is a decision, not an
omission.** Scanning from the browser straight to the chain is a trust property
the product argues for: anyone can check a contract without trusting us, and it
costs about 165 KB gzipped per live page (measured, `PH2-BL-03`). Fatih
confirmed it on 2026-10-15. `POST /scans` exists for the watchlist's add and
refresh paths, where there is a server in the loop anyway.

**`GET /me` is the session's single source of truth** and carries the CSRF
token, so every screen that can make a state-changing request has it from one
call. A screen that has not called `GET /me` may not render a signed-in state.

---

## 9c · What may be cached (WEBF)

The discipline the site already has: **a figure read live says so, and a figure
that was recorded says when.** This maps it onto the API.

| Data | Cache | Why |
|---|---|---|
| `GET /me` | in memory, for the page's life | Invalidated by logout and by any `UNAUTHENTICATED`. Never `localStorage`: a session fact in a store that outlives the session is how the next person at that keyboard sees the last one's state |
| `GET /watchlist` | yes, with its `lastObservation` age **shown** | The list is the engine's last scan, not now. The age is rendered beside every health state, not hidden in a tooltip |
| `POST /scans` results | yes, keyed by `(network, contractId, dataKeys)`, age shown | A scan is an observation at a ledger. It does not become stale, it becomes **older**, and the UI says how much |
| `GET /jobs/{id}` **while in flight** | **never** | A job moves through pull, extend, reconcile. A cached "pulled" rendered as current is a wrong answer about money |
| `GET /wallets/{account}/allowance` **before signing** | **never** | The screen that asks a user to approve a cap must show the cap that is live at that moment. §3.3's "a new approve replaces the current one" is only true copy if the current one is current |
| `GET /ledger` | yes, paginated, append-only | Rows do not change once written |
| the status bar's ledger | not cached | It is the page's one claim to being live |

**Two rules that outrank the table.**

- **Nothing cached is rendered without its age.** If a screen cannot show the
  age, it may not use the cache.
- **Cache is per session and in memory.** No `localStorage`, no
  `sessionStorage`, for anything derived from a signed-in call. The site's own
  rule for browser storage is per-viewer conveniences only, and a watchlist is
  not a convenience.

---


## 10 · Decided, and still open

**Decided by Fatih, 2026-10-20:**
1. **Location:** option B (§1).
2. **A wallet that pays for a watched contract cannot be unlinked.** The revoke button is shown next to unlink (§4).
3. **Session lifetimes, sign-in codes and rate limits:** the starting values in §3, as configuration.
4. **"Extend now"** is limited per contract, at 3 a day. The count travels on each `WatchItem` (`extendNow`), not on `GET /me`. That answers WEBF's question 6 the other way, because the limit is per contract and §9b renders one item from the list without a second call.
5. **The cap-sizing estimate** waits for the fee percentage (`PH2-E5-03`).

**Still open:**
6. **Which account the dashboard's Pages project lives in** (§1, ADR-003 2026-10-21). Option B's service binding needs it in the same account as the API Worker.
7. **Router-contract extends** (`PH2-E4-07`) do not pass through a job. If the router is viable, how its transactions reach the fee ledger (DoD-1 counts "an extend recorded in the fee ledger") needs a route. That is undecided until the spike's verdict.
8. **Rakha's schema review** (`PH2-E2-03`). Where the stored shape disagrees with §6 and §7, the schema wins. The allowance history behind `lastKnown` is one thing it must hold.
9. **Machine-checkable form.** Once this text is agreed, the shapes above move into `packages/shared-types` as TypeScript types both sides compile against. That is a shared-types change, so Fatih reviews it.
