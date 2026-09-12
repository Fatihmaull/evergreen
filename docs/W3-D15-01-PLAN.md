# W3-D15-01 — Engine core implementation plan

**Status:** Rakha approved implementation on 2026-09-12, but the required startup refresh found D15-01 already merged and reassigned to Fatih in #115. This greenfield plan is superseded as an execution instruction; no duplicate implementation started. See [startup reconciliation](evidence/2026-09-12-engine-startup-review/README.md) for four reproduced gaps and the proposed correction scope. The design below is retained as the reviewed expectation, not rewritten history.

**Goal:** run the private engine once from config, read registered Testnet entries,
produce one bump/skip decision per ledger key, and exit nonzero whenever the run
cannot establish liveness.

**Architecture:** pure decision evaluation in core; config/RPC orchestration in
engine; a thin Node command. Reuse current core predicates, scanning, target
calculation, protection and liveness. No scanner, signer or rent-model rewrite.

**Tech stack:** existing TypeScript, Node 24, pnpm 11.25.0 and Vitest; no new library.

**Design basis:** this document's behavior contract, BACKLOG W3-D15-01,
W2-D10-04 carry-over, docs/ARCHITECTURE.md, and Issue #104. This revision narrows
and supersedes the earlier combined W3 planning draft at this path.

**Execution:** sequential, using the already-read planning workflow and
`superpowers:executing-plans` after approval. Plan → implementation → internal
review with Rakha → publication → Fatih review/merge. No sub-agent required.

## 1. Scope and explicit exclusions

D15-01 delivers a runnable **decision preview**, not a transaction simulation.
It consumes the existing EvergreenConfig, including existing action/target
overrides. It does not add config fields or change shared-types.

Included:

- Config loading/validation and Testnet network verification.
- One combined scan over all registered contracts and their declared data keys.
- Per-key decisions with payer, target, consumers and reasons.
- Write-guard enforcement before accepting any extension candidate.
- Required decisions input to assertLiveness, consistent effective thresholds,
  complete diagnostics and a real command exit status.
- Offline tests, compiled-command verification and one read-only A validation.

Separate tasks retain their scope:

| Task | Work kept outside this implementation |
| --- | --- |
| W3-D15-02 | Full two-tier config interface, warning-threshold overrides and broader threshold-policy matrix. |
| W3-D15-02b | Decide permanent temporary-entry policy and opt-in, and amend ADR-001. |
| W3-D15-03 | Fatih's independent decision test suite. This task supplies the stable API and essential regression/wiring tests. |
| W3-D15-01b | Fatih's operational onboarding of A; this task does not change watched production config. |
| W3-D16-01/02/02b | Simulation, signing, sending, fee caps, confirmation and execution idempotency. |
| W3-D16-03, W3-D17 tasks, W3-D18-00/01 | Durable run records, notification delivery and scheduler deployment. |

No live proof, funding, restore, protected override, scheduler activation or npm
publication is part of D15-01. Existing A proof authorization has been consumed.

## 2. Behavior contract proposed for approval

### Config and reads

1. Reuse loadConfig. Reject empty contract registration and repeated contract IDs
   at the engine boundary with a precise config diagnostic; users can consolidate
   keys into one registration. Reject malformed IDs using isValidContractId.
2. Preserve each contract's dataKeys/noDataKeys into ContractScanRequest. Invoke
   scanContracts once for the combined scope. Its internal RPC batches remain its
   responsibility: one scan invocation does not mean one network request.
3. Use connectTestnet to validate the actual RPC network. No environment secret
   lookup is needed to validate payer references or preview a decision.
4. After a scan with observed entries, read STATE_ARCHIVAL_CONFIG_KEY once via
   the same LedgerEntryReader, require entryXdr, and reuse
   parseStateArchivalSettings for maxEntryTtl. No direct SDK dependency is needed
   in engine. Preserve the settings observation ledger in output. A failed
   settings read is an operational diagnostic; no uncapped target is produced.
5. Coverage-limited/sharing-undetermined remain visible scope caveats. Missing,
   invalid, unsupported or unreadable observations remain failures, not evidence
   that an entry is expired or that the whole contract is healthy.

### Decisions

- Iterate ScanResult.entries once. Emit exactly one BumpDecision per observed
  key. Missing keys remain represented by scan issues, not invented observations.
- Resolve action/target values by merging existing config defaults with existing
  per-contract overrides. No config migration in this task.
- The existing bumpWhenRemainingLedgersBelow field is the **action threshold**.
  Call needsAction; equality triggers action. Zero remaining is still live;
  call hasExpired to distinguish expired entries.
- Warning metadata uses HealthThresholds with the existing warn default and the
  effective action value as critical. If an action override exceeds the default
  warning margin, widen the derived warning margin to that action value and
  report the derivation. Configurable warning overrides belong to D15-02.
- A shared key's effective action threshold is the maximum across its consumers,
  so an eligible consumer is not silently ignored. Preserve all consumers.
- Require all consumers to resolve to the same payer and the same target before
  producing an extend candidate. Differing/missing policies produce an explicit
  conflict diagnostic and skip; never choose the first payer or largest target.
- Config extendToLedgers remains a target. For a known live entry, calculate the
  positive difference between that target and current remainder; pass that delta
  and the network ceiling to resolveExtendTarget. Validate the capped result both
  increases TTL and clears the effective action threshold. A due entry with an
  unusable target is a policy error. Healthy entries simply skip.
- An expired or unavailable entry never becomes an extend candidate. An entry
  associated with a read failure also skips, even if another observation exists.
- Call assertWriteAllowed with the selected key and original scan before
  accepting a due candidate. Do not expose acknowledgeProtected in this command.
  B/C and shared Wasm remain protected even through A alone and after a calendar
  date. D16 must check again immediately before preparing a transaction.
- Temporary entries remain in scan, health and liveness. For this preview-only
  task they skip with reason temporary-policy-unresolved. This is a temporary
  implementation boundary, not acceptance of the permanent default-off/opt-in
  policy proposed under W3-D15-02b.

### Liveness and output

- Make assertLiveness.decisions required; existing tests/callers pass [] explicitly
  when they are testing the absence of decisions. Preserve all current firing
  and record-outcome rules.
- Add an optional actionThresholdByEntry map to the core assertion. Validate its
  values and fall back to the existing global threshold when a key is absent.
  The evaluator returns this map, so decisions and liveness share one resolution.
- For every completed scan/evaluation attempt, call assertLiveness with the real
  scan, decisions, effective thresholds and records. D15 records are always [].
  A due preview decision therefore still alarms as no-action-recorded under the
  current assertion; do not fabricate outcome: simulated to make it quieter.
- Configuration/network rejection before a scan returns an explicit failed-run
  variant with no invented scan or liveness result. Scan/evaluation exceptions
  retain any observations already obtained and sanitized diagnostics.
- Operational diagnostics also cover invalid-response and unsupported-executable;
  these cannot slip through as exit 0 merely because the current assertion's
  issue loop handles only rpc-error/entry-not-found.
- Current liveness code appears to recommend restore for expired temporary data.
  Before exposing that result, add a reproduction test. If confirmed, record it
  under the existing W2-D10-04 carry-over and make the narrow lifecycle-aware
  correction in core (investigate for deleted data, restore for archived data).
  Include the reproduction in the existing coordination issue at publication;
  do not duplicate the rule in the engine or silently suppress the finding.
- Proposed engine exit precedence: 2 (configuration, policy or operational error),
  then 1 (liveness alarm), then 0 (no alarm/error in observed scope). The existing
  CLI scan exit semantics remain unchanged. Severity never suppresses the alarm.
- mode omission means dry-run. Explicit --dry-run is accepted. A config requesting
  live or a --submit argument is refused as unsupported in D15, never silently
  treated as a successful live run. No signer/prepare/send capability is accepted
  by the D15 dependency interface.

Output uses a discriminated run result: mode: dry-run, phase: decision-preview,
exitCode, sanitized diagnostics and config warnings; a completed-scan variant
also contains scan, decisions, effective thresholds, health metadata, records: []
and liveness. Targets and observations remain ledger quantities. No rent quote is
invented: estimate fields stay absent. JSON is the first command output format.

## 3. Files and proposed API

These are proposed names, not claims that the exports already exist.

| File | Change |
| --- | --- |
| packages/core/src/decision.ts | New pure evaluateDecisions({ scan, config, maxEntryTtl? }) returning decisions, actionThresholdByEntry, health metadata and diagnostics. Guard/policy/target evaluation lives here. Missing ceiling permits safe skips but no executable target. |
| packages/core/src/index.ts | Export evaluator and its input/result types. |
| packages/core/src/liveness.ts | Required decisions, optional per-key thresholds; narrow lifecycle correction only after reproduction. |
| packages/engine/src/run.ts | New runOnce(configText, { connect }) orchestrates validated config, a LedgerEntryReader, scan/settings reads, evaluator and liveness. Return explicit completed-scan or pre-scan-error variants. |
| packages/engine/src/command.ts | Parse --config and optional --dry-run, reject unknown/write flags, read config via injected dependency, call runOnce and render JSON. |
| packages/engine/src/bin.ts | Bind real file reader and core connectTestnet; set process.exitCode from command result. |
| packages/engine/src/index.ts | Replace marker with real exports; remove obsolete database prerequisite wording. |
| package.json | Add engine script: pnpm build && node packages/engine/dist/bin.js. Keep package private and dependency versions unchanged. |
| packages/core/test/decision.test.ts; liveness.test.ts | Essential evaluator boundaries and liveness regression tests. |
| packages/engine/test/run.test.ts; command.test.ts; artifact.integration.test.ts | Fixture orchestration, command/exit checks and explicit built-artifact check. |
| docs/ENGINE.md; ARCHITECTURE.md; STATUS.md; BACKLOG.md | Minimal runnable preview instructions, current module path and task outcome. |

Example intended usage after implementation:

```bash
pnpm engine --config /path/to/evergreen.config.json --dry-run
```

No separate public CLI command, watch daemon, engine SDK dependency, config schema
extension or database store is needed for this task.

## 4. Implementation sequence after plan approval

### Step 1 — claim the task and establish the seam

- [ ] Refresh origin/main and PR #113/#104; preserve the handoff and existing
  local planning edits. Start feat/W3-D15-01-engine-core from main, carrying only
  the W3 planning/doc changes, never the #113 implementation diff.
- [ ] Mark W3-D15-01 In progress in repo/Notion and push the WIP branch.
  W3-D15-02/02b/03 remain separately tracked.
- [ ] Define evaluator and run result types in their owning packages. No copied
  ScanResult/BumpDecision or dependency from core back into engine.

### Step 2 — decision tests, then the smallest evaluator

- [ ] Reuse packages/core/test/mock-rpc.ts and the recorded A fixture. Build
  explicitly labeled synthetic variants for boundary and shared-key cases;
  use a valid unprotected shared-code key for the permitted path.
- [ ] Add failing tests for the decision matrix below, then implement config
  merging, unique-key decisions, payer/target conflicts and guard calls.
- [ ] Add network-cap target tests using recorded settings. Confirm that treating
  config target as a delta fails the expected-target assertion.

Example hand-check for the target contract: current remainder 17,280; configured
remaining-TTL target 518,400; adapter delta 501,120. With maxEntryTtl 3,110,400,
resolveExtendTarget must return target 518,400, not 535,680. These are synthetic
policy inputs, not a new live measurement or hard-coded network ceiling.

### Step 3 — liveness integration

- [ ] Make decisions required and migrate callers explicitly. Add tests proving
  a per-contract override triggers both a decision and the final alarm at the
  same ledger boundary, including shared keys with different thresholds.
- [ ] Reproduce the expired-temporary remediation case; document and correct
  only the demonstrated reporting defect in the existing core assertion.
- [ ] Verify succeeded fixtures still quiet the assertion while simulated,
  submitted, failed and missing records do not. Do not create these records
  during an actual D15 preview.

### Step 4 — runnable engine

- [ ] Add runOnce using injected connection/reader, scanContracts, settings parser,
  evaluator and assertion. Keep operations sequential and preserve partial data.
- [ ] Add command/bin and root engine script. Omitted mode and --dry-run both
  preview; live requests and unsupported arguments reject explicitly.
- [ ] Test JSON variants, sanitization and exits by calling the command, not by
  reproducing its exit calculation in tests. Assert no seed lookup, prepare,
  signer, submit, notification or watched-config write takes place.

### Step 5 — verify, review, publish

- [ ] Run focused tests during the red/green cycle:

```bash
pnpm exec vitest run packages/core/test/decision.test.ts packages/core/test/liveness.test.ts packages/engine/test/run.test.ts packages/engine/test/command.test.ts
```

- [ ] Run the full required pnpm check without weakening coverage. Then verify
  the built command separately with fixture inputs. An integration fixture must
  be local/isolated and must not allow the default unit suite to reach the network.
- [ ] Run one explicit read-only A validation using a temporary dry-run config,
  with public contract data and environment-variable names only. Record the
  observed ledger/scope and hand-check its decision. Preserve B/C/shared protection.
  No new EVIDENCE transaction row is needed because no transaction is sent.
- [ ] Update docs/ENGINE.md with actual command/output/exit examples and the D15
  limitation. Update tracking, perform all-ID Notion presence validation and
  mirror the factual outcome. Task Done requires these checks, not just code.
- [ ] Present the diff, evidence, checks and remaining boundaries for Rakha's
  internal review. After the publication checkpoint, publish the PR and concrete
  Fatih handoff in #104, including the evaluator contract for W3-D15-03.
  Fatih handles merge; report published and merged separately.

## 5. Acceptance matrix

| Input / event | Required observable result |
| --- | --- |
| Healthy entry | One skip, no extension candidate; exit 0 if the rest of observed scope is healthy. |
| Warning only | Warning metadata, no premature bump. |
| Exactly action threshold | Candidate if other checks permit; preview has no successful record, so liveness alarms and exit is nonzero. |
| Remaining TTL zero / negative | Zero can be eligible; negative cannot be extended. |
| Unavailable TTL, missing key, RPC error or malformed executable | Explicit failure/unknown information and nonzero exit, never fabricated health. |
| Shared key, same payer/target | One decision with all consumers; no duplicate key read by the scan. |
| Different payer/target | Conflict and skip independent of registration order. |
| Existing per-contract override | Evaluator and liveness use the same effective threshold. |
| Protected B/C or shared Wasm reached through A | No candidate accepted; guard reason remains visible; no prepare/sign/send. |
| Temporary policy unresolved | Entry stays visible, no auto-bump candidate, low/unreadable TTL remains an alarm. |
| Capped or insufficient target | No candidate unless the result increases TTL and clears its action threshold. |
| Config invalid / live requested | Exit 2, no signer or network call required for detecting those config errors. |
| Actual preview | records is []; no simulated/succeeded claim. |
| Compiled command | Tested output and actual process exit agree with source behavior. |

## 6. Readiness, pace and review decision

Proceed as soon as this plan is reviewed; do not wait for the historical D15 date.
Finish D15-01 through internal review and publication as a small unit, then move
to D15-02 and D16. No new calendar date is treated as reserved capacity. The hard
Stage 1 gate remains September 18; email/runner/failure proofs must fit before it.

Starting state was checked earlier in this session: main ba72ea8; #113 open at
b77495f with green checks and no Fatih feedback; all D15 rows Pending. Refresh
these at implementation start instead of treating this paragraph as live state.

Review this task's concrete choices: preview-only result; existing config
semantics; explicit shared-policy conflicts; guard without override; liveness
always evaluated; existing overrides supported without a new config schema.
Review approval starts implementation, not transaction authorization or PR merge.
