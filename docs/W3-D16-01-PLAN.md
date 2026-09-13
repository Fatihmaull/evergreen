# W3-D16-01 — engine execution plan

**Status:** Rakha authorized local implementation and, after internal review, publication on 2026-09-13. Owner: Rakha.
No real signature, transaction or live activation is approved by this document.

**Publication boundary:** planning, implementation and internal review stay local
until Rakha explicitly requests publication. Do not send this draft, update Notion,
post GitHub comments or push it merely because dependencies/owners are shared.
Read-only dependency checks are allowed; local notes record the work.

**Goal:** connect the existing engine's decisions to the proven core execution
primitives, with simulation by default, explicit Signer-backed live execution,
bounded fees, honest outcomes and no replacement transaction after uncertainty.

**Initial scope:** instance and explicitly declared persistent data keys. Temporary
execution waits on D15-02b; code-entry execution is excluded from this first
execution slice. Keep the key-based design so subsequent reviewed coverage can
use it. No live claim about complete contract protection is made for this subset.

## 1. Baseline and dependencies

Local source includes #120's corrected payer/target/liveness rules and #121's
warning/action layer. At the read-only GitHub refresh, both PRs remained open at
dda2530 and cdecdb8, with no new Fatih response changing this plan. Refresh their
actual state again before implementation; these are snapshots.

A local implementation branch would be `feat/W3-D16-01-engine-execution`, based
on the newest verified dependency. If the parents remain open it can be stacked
locally; publication/retarget coordination waits for the publish checkpoint.
Keep the separate D15-02b draft and its unreleased notes outside a D16-only PR.

| Available core | Reuse |
| --- | --- |
| runEngine / decideBumps / EngineRun.health | Scan, unique-key decisions, effective thresholds and reporting |
| extensionKey / resolveExtendTarget / write guard | Canonical key validation, target limits and protected subjects |
| prepareExtension | Real public payer/sequence, Testnet verification, simulation and unsigned envelope validation |
| createEd25519Signer / validateExtensionEnvelope | Validate network/key/target/hash/fee/time bounds before deferred secret access |
| submitExtension | Check signed envelope identity and submit the exact prepared transaction |
| confirmExtension | Poll the same hash and bind SUCCESS/FAILED to the returned envelope |
| executeExtensions | Sequential execution, aggregate fee reservation, post-TTL verification and stop-on-uncertainty |
| assertLiveness / BumpRecord | Final run verdict and honest simulated/submitted/succeeded/failed outcomes |

Core issues that need adaptation, not a second implementation:

- planExtension always selects the instance. Calling it for a due persistent key
  would accidentally add another key that the engine did not select.
- ExtensionPlan contains single-contract/delta metadata, and executeExtensions
  labels records Explicit manual extension. Do not invent dummy plan metadata or
  preserve that label for an engine run.
- PayerConfig currently names a secret environment variable, but not a public
  source account or execution fee cap. Simulation must not read a secret to derive
  the public account.

## 2. Execution boundary and input contract

Preserve the current `engine:run` and cron as decide-only. Add a separate local
`engine:execute` entry point so the already running schedule cannot acquire write
behavior from a code update alone. No workflow, secret-store or funding change
is included in D16-01 implementation.

Proposed payer additions for the Ed25519 variant:

| Field | Requirement |
| --- | --- |
| sourceAccount | Public Testnet G-account; required for every selected payer in simulation and live modes |
| maxFeeStroops | Positive decimal-string aggregate cap for that payer in this run; mandatory for live, optional for simulation |
| secretEnvVar | Existing name only; lookup occurs solely in the validated live signer path |

Make the additions optional in shared types/parser so existing decide-only configs
remain usable. The new execution entry point validates them for eligible payers
before the first signing/submission. Reject duplicate aliases for the same public
source account in one execution run rather than give one account independent
budgets or race its sequence. Multi-alias accounting is not implemented here.

Proposed live opt-in contract for review:

- No flags / explicit --dry-run: simulate; never read a seed, sign or send.
- Config mode=live alone does not activate execution; reject and explain that an
  explicit --submit is required.
- --submit requires a reviewed execution config with mode=live, each active payer's
  fee cap, and the required submission-state recorder described below.
- --dry-run and --submit conflict and are rejected. Unknown flags also reject.
- No .env auto-loading, fallback payer, default fee subsidy, restore or funding.
- Stage 2 policy signer configuration is explicitly unsupported in this first
  adapter, not silently replaced with an Ed25519 signer.

No real payer, secret, balance or fee budget is selected by this plan. Those inputs
must be concrete at the later controlled Testnet proof checkpoint; the exhausted
W2 A proof permission is not reused.

## 3. Proposed one-run flow

1. Load/validate config and execution options; verify Testnet. Run the existing
   combined scan and decision pass once.
2. Build an execution selection from extend decisions only. Convert out-of-scope
   temporary/code decisions into explicit execution-scope skips and retain their
   original observations/health. Liveness must explain why they did not act.
3. Revalidate each selected key against its entry kind, declared consumer, resolved
   payer/target and scope. A persistent-only selection must remain persistent-only.
   Reject duplicate execution keys instead of silently accepting conflicting plans.
4. Validate every active payer's public identity and live budget before any send.
   Process entries sequentially, keeping one aggregate reservation per payer for
   the full run. Do not reset the budget on each contract or key.
5. Refresh selected TTL/policy/network ceiling immediately before preparing its
   envelope. If it is now healthy/target-satisfied, record an explicit skip. If it
   expired, cannot be read or became protected, refuse. Reuse the core helpers;
   do not manually reconstruct the threshold or target comparison.
6. Prepare with the real account and current sequence via prepareExtension. Validate
   the prepared fee against the remaining payer budget. Collect the unsigned
   preview; it is not an authorization or reusable bundle to sign later.
7. Simulation mode records simulated only after actual successful preparation.
   If no cap was supplied, say the simulation is uncapped; never imply it passed
   a live budget. It consumes no fee and has no transactionHash in BumpRecord.
8. Live mode re-checks the selected scope/guard and prepared envelope, resolves the
   Signer, checks its payer/public identity, and signs through signExtendTTL. The
   existing adapter checks the envelope before looking up the seed.
9. Persist the attempt intent before calling send. If persistence fails, do not
   call send. Submit the exact signed/prepared envelope once; reserve its maximum
   fee conservatively. Do not treat reservation as actual fee charged.
10. Confirm the same hash using the existing envelope-bound helper, then verify
    post-state: a newer expiry, observed after inclusion, satisfying inclusion
    ledger + requested target. A successful receipt alone does not prove extension.
A key newly found healthy on the pre-prepare refresh is a skip, not a succeeded
record. Retain the fresh observation in diagnostics. Under the existing strict
assertion, an initially due entry without a confirmed engine action may still
alarm; preserve that behavior and explain the skip rather than silently changing
the assertion baseline or fabricating success.

11. Collect all records and explicit skipped/unattempted keys. On an execution
    failure or uncertain send, stop further sends in this run; do not continue
    silently into another payer. Call assertLiveness with all actual records,
    execution decisions and the effective per-key action thresholds.

The final execution result has its actual mode, records, per-payer reserved fees,
remaining unattempted scope, sanitized diagnostics and final liveness. Keep the
initial scan/health available. Do not return the earlier preview verdict as if it
were the verdict after execution, or label a live result mode=dry-run.

## 4. Retry and uncertainty contract

| Failure point | Allowed behavior |
| --- | --- |
| Read/account lookup or simulation, before any send attempt | Bounded retry with backoff for transient transport/rate-limit failures only |
| Invalid config, guard refusal, invalid envelope, signer mismatch, insufficient fee cap, simulation rejection | Fail/skip with reason; no blind retry |
| Signed envelope expires before send | Stop this attempt; do not relax signer bounds |
| Send timeout, transport error, unknown send status or mismatched response | Treat as possibly submitted; retain prepared hash and stop new sends |
| PENDING / DUPLICATE | Poll the same prepared hash; no replacement envelope |
| NOT_FOUND while polling | Bounded polling of the same hash; not evidence that nothing was sent |
| Confirmed FAILED | Failed record, preserve known hash; no automatic fresh transaction in the run |
| SUCCESS but TTL read missing/unchanged/insufficient | Post-state verification failure; never claim succeeded or automatically bump again |

Proposed bounds: at most three pre-send attempts, delays 1s then 2s, a bounded RPC
request timeout, and an overall run deadline checked before every new attempt.
Use the installed SDK's documented millisecond timeout behavior; keep the existing
60-second envelope bound and strict signer checks. Reuse confirmExtension's bounded
polling rather than add an unbounded loop. Inject delays/clock for fixture tests.

Put transport retry wrappers around the read/account/simulation RPC calls, not
around the whole executor. Semantic preparation errors must not be mistaken for
transport failures. Confirmation lookup retries stay bound to the same hash.

A timeout does not cancel an already accepted transaction. No re-signing, new
sequence, fresh hash or automatic re-send after send may have happened. Finishing
one run does not by itself authorize another run to replace an unresolved attempt.

## 5. Minimum live safety seam and adjacent tasks

D16-01 needs a required **before-submit recorder** seam for live mode. It records
public attempt metadata before the network call: payer/source, key, target,
before-observation, prepared hash and validity bounds. It does not need the seed
or signed XDR. A missing/failing recorder must prevent send on the new engine live path.
For backwards compatibility, the generic/manual primitive can retain an optional
hook; the engine orchestrator must require the real recorder and must not supply
a no-op. Invoke the hook before marking send as possibly attempted. A recorder
failure is a pre-send failure; retain any known signer identity without claiming
that submission happened.

This is not a claim that a callback or an uploaded artifact is durable enough.
A concrete recorder must be verified before a real live test. For a bounded local
proof, an exclusive local attempt file in a persistent, private state directory
can satisfy the recording step; retain it on failure. Reuse the capture pattern,
not the historical W2 capture script/envelope or its consumed authorization.

| Task | Boundary |
| --- | --- |
| D16-01 | Per-run execution, fee accounting, exact-envelope safety, bounded retries and write-before-send hook |
| D16-02 | Real restart/overlap behavior, recoverable pending state and same-hash reconciliation across runs; verify the actual scheduler/store |
| D16-02b | Full within-run unique-key proof, including shared-key coverage when that execution scope is reviewed/enabled |
| D16-03 (Fatih) | Durable result summary/artifact/history output; consume BumpRecords without assuming every outcome succeeded |
| D17-04/05 | Real success/failure alert delivery and failure-mode proof before September 18 |
| D18-01/02a | Explicit unattended live activation and the separate A save proof |

Unattended live activation must wait for D16-02/02b, the recorder/recovery contract
and the alert gate. Do not use the already-running decide-only cron as evidence
that live execution is serialized or recoverable. Database adoption remains W4.
An unresolved attempt found at startup blocks replacement sends until reconciled;
a timer or artifact absence cannot silently release it.

## 6. File/seam plan

Proposed names below are local APIs, not invented Soroban RPC methods.

| File | Planned change |
| --- | --- |
| packages/core/src/extend.ts | Extract an entries-based execution primitive from executeExtensions; retain the manual wrapper/API and its tests. Add a reason option/entry context and a before-submit hook without dummy contract/delta metadata. |
| packages/core/src/engine-execution-plan.ts | Pure validated adapter from selected decisions to PlannedExtension entries; no implicit instance addition and initial instance/persistent allowlist. |
| packages/core/src/index.ts | Export the minimal reusable execution seam and types. |
| packages/engine/src/execution.ts | Orchestrate the scan/selection, per-payer budgets, injected Signer/RPC/recorder, sequential execution, retry bounds and final liveness. |
| packages/engine/src/index.ts | Export the real execution API instead of the placeholder for this path. |
| packages/shared-types/src/index.ts, core/config.ts | Add/validate optional public account and fee cap on the Ed25519 payer config; preserve existing decide-only configs. |
| scripts/engine-execute.mjs, package.json | Separate explicit execution entry point; wire the existing SDK/core adapters without giving the current cron a secret or write flag. |
| Core/engine/script tests and task docs | Regressions, compiled-command checks, record semantics and setup requirements. |

No new library, provider, daemon, custom signer contract or global refactor. Core
never imports engine. Keep prepareExtension, submitExtension, confirmExtension and
createEd25519Signer as the trusted paths under test, rather than rebuild them in
an engine wrapper.

## 7. Acceptance and verification

- A due persistent key produces an exact one-key footprint; a healthy instance is
  not added. A nonselected/temporary/code/protected key cannot reach preparation.
- Simulation produces actual simulated records and zero signer/secret/send calls.
- Live without explicit mode, flag, fee cap or recorder is refused before send.
- Real account/sequence is used; synthetic sequence zero never reaches submission.
- A second key cannot bypass the first key's fee reservation; payer accounting is
  distinct and public-account aliases cannot create independent budgets.
- Wrong payer/network/key/target/hash/time bounds/signature policy refuses before
  secret access where the signer can check it. Existing manual tests remain green.
- Pre-send transient failures retry within bounds; invalid policy does not retry.
- Ambiguous send retains one prepared hash and prevents later sends, even when
  another payer has eligible work. NOT_FOUND does not create a new transaction.
- Pending/failed/post-state-unverified results cannot become succeeded. The final
  liveness assertion sees all actual outcomes, not just successful records.
- Full pnpm check and compiled entry-point verification pass with fixture RPC.
  Simulated/live paths both need tests; a suite that only refuses everything is
  insufficient. Tests do not touch the network or read a real seed.

Implementation validation proceeds in two explicit stages:

1. Offline execution tests plus a separately reviewed unsigned Testnet simulation
   using a public payer; no seed or transaction. This is implementable before any
   temporary policy agreement or production cron activation.
2. A later concrete controlled Testnet request identifies the payer, eligible key,
   fee bound, recorder and evidence capture before any signature/send. A transaction
   must have hash, full unedited RPC response, explorer screenshot and before/after
   TTL evidence captured the same day. Do not repeat the completed W2 proof.

Do not mark the full D16-01 live path Done solely from code, fixtures or an unsigned
simulation. Record any remaining controlled-live validation explicitly. It may
share one bounded transaction with the later D17-04 proof if all acceptance and
capture requirements are met, instead of producing duplicate proof transactions.

## 8. Local workflow and decisions for this review

Review the initial entry scope, separate execution command, public payer/cap
fields, live opt-in contract, entries-based reuse and before-submit recorder seam.
These are the proposed defaults, not existing production behavior.

After plan approval: create the local branch, mark local tracking In progress,
write failing tests, implement, run checks and present the implementation for
internal review. Keep drafts/commits local until an explicit publish request.
At publication, include only approved D16 material, update external tracking and
coordinate the parent PR chain. Fatih handles PR review and merge.
