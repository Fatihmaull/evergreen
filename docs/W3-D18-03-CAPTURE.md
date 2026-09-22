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

*guinea-pig B's watch is complete (2026-09-20 → 2026-09-21). The table below is the NEXT one.*

🔴 **guinea-pig C has two dates, one day apart, and they are not interchangeable.** The **alert threshold** is ~2026-09-25 12:00 UTC; the **expiry is ~2026-09-26 12:00 UTC**, and the expiry is the unrepeatable one. Scheduling from the threshold alone arrives a day early — `write-guard.ts` owns both as `alertThresholdOn` and `expiresOn`.

**guinea-pig C is below its action threshold for 24 hours.** 4 captures across that window give a decay curve rather than two endpoints. Its instance entry ends at ledger 4,880,097 and its persistent entry at 4,880,099 — an expiry assessment needs a ledger above the **later** of the two.

| Time (UTC) | WIB | C remaining | What it is | Primary | Backup — runs it if nothing is committed by |
|---|---|---|---|---|---|
| **Fri 2026-09-25 12:00** ❓ | Fri 19:00 | 17,280 | the alert threshold | **Rakha** — *unconfirmed* | Fatih, 12:20 UTC |
| **Sat 2026-09-26 00:00** ❓ | Sat 07:00 | 8,640 | first decay reading | **Rakha** — *unconfirmed* | Fatih, 00:20 UTC |
| **Sat 2026-09-26 06:00** ❓ | Sat 13:00 | 4,320 | second decay reading | **Rakha** — *unconfirmed* | Fatih, 06:20 UTC |
| **Sat 2026-09-26 12:00** ❓ | Sat 19:00 | 0 | EXPIRY — Saturday, happens once, nothing comes after it | **Rakha** — *unconfirmed* | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### ❓ 4 slot(s) are REQUESTED, not assigned — this table does not yet claim coverage

Assigning someone work they have already declined, through an issue comment, is how it does not get done — and finding that out on the day is finding it out too late. So these were asked as a request, with a yes or a no wanted on **each one separately**:

- **Fri 2026-09-25 12:00 / Fri 19:00 WIB** — asked of Rakha in #104, 2026-09-22. Same shape as B's slot 1. Nobody has accepted it yet.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 12:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 00:00 / Sat 07:00 WIB** — asked of Rakha in #104, 2026-09-22. 07:00 WIB. B's equivalent slot was accepted as a standalone morning slot.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 00:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 06:00 / Sat 13:00 WIB** — asked of Rakha in #104, 2026-09-22. Fills the twelve-hour gap running into expiry, which is the interval a reader asks about.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 06:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 12:00 / Sat 19:00 WIB** — asked of Rakha in #104, 2026-09-22. A WEEKEND SLOT, against the weekends-are-not-working-days assumption. B's expiry produced only one bundle because the secondary machine slept; this is the last chance at two. Assessment needs a ledger above the PERSISTENT entry's 4,880,099, not the instance's 4,880,097.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 12:20 UTC. Stated up front so a "no" needs no second round trip.

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

## Non-live RPC compatibility

A returned entry with absolute `liveUntilLedgerSeq: 0` can be non-live even though
its XDR is still present. The version1 collector may retain this as `unverified` /
`INVALID_SUBJECT_TTL`; do not edit that sealed verdict or equate it with remaining
TTL zero. Use the [separate offline expiry assessment](W3-D18-03a-EXPIRY-REASSESSMENT.md)
to verify the original record and its live baseline under the documented response
semantics. Keep its report outside the bundle. The command does not change the
frozen runtime or perform a new chain operation.

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
