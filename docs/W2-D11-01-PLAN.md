# W2-D11-01 — Manual extension implementation plan

> For agentic workers: use `superpowers:executing-plans` sequentially in this session, with the review checkpoints below. No sub-agent fan-out. The checkboxes are implementation steps within W2-D11-01, not new backlog IDs.

**Goal:** provide a manual Testnet TTL extension command whose transaction path can be reused by the W3 engine.

**Architecture:** core selects and prepares explicit entry operations, validates/signs envelopes, and reconciles exact transaction hashes. CLI owns arguments, environment resolution and human/JSON presentation. Keep the existing shared `Signer` and `BumpRecord` contracts.

**Tech stack:** TypeScript 5.9.3, Node 24, pnpm 11.25.0, Stellar SDK 17.0.1, Vitest; no new dependency planned.

**Spec:** BACKLOG.md § Day 11; docs/PRD.md § 6; docs/ARCHITECTURE.md shared interfaces; ADR-004/005/006; the command contract and acceptance checks below.

2026-09-10. Owner: Rakha. Execution approved; implementation on `feat/W2-D11-01-manual-extend`. No live signing/submission has been performed.

Execution correction: the largest operation target is `maxEntryTtl - 1`, not the setting itself. The shared helper is corrected at its single source; see the primer for the Stellar core validation rule. Existing checkboxes remain the original execution checklist; the delivery record in STATUS distinguishes implemented behavior, validation and pending live evidence.
Base: `origin/main` at `ebe8e15` (#81), integrated into the existing planning branch `docs/W2-D11-01-plan-and-sync`. #80 supplies the cost helpers. Implementation branch, once execution starts: `feat/W2-D11-01-manual-extend`, retaining the reviewed planning changes.

## Execution status — 2026-09-10

The user approved implementation and [the start notice is published in #69](https://github.com/Fatihmaull/evergreen/issues/69#issuecomment-5615613217). [Fatih accepted the ownership boundary](https://github.com/Fatihmaull/evergreen/issues/69#issuecomment-5615849537). Steps 1–4 are implemented; the unsigned A simulation, full 411-test check and coverage gate pass. The implementation branch incorporates #82/#83. Step 5 is at Rakha result review; no PR or live transaction has been performed. The checklist below is the original execution recipe, not a claim that its publication/live steps have occurred.

## Planning snapshot — coordination and scope

#81 is merged. D11 remains critical path; D12 is reduced to basic flags and is outside this implementation. The dashboard write path and its wallet spike were cut; neither is a dependency of manual CLI extension.

Fatih's [latest #69 comment](https://github.com/Fatihmaull/evergreen/issues/69#issuecomment-5615382737) asks whether D11-01 implementation will be on a branch by Monday morning, Sep 14. A planning branch is not that deliverable. The user requested this plan, not a calendar commitment. Reply before implementation to avoid a competing takeover; the draft below has not been sent. Owner remains Rakha. D11-04 remains Fatih's, with the proposed boundary below requiring coordination before shared CLI edits.

Draft coordination message, to send once Rakha confirms execution: “@Fatihmaull — I am taking W2-D11-01. The plan is on docs/W2-D11-01-plan-and-sync; implementation will use feat/W2-D11-01-manual-extend and be pushed at start. I will reuse resolveExtendTarget with a network ceiling before simulation. Proposed boundary: D11-01 provides default simulation and explicit submit; D11-04 remains yours for the explicit --dry-run interface/help and independent no-sign/no-send acceptance checks. Please coordinate through this issue before editing the same CLI dispatch. This is a plan/ownership update, not a claim that implementation is already available.” Answer the Monday availability question explicitly with Rakha's actual commitment; do not infer it from the existence of this document.

## Outcome and ownership

Build one manual Testnet extension path that Stage 1 can reuse through the existing `Signer` interface. A default invocation prepares and simulates; live submission needs an explicit `--submit`.

The next implementation task is **W2-D11-01**. W2-D11-02 (live evidence) and W2-D11-03 (before/after proof) remain Pending and are separate execution checkpoints. This plan does not authorize a transaction. W2-D12-01/02 remain after D11.

Fatih owns the rent model (W2-D9-01/02/03); its CLI wiring also merged in #80 during planning. Reuse `scan --cost --ledgers N`, `resolveExtendTarget` and `readStateArchivalSettings`; do not rebuild that work. W2-D11-04 remains Fatih's dry-run task: D11-01 must already default to no submission, while the named dry-run interface and its acceptance work need a shared boundary before editing overlapping CLI files. A safety default cannot wait for a later task; this does not silently reassign his task.

## Proposed command contract

Use `evergreen extend <contract-id> --ledgers N`, matching #80's shipped cost command: N means additional ledgers. Resolve each selected entry separately with `resolveExtendTarget({ currentRemainingLedgers, additionalLedgers: N, maxEntryTtl })`, using `readStateArchivalSettings` from the verified Testnet endpoint. The core request and operation carry the resolved target remaining TTL. Never pass the delta through or apply one largest target to entries with different current TTLs.

The [official TTL extension guide](https://developers.stellar.org/docs/build/guides/archival/extend-persistent-entry-js) describes a target floor, with entries already above it unchanged and a network ceiling. Preserve #80's announced capping: show the requested increment, achievable increment and cap per entry, before live submission. Validate finite safe integer observations/inputs at the write boundary; a helper that can price expired input is not permission to extend it. Reject expired/missing/unreadable selections before target resolution. An all-satisfied selection reports a no-op without signing or sending.

Simulation and inclusion can happen at different ledgers. State the read-to-submit gap and verify actual post-state; do not promise exactly N additional remaining ledgers on a later read. This replaces the initial target-flag proposal made before #80 landed; no conflicting second public convention is introduced.

Proposed scope: instance by default; `--keys-file` adds explicit persistent/temporary data keys belonging to the requested contract. Code needs explicit `--include-code`. Print the full selected key set and kinds, unique known consumers, payer, target, mode, simulation fee and coverage before any send. A narrow selection is never reported as whole-contract protection. Data-key absence is not storage enumeration. A code key can have consumers outside the scanned inputs; show that limitation.

Use `--source-account G...` or the existing `EVERGREEN_SOURCE_ACCOUNT` for the public payer, required even for simulation; the write command must not inherit the cost command's fallback account. For live mode, `--secret-env NAME` identifies an already-exported environment variable, never the secret itself. Require `--max-fee-stroops N` with `--submit`: positive integer decimal text, an aggregate upper bound across the command's transactions. Simulations may omit it. Compare against the complete prepared envelope fees, retaining consumed/committed budget if a transaction is submitted. Reject a later envelope if it exceeds the remaining budget; never silently raise the cap. No `.env` auto-loading, secret argument, key generation, funding or platform provisioning in this task. Reuse existing payer/Signer types; full config-file resolution stays W2-D13-01. `--submit` with `--dry-run` is a conflicting request, not a precedence rule that can unexpectedly send.

Command examples (proposed interface, not yet executable):

```text
evergreen extend <contract-id> --ledgers 1000 --source-account <public-account>
evergreen extend <contract-id> --ledgers 1000 --source-account <public-account> --submit --secret-env EVERGREEN_SECRET_KEY --max-fee-stroops <reviewed-cap>
```

Return 0 for a complete simulation, justified no-op, or fully confirmed and post-verified live result; 2 for invalid input, rejected/failed operations, partial completion, or submitted-but-unconfirmed results. These are extend-command exits; scan's 2 > 3 > 1 > 0 semantics remain untouched. JSON always distinguishes mode and per-entry outcome, with hashes for any attempted sends. A zero simulation exit means simulation succeeded, never that protection changed.

## Implementation slices

1. **Core preparation:** validate target and explicit key scope; reject missing/unreadable or expired selected entries; deduplicate keys; distinguish already-satisfied keys. Build one allowed `ExtendFootprintTTLOp` per unique eligible key with its own target, read-only footprint and empty read-write footprint. This matches the per-entry quote model and avoids extending unlike entries to the largest target; later grouping of equal targets is unnecessary for this slice. No automatic restore, invocation or deployment.
2. **Simulation and payment:** simulate each actual selected footprint and target; sequence multiple live transactions for the same payer and preserve partial results. Present inclusion/resource fee separately from the rent estimate; a sum of per-entry rent quotes is not the prepared transaction's fee. Reuse applicable SDK patterns from `rent-quoter.ts`, without treating its estimate as a signed envelope or fee guarantee. Fail on malformed/error responses and reject fees above the explicit cap.
3. **Signer and submission:** local Ed25519 adapter behind `Signer`, validating network, payer, operation, footprint and allowed fees. Default execution never resolves a secret or calls signing/submission. Only the explicit live path signs the prepared envelope.
4. **Confirmation and CLI:** poll the exact hash within bounded time; distinguish rejected, submitted/unconfirmed, and confirmed outcomes. Timeout or NOT_FOUND is not permission to send a replacement. After confirmation, re-read the selected keys and require evidence of the expected increase for keys that needed it. Transaction SUCCESS alone is not evidence of increased TTL. Reuse `BumpRecord` outcomes where they fit; no broad shared-types redesign.

Keep transaction mechanics in core and parsing/presentation in CLI. Integrate with the merged #80 cost command; preserve `scan` behavior and accepted ADR-006. This plan defines no new scan exit codes. The extend command must distinguish no-op, simulation, submitted and verified outcomes in its report and return nonzero on error/unconfirmed verification; finalize that command's numeric contract with its help/tests.

## Acceptance checks

- Offline tests exercise both sides of the default/live gate and prove dry-run never signs or sends.
- Reject invalid ID/key/target, wrong network/payer, forbidden operation, nonempty read-write footprint, unexpected fees and conflicting flags. Secret-bearing errors are sanitized.
- Shared keys occur once. Explicit data keys cannot belong to another contract. No implicit shared-code selection.
- Already-satisfied TTL produces no send; zero remaining remains live; expired, absent and unreadable states are distinct and cannot trigger an automatic restore.
- RPC errors, malformed simulations, insufficient balance, rejection and unconfirmed hashes never become success or an automatic duplicate submission.
- Post-read verifies the selected entries' TTL change; use recorded fixtures plus controlled Testnet evidence for the strongest check the slice permits. Run full `pnpm check` on the implementation tree.
- Update help, core/CLI docs and task tracking, then present the local result for Rakha review before the implementation PR.

## File map and ordered execution

Use the existing plan file as the single plan; do not create a second plan in a generic skill directory. Each step below is an independently reviewable slice of the same task.

| File | Responsibility |
|---|---|
| New `packages/core/src/extend.ts` and `packages/core/test/extend.test.ts` | Pure selection/target plan, per-entry outcomes and orchestration through injected transport/signer |
| New `packages/core/src/extend-rpc.ts` and `packages/core/test/extend-rpc.test.ts` | Actual envelope construction, simulation, assembly, fee checks, send and exact-hash confirmation |
| New `packages/core/src/ed25519-signer.ts` and `packages/core/test/ed25519-signer.test.ts` | Local signer adapter and its transaction allowlist |
| New `packages/cli/src/extend.ts` and `packages/cli/test/extend.test.ts` | Extend parser, dependency-injected execution, human/JSON output |
| Existing `packages/core/src/index.ts`, `packages/cli/src/command.ts`, `packages/cli/src/bin.ts` | Exports, minimal command dispatch, environment and dependency wiring |
| Existing `packages/cli/README.md`, `docs/ARCHITECTURE.md`, `BACKLOG.md`, `docs/STATUS.md` | User instructions, actual module boundaries and truthful task state |

### 1. Coordinate, select and calculate

- [ ] Re-read #69 and open PRs; confirm D11 ownership and D11-04 boundary before touching overlapping files. Revalidate relevant Notion rows, carry #81 into the implementation branch, mark implementation In progress, and push the WIP branch immediately. A branch that contains only this plan must still say planning only.
- [ ] In `extend.test.ts`, write a failing test for the proposed `planExtension(scan, { contractId, additionalLedgers, maxEntryTtl, includeCode })`. Use the existing recorded A fixture/mock to produce `ScanResult`; the supplied scan request carries the explicit data keys. Produce a selection with canonical key, kind, consumers, before observation, resolved target and capped/no-op reason. Keep this type core-local; no shared-types change.
- [ ] Pin target arithmetic before implementation, including distinct current TTLs, capping, unsafe integers and inclusive zero. For the selected instance the key assertion is:

```ts
expect(resolveExtendTarget({
  currentRemainingLedgers: 100,
  additionalLedgers: 20,
  maxEntryTtl: 1000,
}).extendToLedgers).toBe(120);
expect(resolveExtendTarget({
  currentRemainingLedgers: 990,
  additionalLedgers: 20,
  maxEntryTtl: 1000,
}).extendToLedgers).toBe(999);
```

- [ ] Add selection failures for foreign data keys, absent/expired/unreadable selected entries and malformed config. A failure on an unselected code entry must not prohibit an otherwise valid instance-only extension; selection validity and whole-contract coverage are separate. Shared code is excluded unless explicitly selected and its warning remains visible.
- [ ] Run `pnpm exec vitest run packages/core/test/extend.test.ts`, observe the missing-planner failure, implement pure selection in `extend.ts`, and rerun green. Commit with subject `feat(core): plan explicit TTL extensions [W2-D11-01]`.

### 2. Prepare a real unsigned envelope

- [ ] In `extend-rpc.test.ts`, record a failing adapter test using an injected fake transport: one selected key, one extend operation, exact resolved target, no writable keys. Follow the installed SDK 17.0.1 declarations for simulation/assembly and compare the decoded resulting envelope, not a parallel object created by the test. Verify the exact SDK assembly API against installed code and official documentation before implementing it.
- [ ] Implement `prepareExtension` in `extend-rpc.ts`: consume one planned entry and a public payer; obtain current account sequence, construct the transaction following `rent-quoter.ts`'s footprint pattern, simulate, assemble and validate the complete unsigned envelope. Return its XDR, locally calculated hash, full fee in stroops, and captured before/simulation observations. Do not reuse a quote total as the envelope fee. Reject absent/malformed fees, simulation errors, unexpected footprint/operation changes, or expired time bounds.
- [ ] Add ceiling-before-simulation and low-balance/error cases. A server response with no usable resource estimate must fail, never become zero fee. Tests must decode the built transaction to check what would actually be signed.
- [ ] Run `pnpm exec vitest run packages/core/test/extend-rpc.test.ts`, first red then green; commit `feat(core): prepare simulated extension envelopes [W2-D11-01]`.

### 3. Sign and reconcile without duplicate submission

- [ ] Write `ed25519-signer.test.ts` using throwaway test-generated keys that never leave the test process. Accept the intended one-key extend; reject payment, restore, invocation, fee-bump envelopes, additional operations, another payer/source, nonempty writable footprint, changed target/key, wrong passphrase, already-signed envelopes and fees above policy. Compare the envelope against the expected prepared selection before signing. The adapter is software validation, not the W3 policy-signer security boundary.
- [ ] Implement the existing `Signer` interface: `signExtendTTL({ networkPassphrase, transactionXdr }): Promise<string>`. Secret retrieval is an injected callback invoked only in the live path. Public identity must match the actual key; never return raw provider/SDK errors that can include input material.
- [ ] Add injected orchestration tests in `extend.test.ts`: default mode never invokes the secret callback, signer or sender; explicit live mode does. Capture a local hash before sending so transport failure can report the possibly-submitted attempt even without a server response. Verify returned send hash against the local hash. `NOT_FOUND`, timeout and transport uncertainty do not cause a second send. Stop later transactions after an uncertain outcome; preserve previous records and do not reuse their fee budget.
- [ ] Require confirmed success plus a fresh post-read for `BumpRecord.outcome = 'succeeded'`. Compare absolute `endsAtLedger` before/after, not just remaining TTL (which decreases as time passes). Check the resolved target against the inclusion ledger and the documented inclusive boundary; an increased value below that bound is an unverified/shortfall result, not success. If an independent extension raced ours, report the observed improvement without claiming exclusive causation.
- [ ] Test different inclusion/read ledgers and `SUCCESS` with unchanged TTL. For an unconfirmed attempt retain `outcome: 'submitted'` and its hash; do not invent a successful `after`. All selected transactions use fresh sequences and independent preparation, sequentially; never prepare a batch using one sequence.
- [ ] Run `pnpm exec vitest run packages/core/test/extend.test.ts packages/core/test/extend-rpc.test.ts packages/core/test/ed25519-signer.test.ts`; commit `feat(core): sign and verify manual extensions [W2-D11-01]` only when green.

### 4. Connect the CLI

- [ ] Start `packages/cli/test/extend.test.ts` with default/live argument tests, positive safe integer increments, public payer validation, duplicate/unknown/conflicting options and decimal fee caps. Inject a stub runner returning per-entry records; assert both exit category and emitted mode/outcome. Invalid arguments must not connect or load secrets.
- [ ] Implement `runExtendCli(args, dependencies): Promise<CliOutput>` in `packages/cli/src/extend.ts`, reusing the existing `CliOutput` shape. Dispatch `extend` from `runCli` without changing the existing scan parser or tests. Keep dependencies distinct so importing help/scan never resolves the signer. Wire exported core adapters in `bin.ts`; preserve the current RPC URL convention and Testnet network check. Validate the endpoint's network before account/simulation operations.
- [ ] Render selected entries, payer, requested/resolved/capped lifetimes, fee budget and mode before submission. Use stderr for progress/preview when JSON is requested so stdout remains one valid final JSON document. State scope limitations and partial outcomes explicitly. Do not print secret environment values or raw error stacks.
- [ ] Coordinate Fatih's `--dry-run` wrapper/tests over this same default simulation path. Until that flag lands, unknown flags already fail safely; never accept `--submit --dry-run` as a live request. Do not mark D11-04 Done based on D11-01's tests.
- [ ] Run `pnpm exec vitest run packages/cli/test/extend.test.ts packages/cli/test/command.test.ts packages/cli/test/scan.test.ts packages/cli/test/cost.test.ts`; commit `feat(cli): expose manual Testnet extension [W2-D11-01]` after green.

### 5. Review checkpoint and publication boundary

- [ ] Update CLI help/README with simulation and explicit submission examples, account/environment setup, aggregate fee budget, code-sharing warning and submitted-but-unconfirmed recovery instructions. Update only the architecture sections describing this new path; preserve historical decision records.
- [ ] Run full `pnpm check`, then a separate explicit Testnet **simulation-only** check of A's instance using a public payer. Store the dated raw read/simulation outputs and exact command in a new D11 evidence folder; no secret or transaction submission. Independently inspect the prepared XDR scope/target/fees. If Testnet simulation cannot be verified, report that limitation and retain In progress.
- [ ] Present Rakha with the diff summary, test results, simulation scope/fee, known limitations and any unresolved D11-04 boundary. Implementation is not Done just because code exists. Review must precede a ready PR and a real transaction.
- [ ] After publication authorization, push the reviewed implementation and open the PR with W2-D11-01 in its title; request Fatih's review and link #69. Do not merge automatically. If a code blocker requires Fatih, document it in an Issue before requesting routine PR review.
- [ ] Keep the row In progress until its full definition of done, including applicable Testnet behavior, is met. D11-02/03 are the following separately reviewed evidence checkpoint; never imply a simulation fulfilled them. At the session boundary update repo and Notion, compare all registered IDs both ways, and distinguish branch work from content verified on `origin/main`.

## Controlled proof after implementation review

For W2-D11-02/03, use A's **instance only** first. Choose an additional-ledger increment whose per-entry resolved target exceeds A's freshly observed remaining TTL and fits current limits, then review the exact resolved target and fee. A's December headroom means passing a small delta directly as the target may do nothing; an inexpensive quote alone neither proves a bug nor proves a useful extension.

Do not extend B, C, or the shared A/B/C Wasm while the decay proofs are pending. Read A before/after; record tx hash, full unedited RPC results and an explorer screenshot immediately, plus actual terminal before/after views. No fabricated screenshot from saved stdout. Capture the exact fees/target/keys and distinguish transaction confirmation from post-read verification. Live execution requires a concrete reviewed request; none occurs during this planning task.

## Synchronization and constraints

#60/#63 merged; ADR-006 accepted as amended in #66. D8-03 and D10-02 tracking was stale and is reconciled in this planning branch. D10-04 remains In progress because engine integration is absent. D9 ownership remains Fatih. W1 is closed; the recurring drift obligation remains active.

Notion sync recovered 2026-09-10: task outcomes were written and read back, including D11-01 as planning only. All 145 registered IDs are present; one additional Dropped predecessor is intentionally retained. Repo tracking corrections remain branch work, not merged main. Task Tracker stays a weekly snapshot.

Validation: full `pnpm check` passed 280 Vitest + 36 Node tests on this #81-integrated planning tree. This verifies the inherited implementation and repository gates, not the unbuilt D11 path. Final edits only record validation; planning changes are Markdown only. Refreshed all-ID mirror check found 145 registered IDs and 146 rows, with no missing IDs or duplicates and only the intentionally retired predecessor extra. D11 status/ownership remains planning In progress/Rakha, with D11-02/03 Pending/Rakha and D11-04 Pending/Fatih.
