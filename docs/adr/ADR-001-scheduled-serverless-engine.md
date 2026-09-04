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

**Harder:** worst-case reaction time equals the cron interval — fine for our thresholds, but it must be documented so users set thresholds with the interval in mind. Overlapping runs are possible, so the engine needs idempotency and in-flight handling (W3-D18-02). Cold starts and scheduler reliability become failure modes to alert on (W3-D21-01) — a missed run must be visible, not silent.

**Committed:** the engine is stateless between runs; all state lives in the bump-history store (ADR-003).

**Revisit when:** a protocol partner needs sub-minute reaction, or contract churn is high enough that per-run scanning gets expensive. That's the P2 "always-on engine mode" in PRD §7 — a SOW 2 candidate, not a v1 problem.
