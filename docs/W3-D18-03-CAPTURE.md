# W3-D18-03 — read-only B/C capture

This supplements [the crossing runbook](SEP-20-PREFLIGHT.md). It prepares evidence
collection; it does not complete the crossing, expiry or unattended-operation gate.

> 📌 **Updated 2026-09-23. B's window is finished; this page is now for C —
> threshold Friday 2026-09-25, EXPIRY Saturday 2026-09-26.** The generated table
> below shows C's slots.
>
> It used to open with *"Readiness is Friday 2026-09-18. The runbook corrections are
> also in pending PR #147; use the calendar dates below while that PR is reviewed."*
> **#147 merged on 2026-09-14**, so for nine days this page routed the operator
> around a review that had already closed, and dated its readiness to a gate that
> had already passed.
>
> 🔴 **For the expiry capture, read
> [SEP-20-PREFLIGHT § Then C](SEP-20-PREFLIGHT.md#then-c-sep-2526) first.** It
> carries the two things this page does not: the capture takes `--baseline <Friday's
> capture directory>`, and acceptance is `phase: expiry-observed` from
> `pnpm verify:expiry` — **not** an exit code from `pnpm verify:crossing`, which
> exits 2 on a good expiry observation.

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
| **Fri 2026-09-25 12:00** | Fri 19:00 | 17,280 | the alert threshold | **Rakha** | Fatih, 12:20 UTC |
| **Sat 2026-09-26 00:00** | Sat 07:00 | 8,640 | first decay reading | **Rakha** | Fatih, 00:20 UTC |
| **Sat 2026-09-26 06:00** | Sat 13:00 | 4,320 | second decay reading | **Rakha** | Fatih, 06:20 UTC |
| **Sat 2026-09-26 12:00** | Sat 19:00 | 0 | EXPIRY — Saturday, happens once, nothing comes after it | **Rakha** | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### On the day — per slot

**Both operators own all 4 slots.** On each one, exactly one **runs** it and the other **confirms** at :20 past. **Rakha runs every one**, with Fatih confirming each time. Being the confirmer is not standby — it is a scheduled look at a clock.

*Fatih, 2026-09-25 — both owners on all four; Rakha runs every slot because he has an agent standing by, while Fatih is heads-down on the UI. Fatih is a real backup and intends to run them too; this sets who acts FIRST, not who is responsible.*

Below is only what is specific to each window rather than to the procedure.

- **Fri 2026-09-25 12:00 / Fri 19:00 WIB** — runs: **Rakha**, confirms: Fatih at 12:20 UTC · owners: Fatih + Rakha
  🔴 **THIS DIRECTORY MUST SURVIVE UNTIL AFTER SLOT 4.** Saturday's expiry capture passes `--baseline` pointing at it, so deleting or moving it breaks the one capture that cannot be retaken.
- **Sat 2026-09-26 00:00 / Sat 07:00 WIB** — runs: **Rakha**, confirms: Fatih at 00:20 UTC · owners: Fatih + Rakha
  07:00 WIB. B's equivalent slot was accepted as a standalone morning slot.
- **Sat 2026-09-26 06:00 / Sat 13:00 WIB** — runs: **Rakha**, confirms: Fatih at 06:20 UTC · owners: Fatih + Rakha
  Fills the twelve-hour gap running into expiry, which is the interval a reader asks about.
- **Sat 2026-09-26 12:00 / Sat 19:00 WIB** — runs: **Rakha**, confirms: Fatih at 12:20 UTC · owners: Fatih + Rakha
  A WEEKEND SLOT, against the weekends-are-not-working-days assumption. B's expiry produced only one bundle because the secondary machine slept; this is the last chance at two. Assessment needs a ledger above the PERSISTENT entry's 4,880,099, not the instance's 4,880,097. Takes `--baseline` from the 2026-09-25T12:00Z directory.

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

**For C, the commands are written out in
[SEP-20-PREFLIGHT § Then C](SEP-20-PREFLIGHT.md#then-c-sep-2526)** rather than
retyped here, so there is one copy to keep right. Two things from there that this
page must not let you miss:

- 🔴 **Friday's 12:00Z capture was NOT taken, so
  `.evergreen/crossing/C-20260925-1200` does not exist.** An earlier version of this
  bullet told you that directory must survive until Saturday evening; it was never
  created. **The baseline is the Saturday 00:01Z checkpoint instead** —
  `.evergreen/crossing/C-20260926-0001` locally, or
  [`docs/evidence/2026-09-26-c-crossing-0001/capture`](evidence/2026-09-26-c-crossing-0001/capture)
  on `main` if the local worktree is not to hand. It is a verified same-subject
  capture with phase `crossing-refused`, which `verify:expiry` accepts.
  **Do not clear `.evergreen/crossing/`** — that is where the baseline lives.
- An expiry assessment needs a ledger above C's **persistent** entry at
  **4,880,099**, not the instance's 4,880,097.
- **`mkdir -p .evergreen/crossing` before you run the collector.** Measured
  2026-09-26: a fresh worktree without that parent made the collector exit without
  producing a bundle, and the 00:00Z checkpoint landed a minute late. The expiry has
  no minute to spare.

A baseline can be `before-action` or
`crossing-refused`, for the same subject, and must not itself contain a baseline.
**Which verifier you run decides whether runtime fingerprints must match, and the
two differ.** Measured 2026-09-26 by reading both call sites:

- `pnpm verify:crossing` — the CLI **defaults `checkRuntime: true`**, so a capture
  taken against a different `packages/core` build fails it.
- `pnpm verify:expiry` — `reassess-expiry-capture.mjs:53` passes
  **`checkRuntime: false`** deliberately, so **a baseline from an older build is
  still valid for the expiry assessment.** `check:crossing` passes `false` too.

So keeping the reviewed checkout stable across the window is still the right
practice, and if code must change, retain the original checkout and captures rather
than editing their manifests — but **do not reject an otherwise-valid baseline
because core was rebuilt.** The expiry path does not look at the fingerprint. The
00:01Z baseline verifies under both settings, so this does not arise today.

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
