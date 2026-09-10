# W2-D11-01 — Manual extension, plan for review

2026-09-10. Owner: Rakha. Planning only; no implementation, signing or submission.
Base: `origin/main` at `71692c8` (#79). Planning branch: `docs/W2-D11-01-plan-and-sync`.

## Outcome and ownership

Build one manual Testnet extension path that Stage 1 can reuse through the existing `Signer` interface. A default invocation prepares and simulates; live submission needs an explicit `--submit`.

The next implementation task is **W2-D11-01**. W2-D11-02 (live evidence) and W2-D11-03 (before/after proof) remain Pending and are separate execution checkpoints. This plan does not authorize a transaction. W2-D12-01/02 remain after D11.

Fatih owns the merged rent model (W2-D9-01/02/03) and the active `feat/W2-D9-cost-cli` branch. Do not duplicate or absorb that wiring. W2-D11-04 remains Fatih's dry-run task: D11-01 must already default to no submission, while the named dry-run interface and its acceptance work need a shared boundary before editing overlapping CLI files. A safety default cannot wait for a later task; this does not silently reassign his task.

## Proposed command contract

Use `evergreen extend <contract-id> --extend-to-ledgers N` instead of the unshipped, ambiguous `--ledgers N`. `N` is a target remaining lifetime at execution, not an increment and not an absolute ledger sequence. Existing entries above the target are left alone. An all-satisfied selection reports a no-op without signing or sending. Actual inclusion may happen at a later ledger than simulation, so the post-read records the observed result rather than asserting an exact wall-clock expiry.

This matches the [official TTL extension guide](https://developers.stellar.org/docs/build/guides/archival/extend-persistent-entry-js). The chain enforces a maximum TTL; validate integer/range constraints and use authoritative network limits/simulation, never silently clamp an invalid target or fit a local fee coefficient.

Proposed scope: instance by default; `--keys-file` adds explicit persistent/temporary data keys belonging to the requested contract. Code needs explicit `--include-code`. Print the full selected key set and kinds, unique known consumers, payer, target, mode, simulation fee and coverage before any send. A narrow selection is never reported as whole-contract protection. Data-key absence is not storage enumeration. A code key can have consumers outside the scanned inputs; show that limitation.

Use a public payer account for simulation. The live signer resolves a Testnet-only key from an ignored local environment source; no secret command-line argument, output, JSON or committed file. Final option names for payer selection and fee cap are implementation-review items; reuse the existing payer/Signer types. `--submit` with `--dry-run` is a conflicting request, not a precedence rule that can unexpectedly send.

## Implementation slices

1. **Core preparation:** validate target and explicit key scope; reject missing/unreadable or expired selected entries; deduplicate keys; distinguish already-satisfied keys. Build one allowed `ExtendFootprintTTLOp` with read-only footprint and empty read-write footprint. No automatic restore, invocation or deployment.
2. **Simulation and payment:** simulate the actual selected footprint. Present inclusion/resource fee separately from the rent estimate; a sum of per-entry rent quotes is not the prepared transaction's fee. Reuse applicable SDK patterns from `rent-quoter.ts`, without treating its estimate as a signed envelope or fee guarantee. Fail on malformed/error responses and reject fees above the explicit cap.
3. **Signer and submission:** local Ed25519 adapter behind `Signer`, validating network, payer, operation, footprint and allowed fees. Default execution never resolves a secret or calls signing/submission. Only the explicit live path signs the prepared envelope.
4. **Confirmation and CLI:** poll the exact hash within bounded time; distinguish rejected, submitted/unconfirmed, and confirmed outcomes. Timeout or NOT_FOUND is not permission to send a replacement. After confirmation, re-read the selected keys and require evidence of the expected increase for keys that needed it. Transaction SUCCESS alone is not evidence of increased TTL. Reuse `BumpRecord` outcomes where they fit; no broad shared-types redesign.

Keep transaction mechanics in core and parsing/presentation in CLI. Integrate alongside Fatih's cost command after checking his latest branch; preserve `scan` behavior and accepted ADR-006. This plan defines no new scan exit codes. The extend command must distinguish no-op, simulation, submitted and verified outcomes in its report and return nonzero on error/unconfirmed verification; finalize that command's numeric contract with its help/tests.

## Acceptance checks

- Offline tests exercise both sides of the default/live gate and prove dry-run never signs or sends.
- Reject invalid ID/key/target, wrong network/payer, forbidden operation, nonempty read-write footprint, unexpected fees and conflicting flags. Secret-bearing errors are sanitized.
- Shared keys occur once. Explicit data keys cannot belong to another contract. No implicit shared-code selection.
- Already-satisfied TTL produces no send; zero remaining remains live; expired, absent and unreadable states are distinct and cannot trigger an automatic restore.
- RPC errors, malformed simulations, insufficient balance, rejection and unconfirmed hashes never become success or an automatic duplicate submission.
- Post-read verifies the selected entries' TTL change; use recorded fixtures plus controlled Testnet evidence for the strongest check the slice permits. Run full `pnpm check` on the implementation tree.
- Update help, core/CLI docs and task tracking, then present the local result for Rakha review before the implementation PR.

## Controlled proof after implementation review

For W2-D11-02/03, use A's **instance only** first. Select an explicit target above its freshly observed remaining TTL and within current limits. A's December headroom means small target values may do nothing; an inexpensive quote alone neither proves a bug nor proves a useful extension.

Do not extend B, C, or the shared A/B/C Wasm while the decay proofs are pending. Read A before/after; record tx hash, full unedited RPC results and an explorer screenshot immediately, plus actual terminal before/after views. No fabricated screenshot from saved stdout. Capture the exact fees/target/keys and distinguish transaction confirmation from post-read verification. Live execution requires a concrete reviewed request; none occurs during this planning task.

## Synchronization and constraints

#60/#63 merged; ADR-006 accepted as amended in #66. D8-03 and D10-02 tracking was stale and is reconciled in this planning branch. D10-04 remains In progress because engine integration is absent. D9 ownership remains Fatih. W1 is closed; the recurring drift obligation remains active.

Notion tools are unavailable in this turn. Repo edits are canonical branch work, not merged main; mirror sync and the all-row presence check remain pending for the next connected session. Task Tracker stays a weekly snapshot.
