# ADR-001: Run the auto-bump engine as a scheduled serverless job

**Status:** Accepted
**Date:** 2026-09-04
**Deciders:** Fatih, Rakha

## Context

The auto-bump engine must notice a contract approaching TTL expiry and submit `extendTTL` before archival. The obvious instinct is an always-on monitoring service. We have 30 days, a $4,800 budget covering three deliverables, and a reviewer who needs to verify the thing works.

Key domain fact: TTL is measured in **ledgers**, not seconds, and ledgers close roughly every 5–6 seconds. Any sanely configured threshold leaves hours or days of headroom, not seconds.

## Options considered

**A. Scheduled serverless job** (cron every 5–15 min). No infrastructure to keep alive, no idle cost, runs are individually inspectable in logs. Reaction time bounded by the cron interval — irrelevant given TTL headroom is measured in days.

**B. Long-running service** (VPS/container). Sub-minute reaction, continuous state in memory. Costs ops attention we don't have during a 30-day sprint: patching, uptime monitoring, restart handling. Also harder for a non-technical reviewer to verify — "trust me, the daemon is running" versus a log of discrete scheduled runs.

**C. Hybrid** (scheduled now, daemon later). This is really option A with a roadmap note, not a separate architecture.

## Decision

Option A: a scheduled serverless job on a 5–15 minute cadence, dry-run by default, live submission explicit.

## Consequences

**Easier:** zero infra to maintain during the sprint; each run is a discrete, greppable artifact that doubles as grant evidence; the same trigger model as the CI Action, so one mental model covers both.

**Harder:** worst-case reaction time equals the cron interval — fine for our thresholds, but it must be documented so users set thresholds with the interval in mind. Overlapping runs are possible, so the engine needs idempotency and in-flight handling (W3-D16-02). Cold starts and scheduler reliability become failure modes to alert on (W3-D21-01) — a missed run must be visible, not silent.

**Committed:** the engine is stateless between runs; all state lives in the bump-history store (ADR-003).

**Revisit when:** a protocol partner needs sub-minute reaction, or contract churn is high enough that per-run scanning gets expensive. That's the P2 "always-on engine mode" in PRD §7 — a SOW 2 candidate, not a v1 problem.

## Amendment — 2026-09-15: explicit temporary retention (W3-D15-02b)

Fatih's [Shared decision](https://github.com/Fatihmaull/evergreen/issues/125#issuecomment-5668637410)
sets engine temporary retention **off by default**, with opt-in per declared entry.
Temporary storage is the contract author's deliberate choice of disposable data;
the engine must not infer permission to preserve it indefinitely.

Contract registrations may provide `temporaryEntryPolicies: [{entryKey, autoExtend}]`.
Each key must be a declared temporary key owned by that contract. Every repeated
registration must explicitly consent for that key; omitted/false vetoes. Adding a
new data key does not inherit consent. Decision and refreshed execution both enforce
this policy. The explicit manual CLI extension path is separate and unchanged.

Due entries skipped by policy still alarm. An opted-in temporary entry without a
confirmed save raises critical urgency, including dry-run and unconfirmed outcomes;
its message states that expiry deletes data permanently. Existing critical findings
stay critical; no higher tier or suppression mechanism is introduced. Irreversibility
explains urgency, not the default. The existing notification templates and transport
carry this through, including the bump-record branch that suppresses duplicate alerts.

Consent never bypasses known-live TTL, write guard, payer, target, network ceiling,
fee cap or explicit submit requirements. TTL zero is live. An expired temporary
entry cannot be extended or restored. B/C and shared-Wasm protection is unchanged.
