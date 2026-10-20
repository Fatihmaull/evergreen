# Evergreen API v1: the contract between the backend and the dashboard

**Status: DRAFT for review (`PH2-E2-02`), 2026-10-20.**
- **Server side:** written by CEF. It covers auth, watchlist, scan, allowance state, jobs and history, and fee-ledger reads.
- **Client side:** WEBF. The user-facing error taxonomy comes from WEBF and replaces the provisional codes in §9.
- **Rakha (CER) reviews** against the Neon schema he is drafting (`PH2-E2-03`). The spec's shapes follow what the engine actually stores; where his schema says otherwise, the schema wins and this changes.

Nothing is built against this until it merges. "Written before either side builds" is the card.

**Inputs:**
- [ADR-007](adr/ADR-007-allowance-funded-hosted-engine.md): the allowance and the hosted flow.
- [ADR-008](adr/ADR-008-authentication.md): auth.
- [`phase-2/PHASE2-PLAN.md`](../phase-2/PHASE2-PLAN.md) §3.1–§3.3 and the Definitions of Done.
- Rakha's Workers spike ([evidence](evidence/2026-10-15-workers-spike/README.md)).
- The shared types in `packages/shared-types`.

---

## 1 · Where the backend lives (this card decides it)

**A constraint found while writing this, and verified:** `pages.dev` and `workers.dev` are both on the Public Suffix List (publicsuffix.org, read 2026-10-20, Cloudflare's section). So `evergreen-stellar.pages.dev` and any `*.workers.dev` Worker are **different sites**. ADR-008's session cookie is `SameSite=Lax`, which a browser does not send on a cross-site `fetch`. **A backend on its own `workers.dev` hostname cannot use ADR-008's cookie from the dashboard.**

| Option | How | Trade-off |
|---|---|---|
| **A. Pages Functions** in the dashboard project | `/api/*` is a Function beside the static site, so it is same origin | Simplest. But the API's secrets (the SEP-10 signing key, Resend, Neon) live in the static site's project, and an API deploy is a site deploy |
| **B. Its own Worker, reached through a Pages Function proxy** (recommended) | API code in `apps/api` as its own Worker. The dashboard's `/api/*` is a few-line Pages Function forwarding over a **service binding** (Cloudflare: *"Service bindings enable you to call a Worker from within your Pages Function"*) | Same origin to the browser, so the cookie works. Secrets stay in the API Worker. The two deploy independently. One extra in-datacenter hop |
| **C. A custom domain** for both | Site and API as routes on one registered domain | Cleanest URLs. Needs a domain bought and owned. Not decided anywhere; that is Fatih's call |

**Recommendation: B, now.** It moves to C unchanged if a domain is bought later, because only the proxy goes away.
- **Folder:** `apps/api`.
- **Worker name:** `evergreen-api`.
- **Engine:** a separate Worker, Rakha's (`PH2-E4-04`). The API never signs or submits anything; it writes job rows the engine picks up.

**Plan.** The spike recommends **Workers Paid** for the engine.
- **[to verify]** whether Workers Paid is an account-level plan that then also covers the API Worker.
- If it is not, the API's CPU-heavy routes (§5's live scan and SEP-10 verification) need measuring against the free 10 ms limit before launch.

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
- Short-lived and rotated on use. The lifetime is **undetermined here**; I propose 12 hours idle and 7 days absolute, for Rakha and Fatih to set.
- Logout deletes the row.

**CSRF:** every state-changing request (`POST`, `PATCH`, `DELETE`) must pass both checks, or it is refused with `403 CSRF_FAILED`:
- **an `Origin` check:** it must equal the dashboard's origin;
- **a synchronizer token:** the `X-Evergreen-CSRF` header must equal the token stored on the session row and returned by `GET /me`.

**Rate limits:**
- They answer `429` with `Retry-After` (seconds) and error code `RATE_LIMITED`.
- They are **required**, not polish. ADR-008: without per-address and per-IP limits, the login form is a free mail relay.

| Route | Limit (proposed; the numbers are Fatih's) |
|---|---|
| `POST /auth/email/start` | per address and per IP, e.g. 5 per address per hour, 20 per IP per hour |
| `POST /auth/email/verify` | 5 attempts per issued code, after which the code is void |
| `POST /scans` | per IP for anonymous callers, per user for signed-in ones |
| `POST /jobs` | the **daily limit** per user (plan §3.3), plus a per-minute burst limit |

## 4 · Auth (ADR-008; built by `PH2-E2-04`)

| Route | Auth | Does |
|---|---|---|
| `POST /auth/email/start` `{ email }` | none | Sends a one-time code through the Resend channel. **Always `202`, whether or not an account exists**, so the route cannot enumerate users. The code: 10–15 min expiry, single use, stored hashed |
| `POST /auth/email/verify` `{ email, code }` | none | On success, creates the account if new, sets the session cookie, and returns `200 { user }`. Otherwise `401 CODE_INVALID`. An expired, used or wrong code gets the same answer |
| `POST /auth/logout` | session | Deletes the session row. Returns `204` |
| `GET /me` | session | `{ user: { id, email, createdAt }, wallets: Wallet[], csrfToken }` |

**A code, not a magic link** (proposed). It survives a phone-to-laptop switch and gives phishing nothing to click. ADR-008 allows either; the choice is Fatih's.

**Wallet linking** (the SEP-10 pattern; the pinned SDK 17.0.1 ships `WebAuth`):

| Route | Auth | Does |
|---|---|---|
| `POST /wallets/challenge` `{ account }` | session | Builds a challenge with `WebAuth.buildChallengeTx`, signed by the **challenge-signing key**. Returns `{ challengeXdr, networkPassphrase, expiresAt }` |
| `POST /wallets` `{ challengeXdr }` (signed by the wallet) | session + CSRF | Verifies it with `WebAuth.readChallengeTx` and `verifyChallengeTxSigners`, then links `account` to the user. Returns `201 { wallet }`, or `200` if already linked to this user. If another user has the wallet, `409 WALLET_LINKED_ELSEWHERE` |
| `DELETE /wallets/{account}` | session + CSRF | Unlinks the wallet. **See the open question in §10:** an allowance on chain does not go away when the link does |

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
| `GET /wallets/{account}/allowance` | session (own wallet only) | Reads the native-XLM SAC `allowance(from: account, spender: engine)` and the account's XLM balance **on chain, now** |

```ts
type AllowanceState = {
  network: 'testnet';
  account: string;
  spender: string; // the engine's public account
  amountStroops: Stroops; // 0 after a revoke
  liveUntilLedger: number | null; // null when none exists
  status: 'active' | 'expired' | 'none';
  balanceStroops: Stroops;
  observedAtLedger: number;
  observedAt: string;
  /** Renewal reminders go at 30, 7 and 1 days before expiry (plan §3.3); this is the estimate they use. */
  expiresAtEstimate: string | null;
};
```

- **The API never builds, signs or submits an `approve` or a revoke.** The dashboard builds it and the user's wallet signs it (`PH2-E3-05`, WEBR). The API reads the result.
- **"A new approve replaces the cap rather than adding to it"** (ADR-007) is UI copy, and the cap-sizing estimate is not served here yet. It depends on a fee percentage that does not exist until `PH2-E5-03`; see §10.

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
| `429 DAILY_LIMIT_REACHED` | the user's daily "Extend now" limit is used |
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

## 9 · Errors (provisional: WEBF's taxonomy replaces the user-facing set)

```json
{ "error": { "code": "DAILY_LIMIT_REACHED", "message": "…", "retryable": false, "details": {} } }
```

- `code`: stable, `UPPER_SNAKE`. Clients branch on it, never on `message`.
- `message`: for logs and developers. The dashboard writes its own copy per code.
- `retryable`: true only where retrying the same request can succeed: `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`.
- **An error never echoes a secret, an RPC URL, an email that isn't the caller's own, or another user's data.**

Codes used above: `CSRF_FAILED`, `RATE_LIMITED`, `CODE_INVALID`, `WALLET_LINKED_ELSEWHERE`, `CHALLENGE_INVALID`, `NETWORK_UNAVAILABLE`, `NETWORK_NOT_WRITABLE`, `THRESHOLD_BELOW_FLOOR`, `AUTOPILOT_OFF`, `ALLOWANCE_MISSING`, `ALLOWANCE_EXPIRED`, `DAILY_LIMIT_REACHED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `NOT_FOUND`, `UNAUTHENTICATED`, `UPSTREAM_UNAVAILABLE`.

**`UPSTREAM_UNAVAILABLE` means the RPC or the database did not answer.** It is never reported as "unhealthy" or "not found": absence is not health.

## 10 · Open questions

1. **Location** (§1). Recommended B, with a [to verify] on whether Workers Paid covers both Workers.
2. **Unlinking a wallet with a live allowance.** The allowance lives on chain, so unlinking cannot revoke it. **Proposed:**
   - the API refuses `DELETE /wallets/{account}` while any watch item uses it as `payerWallet`;
   - the dashboard shows the revoke (`approve(0)`, user-signed) next to unlink.
3. **Session lifetime** (§3) and **rate-limit numbers**: Fatih's numbers, Rakha's rows.
4. **Cap-sizing estimate.** Plan §3.3 sizes the cap as estimated rent × horizon × (1 + fee) × margin. There is no fee percentage until `PH2-E5-03`, and the copy rules forbid showing one before then. **Proposed:** `GET /allowance/estimate` arrives with `PH2-E5-03`; until then the UI sizes on rent × horizon × margin and says the fee is not set.
5. **Router-contract extends** (`PH2-E4-07`) do not pass through a job. If the router is viable, how its transactions reach the fee ledger (DoD-1 counts "an extend recorded in the fee ledger") needs a route. That is undecided until the spike's verdict.
6. **Machine-checkable form.** Once this text is agreed, the shapes above move into `packages/shared-types` as TypeScript types both sides compile against. That is a shared-types change, so Fatih reviews it.
