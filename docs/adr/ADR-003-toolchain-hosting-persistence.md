# ADR-003: Toolchain, hosting, scheduler, and persistence

**Status:** Partially decided — toolchain settled 2026-09-04 (W1-D3); GitHub Actions + Node 24 selected for the scheduler smoke test on 2026-09-06 (`W1-D5-03`), with manual and genuine scheduled reads verified 2026-09-07. Dashboard hosting (`W1-D5-02`) and persistence/locking (`W1-D6-04`) remain open.
**Date:** 2026-09-04
**Deciders:** Fatih, Rakha

## Context

Four infrastructure choices were left open at planning time. Toolchain was settled first. Hosting, scheduling, and persistence are related, but their proofs now have separate backlog tasks: dashboard hosting at `W1-D5-02`, a scheduler smoke test at `W1-D5-03`, and an atomicity probe at `W1-D6-04`.

## Part 1 — Toolchain (decided)

**Node 24 LTS**, pinned via `.nvmrc`. **pnpm workspaces** for the monorepo. **TypeScript strict** from `tsconfig.base.json`. **ESLint (flat config) + Prettier.**

**Test runner: Vitest, not Jest.** Native ESM and TypeScript with no transform layer to configure, first-class workspace support matching our pnpm layout, and `vitest --coverage` via v8 needs no extra plumbing for the coverage report the SOW requires as evidence. Jest is the more familiar default and would work; it costs a `ts-jest`/babel transform config in every package, which is exactly the kind of setup tax a 30-day sprint should not pay. Reversible if it disappoints — the test API surface we use is nearly identical.

## Part 2 — Hosting, scheduler, and persistence

### Scheduler choice — local, manual GitHub, and scheduled verification complete

Use **GitHub Actions with Node 24** as the initial scheduler, at a nominal 15-minute cadence. The repository already uses that runner/toolchain for CI, and each run exposes its event, commit, exit status, and logs for review. This follows the existing `W1-D5-03` option to use Actions first and defer additional hosting decisions.

The read-only smoke script pins `@stellar/stellar-sdk` **17.0.1** and calls `getNetwork()` followed by `getLedgerEntries()` for guinea-pig A's instance. On 2026-09-06 it succeeded locally on **Node 24.13.0**, verifying the Testnet passphrase and reading a live TTL. See the [runtime record](../evidence/2026-09-06-scheduler-smoke/README.md). This verifies the two SDK read paths; signing and engine execution are later tasks. Cloudflare Workers was **not tested** in this task; its compatibility is still unknown.

The workflow provides `workflow_dispatch` and a UTC schedule at minutes `7,22,37,52`. Both require the workflow to exist on the default branch. [PR #24](https://github.com/Fatihmaull/evergreen/pull/24) merged on 2026-09-07. Manual run [34110254224](https://github.com/Fatihmaull/evergreen/actions/runs/34110254224) and genuine `schedule` run [34111732199](https://github.com/Fatihmaull/evergreen/actions/runs/34111732199) then succeeded on `main` (`5509c44`), verifying SDK 17.0.1 reads on the hosted Node 24.20.0 runner. Full logs and metadata are in the [GitHub runtime record](../evidence/2026-09-07-scheduler-runs/README.md). **The `W1-D5-03` runtime proof is complete.** Exported evidence is published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27), awaiting merge.

GitHub schedules are [best-effort and may be delayed or dropped](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); 15 minutes is not a maximum reaction time. The engine's future threshold and missed-run handling must tolerate that. Workflow concurrency limits smoke-test overlap, but does not supply a durable per-entry lock: that remains `W1-D6-04` and the Week 3 engine implementation.

This workflow only reads public Testnet data. It needs no signing secret, account funding, database, or email integration.

### The question to ask

Frame persistence as **atomicity, not storage.** ADR-001 accepts that scheduled runs can overlap; `W3-D18-02` promises the engine never double-bumps an entry. That guarantee needs a durable write usable as a lock or a last-bumped record.

Asked as "where do we keep bump history?", flat JSON committed to the repo looks adequate. Asked as "what gives a scheduled job an atomic-enough write?", it is disqualified. Same decision, different answers — ask the second question.

### Shortlist

| Platform | Cron | State / locking | Notes |
|---|---|---|---|
| **Cloudflare Workers + D1** | Cron Triggers, 1 min minimum | D1 transactional lock row gives real atomicity. KV is eventually consistent and **not** safe as a lock under contention. | Purest fit for ADR-001, generous free tier. **Blocking risk: Workers is not Node.** Verify the Stellar SDK actually runs there (`nodejs_compat`, crypto/buffer deps) before committing. |
| **Railway** | Cron as a service type; runs the container's start command on schedule | Volumes + managed Postgres | Plain Node runtime, so zero SDK-compatibility risk. Bills per second, idle ≈ free; Hobby $5/mo. Lowest-surprise option. |
| **Render** | Native cron jobs | Managed Postgres | Near-identical to Railway; choose on account/DX preference rather than capability. |
| **GitHub Actions cron + hosted DB** (Neon / Turso / Supabase) | Scheduled workflows | External DB provides the lock; Actions alone provides none | Public run logs are easy to review; export the proof logs for grant evidence. **Risk: scheduled workflows are best-effort and can be delayed well past the interval** — the threshold design must tolerate it and a missed run must alert. |

> ### ⚠️ Having a Cloudflare account does not decide persistence
>
> Once the account exists for Pages there is an obvious pull toward *"we're on Cloudflare anyway, so D1."* **Resist it.** The two parts are separable and only one is blocked:
>
> | Part | Status | Blocked on the SDK question? |
> |---|---|---|
> | Dashboard hosting | **Settled — Cloudflare Pages** | No. Pages is static hosting and never touches the Stellar SDK. |
> | Engine runtime + persistence | **Open** | **Yes, blocking.** |
>
> The unanswered question is still *does the Stellar SDK run in the Workers runtime?* If it does not, the engine is not on Cloudflare — and reaching D1 from another platform is awkward enough to be a bad default arrived at by momentum rather than by decision.
>
> Answer the SDK question on its own merits, timeboxed to one afternoon. If it stays ambiguous past that, **the ambiguity is the answer** and the Actions cron floor carries us.

### Dashboard hosting is a *separate, much smaller* question

Worth separating explicitly, because the shortlist above is about running the **engine** and it does not apply here.

**The P0 dashboard needs no backend.** Scanning is a permissionless read, so the browser calls Soroban RPC directly — there is no server-side secret, no signing, and nothing to keep warm. Bump history is the only server-shaped need, and it is read-only; it can be fetched client-side from whatever ADR-003 Part 2 chooses, or published as a static JSON artifact.

So the dashboard is a **static site**, and Vercel, Netlify and Cloudflare Pages are functionally identical for it — all free at our scale, all deploy from a GitHub push. **This decision does not deserve deliberation**; it deserves whichever account exists already.

**Recommendation: Cloudflare Pages**, on one non-obvious ground rather than any hosting merit — it comes with the account needed to test whether the Stellar SDK runs on Workers, which is the single blocking unknown left in Part 2 above. One signup answers a hosting question we barely care about *and* unblocks one we care about a lot. If a Vercel or Netlify account already exists, use it and test Workers separately; the dashboard genuinely does not care.

### Evaluation order

1. Does the Stellar SDK run there at all?
2. Can it give a real lock?
3. Cost.
4. How easily can a non-technical reviewer see it working?

### Constraint from ADR-004

Whatever is chosen must not model "the bot account" as a process-wide singleton. The schema needs `BumpRecord.payer` distinct from the contract, and config shaped as N contracts × M payers. v1 need not implement multi-tenancy — it must not foreclose it.

## Part 2 — DECIDED 2026-09-08

**Runtime: GitHub Actions cron + Node 24. Persistence: PostgreSQL on Neon — adopted in Week 4, deliberately NOT before the Sep 20 proof.**

### Runtime

Actions cron is already proven end to end: a genuine `schedule` event read testnet successfully (`W1-D5-03`). A bounded local Workers probe passed SDK import, XDR and testnet reads via `wrangler dev --local`, but deployment, cron, signing and D1 remain unverified. That is enough to stop spending time on Workers, not enough to move to it ten days before a gate.

### Why persistence waits

Three findings, in increasing order of importance.

**1. Neon's free-tier arithmetic can land on the crossing date.** The cron is `7,22,37,52` — 4×/hour, 2,880 runs/month. Neon's free plan suspends after a 300s idle window that cannot be disabled, so every run bills that window: **240 compute-hours/month against a 100-hour allowance.**

| Autoscale ceiling | CU-hours | Outcome |
|---|---|---|
| 0.25 CU | 60 / 100 | fits |
| 1.0 CU | 240 / 100 | **exhausts day 12.5 — 2026-09-20** |

Exhaustion is a hard stop, not degradation; there is no free-plan warning email, and the allowance resets on the billing period (~Oct 8 for an account opened Sep 8) — after the deadline. It would remove Sep 20 and Sep 25 together. **The outcome depends on the autoscale ceiling, which we have not measured — and that uncertainty is itself the argument.**

Supabase was worse for this shape: un-pausing is a manual dashboard action with no connection-triggered resume, and the IPv4 pooler in transaction mode silently breaks session-scoped advisory locks — passing on a direct local connection and failing only in production.

**2. The lock protects against something that cannot currently happen.** `scheduler-smoke.yml` already carries `concurrency:` with `cancel-in-progress: false` and `timeout-minutes: 5` under a 15-minute cron, so overlapping runs are structurally impossible. `packages/engine` is still a placeholder.

**3. The ledger is already the durable atomic store.** After a successful bump, `remainingLedgers` sits above threshold, so the next run skips naturally. The bump decision is idempotent *without* a lock, because the operation records itself on chain.

### The asymmetry that settles it

A double bump costs a few testnet stroops and a duplicate row, and damages no evidence. **A paused or cold database on a Sunday costs the least recoverable proof in the grant.** Guinea-pig B's 24-hour window gives ~96 independent attempts; a held claim converts all 96 into one. Any coordination layer added before Sep 20 must therefore fail *open*, and the spike's — correctly, for its own stated goal — fails closed.

### ⚠️ Unmeasured assumption — read this before provisioning anything

**We never measured the Neon project's default autoscale ceiling.** The arithmetic above swings entirely on it:

- at **0.25 CU** → 60 of 100 CU-hours, fits with room;
- at **1.0 CU** → 240 of 100, exhausts on the crossing date.

**Measuring it is the first step of Week 4 adoption, before any migration runs** — not a detail to resolve while wiring things up. An unmeasured assumption written down is a task; left in a comment it is a trap.

**And it is not the load-bearing argument.** The decision to wait rests on three things that hold at *any* ceiling:

1. The lock solves a problem that cannot currently occur — `concurrency` plus `timeout-minutes: 5` under a 15-minute cron already makes overlap structurally impossible.
2. The ledger is already the idempotent store — after a bump, `remainingLedgers` is above threshold and the next run skips naturally.
3. The cost asymmetry runs backwards — a fail-closed lock in front of a one-shot, unrepeatable deadline.

So even at 0.25 CU with room to spare, provisioning before Sep 20 would still be wrong. **If you are reading this in Week 4 and reaching for Neon: the decision was about *when*, and these three reasons are why — re-read them before assuming the wait was only about quota.**

### Prerequisites for adopting the spike in Week 4

Both were reproduced against the spike's own code on local Postgres 16.15, 2026-09-08. **Neither may be inherited silently.**

1. **`pending` is terminal with no reconciliation path.** `claim()` takes over only `WHERE current.phase = 'claimed'`; `prepare()` sets `'pending'`. A process dying between `prepare()` and `complete()` strands the entry permanently. Measured: **0 non-null returns from 100 `claim()` attempts** past lease expiry. This is deliberate and fail-closed — `prepare()`'s comment reads *"Pending work never expires into a new send"* — so the fix is **not** a timer, which would reintroduce the double-send it prevents. It is reconciliation: resolve the stored `transaction_hash` with `getTransaction()` and let the chain decide.
2. **Failed outcomes are unstorable.** `history` carries `CHECK (record->>'outcome' = 'succeeded')`. A `failed` record is rejected by the constraint while `succeeded` inserts — verified both directions. `BumpRecord` already distinguishes simulated/submitted/succeeded/failed, so the schema is narrower than the type it stores.

### What ships instead, before Sep 18

`W2-D10-04`: **the run exits non-zero when it observes an entry below threshold and did not bump it** — including when a claim is held. This converts the silent-skip failure into a loud one and matters more than the provider choice.

## Consequences

- The scheduler preparation adds a root development dependency for the standalone smoke script; it does not yet change the engine or core package APIs.
- The manual and scheduled smoke workflow stays separate from offline PR tests. A missing A instance or RPC failure exits nonzero; it does not redeploy or extend anything automatically.
- The first successful manual and scheduled run URLs, event types, commit SHAs, and full logs are captured and published in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27), keeping the record available independently of GitHub log retention.
- Dashboard hosting, durable locking, and the real unattended-bump proof remain open under their own task IDs.

## Update log

- 2026-09-04: created. Toolchain decided; hosting/scheduler/persistence deferred to W1-D5-03 with the shortlist and evaluation order above.
- 2026-09-06: selected GitHub Actions + Node 24 for the initial scheduler; verified SDK 17.0.1 reads locally. Workflow published for review in [PR #24](https://github.com/Fatihmaull/evergreen/pull/24), tracking [Issue #23](https://github.com/Fatihmaull/evergreen/issues/23); merge and scheduled-run proof pending. Hosting and atomicity remain separate tasks.
- 2026-09-07: PR #24 merged; manual run `34110254224` and genuine scheduled run `34111732199` succeeded. Their full logs and metadata were captured and cross-checked. Runtime proof complete, evidence published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27); no change to the platform decision or the separate hosting/atomicity tasks.
