# Architecture

Read alongside `docs/PRD.md` (what and why) and `docs/SOROBAN-PRIMER.md` (domain semantics).

## Shape

```
                    Soroban RPC (testnet)
                            │
                            ▼
                   packages/core
        ┌──────────────────────────────────────┐
        │  rpc client · TTL math · rent model   │
        │  storage optimizer · decision rules   │
        └──────────────────────────────────────┘
             │              │              │
             ▼              ▼              ▼
     packages/cli    packages/engine   apps/dashboard
      `evergreen`     scheduled bump    public read-only
                            │            (+ P1 user-signed
                            │              extend)
                            ▼                 ▲
                    bump history store ───────┘
                            │
                            ▼
                  NotificationChannel
                   (EmailChannel v1)
```

Everything shares `packages/shared-types`. `core` never imports from `cli`, `engine`, or `dashboard` — the dependency arrow points one way only.

## The property everything else rests on

**TTL extension is permissionless.** Anyone may submit `ExtendFootprintTTLOp` against any ledger entry if they pay the resource fee (see `docs/SOROBAN-PRIMER.md`). Evergreen therefore needs *no authority over a user's contract*, and no component should be designed as though it does.

Two invariants follow, and they bind every module:

1. **Authorization is only ever about payment.** A wallet signature authorizes a fee, never access. Any code, type, doc string, or UI label implying that a user grants Evergreen permission over their contract is a bug.
2. **The user always pays their own extend fees.** Apex never funds another party's rent. See ADR-004; this is what keeps us clear of the hosted-billing non-goal.

## Modules

### `packages/shared-types`
The seams. `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`, `Signer`. Changing a type here ripples across every workstream, so changes need a note in STATUS.md.

Three shape requirements come from decisions that are cheap to honour now and expensive to retrofit (ADR-004):

- **`BumpRecord` carries the payer as a field distinct from the contract.** Never assume the payer is the contract owner, and never assume one global bot identity.
- **`EvergreenConfig` expresses N contracts watched by M payers.** The bot account is not a process-wide singleton.
- **`Signer` is an interface, not a concrete key.** Signer resolution is per payer, so the plain funded account (Stage 1) and the capped policy signer (Stage 2) are drop-in for one another — and a future hosted engine can resolve a different signer per contract without a rewrite.

v1 does not implement multi-tenancy. It must simply not foreclose it. If a shortcut would close that door, flag it rather than take it.

### `packages/core`
All the logic worth testing:
- **RPC client** — wraps `getLedgerEntries` + latest-ledger lookup. The only place that talks to the network.
- **TTL math** — `remainingLedgers`, projected archive ledger, projected archive date. Ledgers are the unit of truth; dates are derived for display.
- **Rent model** — estimated cost to extend N ledgers, per entry and per contract. **Reads fee parameters from the network rather than hardcoding constants** — network state and protocol upgrades move them, and a constant validated once in Week 2 is quietly wrong by Week 4. Validated against a real tx fee (W2-D9-02).
- **Storage optimizer** — flags oversized/duplicated entries and data in the wrong storage class.
- **Decision rules** — given a `ScanResult` and thresholds, return a `BumpDecision`. Pure function, no I/O; this is what makes the engine testable without a network.

### `packages/cli` — `evergreen`
Thin. Parses args, calls `core`, formats output (human + `--json`), maps errors to readable messages, sets exit codes (non-zero below threshold — the GitHub Action depends on this contract). Commands: `scan`, `extend`, `optimize`.

### `packages/engine`
A scheduled job, not a daemon (ADR-001). One run = load config → scan registered contracts → evaluate decision rules → submit `extendTTL` for those that need it → record `BumpRecord` → notify. Dry-run by default; live submission is explicit.

Signing goes through the `Signer` interface. Two implementations, sequenced:

- **Stage 1 — plain funded account.** An Ed25519 keypair holding only enough XLM to pay extend fees. This is the critical path and what the README teaches, because it is what makes the quickstart short.
- **Stage 2 — capped policy signer** (ADR-002). The hardened path for self-hosters, documented in `docs/POLICY-SIGNER.md`. In v1 the hot key lives on *the user's* server with *the user's* lumens on it, so capping its capability protects the user — that, not the SOW line item, is why it is worth building.

Idempotency and in-flight handling matter because scheduler runs can overlap.

### `apps/dashboard`
Two layers, and the second must be genuinely removable:

**P0 — public read-only.** No wallet, no signup, no accounts. Two things it shows:
- **Scan any contract.** Because scanning is a permissionless read, anyone may paste any contract ID and see TTL health, projected archive date, and rent estimate. `core` already does this and the dashboard already renders `ScanResult`, so the cost is near zero and it makes the deployed instance a real utility rather than a display case.
- **Bump history for contracts this instance monitors.** For anything else, that section reads "not monitored by this instance" — it does not imply the contract is unprotected, only that we have no history for it.

**P1 — wallet connect + "extend now."** A user signs a payment to extend a contract's TTL themselves. Additive only.

Two constraints on this module:

- **No automated write path.** The dashboard never bumps anything on its own; only a user-initiated, user-signed extend, and only at P1. Automated bumping belongs to the engine.
- **The read-only layer is the whole product on its own.** It must ship complete — no dead buttons, no auth-gated empty regions — if the write path never lands. Build the public view first and add signing on top, never build "the dashboard minus auth."

The deployed instance is a **demonstration instance, not a service**: it reads our bump history over our own guinea-pig contracts. Its scan feature works for anyone; its history does not, and the UI says so.

### `evergreen-check` (GitHub Action)
Wraps the CLI's `scan` and fails a CI job when any contract is below threshold. Its entire contract with the rest of the system is the CLI's exit code and `--json` output — keep both stable once published.

## Data flow, end to end

1. **Config** (`evergreen.config.json`) lists contracts + thresholds + payer/signer resolution. Shared by CLI and engine so behavior can't drift between them.
2. **Scan**: RPC client fetches ledger entries → TTL math computes remaining ledgers and projected archive → rent model attaches cost → `ScanResult`.
3. **Decide** (engine only): decision rules turn `ScanResult` + thresholds into `BumpDecision`.
4. **Act** (engine only): submit `extendTTL` via the resolved `Signer` → `BumpRecord` persisted → `NotificationChannel` fires.
5. **Observe**: dashboard reads history + serves live scans; CI Action reads exit codes.

## Persistence

Bump history is written by the engine and read by the dashboard. The concrete choice is ADR-003, pending the Week 1 hosting decision (W1-D5-03 → W1-D6-04).

**Frame the choice as atomicity, not storage.** ADR-001 accepts that scheduled runs can overlap, and `W3-D18-02` promises we never double-bump an entry. That guarantee needs a durable write the engine can use as a lock or a last-bumped record — so the question is *"what gives a scheduled job an atomic-enough write?"*, not *"where do we keep history?"*. The two questions pick different answers: JSON committed to the repo is adequate history and useless as a lock, which disqualifies it.

A `BumpRecord` carries: contract ID, entry key, ledger before/after, tx hash, timestamp, decision reason, outcome, **payer**, and **which signer produced it** (Stage 1 or Stage 2) — the last so evidence captured before and after the policy signer lands reads as a progression rather than a contradiction.

## Boundaries we're deliberately holding

- **No mainnet path in the code.** Not a flag, not a branch. Out of scope for this grant (PRD §3).
- **No custody, and nothing to have custody of.** The engine holds only its own fee lumens. It never holds a user key and never needs one.
- **Evergreen never pays another party's extend fees.** Unbounded cost, and it is the hosted-billing non-goal wearing a DX costume (ADR-004).
- **No hosted multi-tenant service in v1.** Users self-host. The data model must not foreclose a hosted engine later; the code must not implement one now.
- **Channels are pluggable but only email ships.** `WebhookChannel`/`TelegramChannel` exist as interface-conformant stubs marked SOW 2 — foundation, not half-features.
