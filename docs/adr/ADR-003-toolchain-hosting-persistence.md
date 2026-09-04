# ADR-003: Toolchain, hosting, scheduler, and persistence

**Status:** Partially decided — toolchain settled 2026-09-04 (W1-D3); hosting, scheduler, and persistence **pending the W1-D5-03 decision on Fri Sep 5**
**Date:** 2026-09-04
**Deciders:** Fatih, Rakha

## Context

Four infrastructure choices were left open at planning time. One (toolchain) blocks scaffolding today. The other three are coupled — the hosting platform largely determines what persistence is available — and are decided together on Day 5.

## Part 1 — Toolchain (decided)

**Node 24 LTS**, pinned via `.nvmrc`. **pnpm workspaces** for the monorepo. **TypeScript strict** from `tsconfig.base.json`. **ESLint (flat config) + Prettier.**

**Test runner: Vitest, not Jest.** Native ESM and TypeScript with no transform layer to configure, first-class workspace support matching our pnpm layout, and `vitest --coverage` via v8 needs no extra plumbing for the coverage report the SOW requires as evidence. Jest is the more familiar default and would work; it costs a `ts-jest`/babel transform config in every package, which is exactly the kind of setup tax a 30-day sprint should not pay. Reversible if it disappoints — the test API surface we use is nearly identical.

## Part 2 — Hosting, scheduler, and persistence (pending W1-D5-03)

### The question to ask

Frame persistence as **atomicity, not storage.** ADR-001 accepts that scheduled runs can overlap; `W3-D18-02` promises the engine never double-bumps an entry. That guarantee needs a durable write usable as a lock or a last-bumped record.

Asked as "where do we keep bump history?", flat JSON committed to the repo looks adequate. Asked as "what gives a scheduled job an atomic-enough write?", it is disqualified. Same decision, different answers — ask the second question.

### Shortlist

| Platform | Cron | State / locking | Notes |
|---|---|---|---|
| **Cloudflare Workers + D1** | Cron Triggers, 1 min minimum | D1 transactional lock row gives real atomicity. KV is eventually consistent and **not** safe as a lock under contention. | Purest fit for ADR-001, generous free tier. **Blocking risk: Workers is not Node.** Verify the Stellar SDK actually runs there (`nodejs_compat`, crypto/buffer deps) before committing. |
| **Railway** | Cron as a service type; runs the container's start command on schedule | Volumes + managed Postgres | Plain Node runtime, so zero SDK-compatibility risk. Bills per second, idle ≈ free; Hobby $5/mo. Lowest-surprise option. |
| **Render** | Native cron jobs | Managed Postgres | Near-identical to Railway; choose on account/DX preference rather than capability. |
| **GitHub Actions cron + hosted DB** (Neon / Turso / Supabase) | Scheduled workflows | External DB provides the lock; Actions alone provides none | Free, and public run logs are excellent permanent grant evidence. **Risk: scheduled workflows are best-effort and can be delayed well past the interval** — the threshold design must tolerate it and a missed run must alert. |

### Evaluation order

1. Does the Stellar SDK run there at all?
2. Can it give a real lock?
3. Cost.
4. How easily can a non-technical reviewer see it working?

### Constraint from ADR-004

Whatever is chosen must not model "the bot account" as a process-wide singleton. The schema needs `BumpRecord.payer` distinct from the contract, and config shaped as N contracts × M payers. v1 need not implement multi-tenancy — it must not foreclose it.

## Consequences

*(Fill in when Part 2 is decided. Record the SDK-compatibility finding for Workers either way — it is useful to the ecosystem regardless of what we pick.)*

## Update log

- 2026-09-04: created. Toolchain decided; hosting/scheduler/persistence deferred to W1-D5-03 with the shortlist and evaluation order above.
