# W3-D18-03 — read-only B/C capture

This supplements [the crossing runbook](SEP-20-PREFLIGHT.md). It prepares evidence
collection; it does not complete the crossing, expiry or unattended-operation gate.
Readiness is **Friday 2026-09-18**. The runbook date/manual-vs-unattended corrections
are also in pending PR #147; use the calendar dates below while that PR is reviewed.

## Operator checklist

- **Who is on each checkpoint is in the generated table below, not in this
  sentence.** This line used to read *"Fatih remains primary operator; Rakha is the
  backup"*, which Rakha's per-date confirmation in #104 inverted on 2026-09-15 —
  and this page went on saying it. This command does not install a timer or watch
  continuously.
- C's corresponding dates are **Friday Sep 25** and **Saturday Sep 26**.
  Projections are not observations: use measured ledger TTL and repeat a bounded
  read when needed.

<!-- BEGIN GENERATED: crossing-schedule (full) -->

**guinea-pig B is below its action threshold for 24 hours** — from ~2026-09-20 12:00 UTC to ~2026-09-21 12:00 UTC. Four captures across that window give a decay curve rather than two endpoints.

| Time (UTC) | WIB | B remaining | What it is | Primary | Backup — runs it if nothing is committed by |
|---|---|---|---|---|---|
| **Sun 2026-09-20 12:00** | Sun 19:00 | 17,280 | the crossing | **Rakha** | Fatih, 12:20 UTC |
| **Mon 2026-09-21 00:00** | Mon 07:00 | 8,640 | first decay reading | **Rakha** | Fatih, 00:20 UTC |
| **Mon 2026-09-21 06:00** | Mon 13:00 | 4,320 | second decay reading | **Rakha** | Fatih, 06:20 UTC |
| **Mon 2026-09-21 12:00** | Mon 19:00 | 0 | expiry — happens once | **Rakha** | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### Deliberately declined

- **Sun 2026-09-20 18:00 / Mon 01:00 WIB** — declined 2026-09-16. Not for want of a volunteer — it is the wrong place for a checkpoint. It would have made the sequence dense early and left a twelve-hour gap running into expiry, which is the interval a reader actually asks about. The 06:00 UTC slot fills that gap instead, and costs a lunchtime rather than a night.

Recorded rather than omitted: a slot that is simply missing reads as an oversight, and the next person re-proposes it.

<!-- END GENERATED: crossing-schedule -->

- Keep B/C and shared Wasm untouched. No funding, restore, signer, simulation,
  submission or protected acknowledgement belongs in this procedure.
- Use a reviewed, committed checkout with Node 24 and installed locked dependencies.
  The CLI refuses dirty runtime inputs and forces a TypeScript build before capture.
  Record the source commit; retain the matching checkout/runtime for later replay.
- Run `pnpm check` before operational use. Preparation remains local until the
  separate review and publication checkpoints.

## Capture and replay

Run from the repository root. Output must be a **new** directory; its parent must
exist. Use the actual UTC capture date in the eventual published evidence path.
The examples below use local ignored storage and do not publish anything.

```sh
mkdir -p .evergreen/crossing
pnpm capture:crossing --subject B --output .evergreen/crossing/B-before
pnpm verify:crossing .evergreen/crossing/B-before
pnpm capture:crossing --subject C --output .evergreen/crossing/C-before
pnpm verify:crossing .evergreen/crossing/C-before
```

At the action window, use a new directory and the normal threshold:

```sh
pnpm capture:crossing --subject B --output .evergreen/crossing/B-crossing
pnpm verify:crossing .evergreen/crossing/B-crossing --require-crossing
```

The normal threshold is 17,280 ledgers. The collector ignores inherited `BELOW`;
only an explicit rehearsal option changes it. For a controlled rehearsal:

```sh
pnpm capture:crossing --subject B --rehearsal-threshold 1500000 --output .evergreen/crossing/B-rehearsal
pnpm verify:crossing .evergreen/crossing/B-rehearsal
```

A rehearsal never qualifies, even on the real crossing date. Keep it separate from
real evidence. Offline tests create synthetic future captures only under temporary
directories, never `docs/evidence`.

After expiry, supply an earlier verified, non-rehearsal live capture:

```sh
pnpm capture:crossing --subject B --baseline .evergreen/crossing/B-crossing --output .evergreen/crossing/B-expiry
pnpm verify:crossing .evergreen/crossing/B-expiry
```

Repeat with C for its own window. A baseline can be `before-action` or
`crossing-refused`, for the same subject, and must not itself contain a baseline.
The current verifier requires matching runtime fingerprints for both captures;
keep the reviewed capture checkout stable across the window. If code must change,
retain the original checkout and captures rather than editing their manifests.

## What the result means

| Phase | Interpretation |
| --- | --- |
| `before-action` | Subject is live above the normal action threshold, with positive A/shared controls. |
| `crossing-refused` | Live subject is actionable and the existing engine/write guard refused it. Only a normal-threshold observation on/after that subject's crossing date qualifies for the dated gate. |
| `expiry-observed` | Both instance and persistent keys are now absent after their baseline expiries, with A/shared controls live and shared-code expiry unchanged. |
| `rehearsal` | Explicit threshold override; never actual crossing evidence. |
| `unverified` | Missing/inconsistent data, failed reads, absent baseline or unpinned runtime. Inspect the reason and artifacts; do not claim the event. |

TTL zero is still live. Instance and persistent expiry differ by one ledger, so
absence of only one key is insufficient. Temporary-key absence is retained as an
observation, not newly claimed as expiry. A before/after pair cannot prove there
was no intervening write; it proves the recorded observations. Retain independent
control history and the operational guard evidence for the broader decay claim.

Collector exit 0 means a classified capture, including before-action or rehearsal;
exit 2 means unverified/refused/incomplete. `result.json` separately records the
producer exit code: a successful producer followed by a failed control read remains
producer exit 0 and wrapper exit 2. `--require-crossing` returns 2 for every
nonqualifying phase. A filesystem failure can leave an incomplete directory;
preserve it and retry to a new path, never overwrite or repair captured bytes.

## Retain and publish evidence

Each sealed directory contains raw JSON-RPC requests/responses and transport
status, producer stdout/stderr, source/build fingerprints, timestamps, summary,
checksums and, where used, a verified baseline snapshot. Requests are restricted
to Testnet `getNetwork` and `getLedgerEntries`, with bounded calls/timeouts. The
collector does not load `.env` or send credentials. Raw responses are retained
before parsing. Preserve the entire directory including its dot marker.

The offline verifier checks checksums and complete inventory, then replays the
installed producer against recorded responses without network access. It binds
summaries and stdout to the reads, including control key/XDR ownership. Use the
recorded source and Node version for strict replay. New probe/engine/liveness
messages use explicit `en-US` numeric formatting so operator and CI locales can
differ; the machine locale is retained as provenance, not a replay requirement. Hashes detect alteration
relative to the retained manifest; they are not an independently signed RPC receipt.

The dated repository gate verifies sealed bundles semantically using current trusted
code while allowing historical runtime fingerprints. It never executes captured
code. Changes to producer rendering/semantics can require an explicit compatibility
update. Supporting JSON and copied baseline refusals cannot count as separate events;
legacy flat probe logs remain supported by the existing gate.

After review/publication approval, copy complete verified captures to
`docs/evidence/YYYY-MM-DD-.../`, index them in `docs/EVIDENCE.md`, and commit on the
actual capture day. Keep explanatory notes and screenshots adjacent to, not inside,
the sealed directory: extra files invalidate its closed inventory. A refusal has no
transaction hash or explorer transaction. This tool does not produce alert-email
screenshots or replace the three-artifact rule for any separate real transaction.
Do not extend shared Wasm until Fatih accepts the required B/C evidence and explicitly
performs the protected handoff. Calendar arrival alone does not authorize that write.
