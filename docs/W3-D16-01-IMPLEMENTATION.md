# W3-D16-01 — local engine execution

Status: local implementation and offline verification complete on
`feat/W3-D16-01-engine-execution`, based on #121 head cdecdb8. Internal review is complete with no blocking findings; [review report](W3-D16-01-REVIEW.md). Published implementation commit 19f9275 in [PR #122](https://github.com/Fatihmaull/evergreen/pull/122), stacked on #121, for Fatih review/merge. Task completion still requires controlled Testnet validation.
The backlog stays In progress pending the remaining definition of done.

## Behavior and reuse

The new `runEngineExecution` connects the existing core decision pass to its
simulation, Ed25519 signer, submission, confirmation and TTL-verification helpers.
It selects only due instance and explicitly declared persistent keys. It never
adds an instance merely because a persistent key was selected. Temporary/code
entries retain observations and explicit execution-scope skips. Existing B/C and
shared-Wasm guards are retained at selection and before signing/submission.

Each selected key is refreshed before preparation. A now-satisfied key is skipped,
not reported as a successful bump; the initial strict liveness verdict can still
alarm. Preparation uses the public payer account and current sequence. Only a
confirmed matching transaction plus verified post-state TTL yields `succeeded`.

Payers can supply optional `sourceAccount` and `maxFeeStroops` fields. Existing
decide-only configurations remain valid. Execution requires public source accounts;
live execution additionally requires a positive decimal cap for every active payer.
Fees are accumulated across that payer's keys. Multiple active payer aliases for
the same account are rejected. Estimated and reserved fees are separate from
actual charged fees; simulation reserves and pays nothing.

Core changes expose exact-entry execution while preserving the manual planner and
wrapper. Optional refresh and before-submit hooks let the engine reuse the same
sequential execution loop. Core execution results now include estimated fee totals.

## Local command

Build before invoking the source-workspace entry point:

```sh
pnpm build
pnpm engine:execute --help
pnpm engine:execute --config evergreen.local.json --dry-run
```

The last command needs a reviewed public Testnet payer in that local configuration
and makes real RPC requests. It was not run against Testnet in this session.
The existing `engine:run` command and scheduled workflow remain decide-only.

Simulation performs actual envelope preparation, returns unsigned previews and
`simulated` records, and never resolves a secret or signer. An omitted simulation
cap is explicitly reported as uncapped. Unsigned previews are diagnostics, not a
bundle to sign or replay later. No environment file is automatically loaded.

Live operation requires both configuration `mode=live` and `--submit`, plus
`--attempt-file` and the payer prerequisites. Config live mode alone fails unless
explicitly overridden with `--dry-run`. A retained JSONL journal is created with
exclusive acquisition and private permissions; each public intent is flushed to
disk before sending. It includes the hash, payer, sequence, key, target and envelope
bounds, without seeds or signed XDR. Any existing file prevents another live run.

The journal is for one bounded local run. It has no automatic recovery, reset or
cross-path coordination. Changing filenames does not resolve an uncertain hash.
Across-run reconciliation and scheduler serialization remain D16-02; published
history remains D16-03. This implementation does not activate unattended live use.

Transient read/account/simulation failures have at most three attempts with 1s/2s
backoff. RPC waits are bounded to 15s and the default run deadline is four minutes.
Send is never retried. An uncertain send retains its prepared hash, polls only
that hash when applicable, and stops subsequent execution across all payers.

Exit 0 means no error or liveness alarm; exit 1 is a liveness alarm, including a
successful simulation of due entries; exit 2 is invalid input or incomplete
execution. Neither an exit code nor a preview authorizes a transaction.

## Verification and remaining work

Implementation baseline: full `pnpm check` passed with 613 Vitest tests and 85 Node script tests (698 total). The subsequent review added six cases and passed 704 tests; its separate manifest and output identify the reviewed tree.
This includes source/type checks, lint, formatting, policy, publishing-safety and
backlog gates. Coverage: 94.05% statements and 89.61% branches. The Notion gate
ran in parse-only mode and made no mirror read or write.

[Captured check output](evidence/2026-09-13-engine-execution/pnpm-check.txt) and
[source hashes](evidence/2026-09-13-engine-execution/verification.json) identify the
verified implementation. They describe the implementation snapshot; the linked review captures subsequent test additions.

The suite covers exact selection, public-payer validation, aggregate budgets,
recorder failure, signer binding, pre-prepare refresh, ambiguous sends, same-hash
polling, failed post-TTL verification, transport bounds, and the built CLI against
an RPC fixture transport. Recorder tests exercise flush, retained-file refusal and
exclusive acquisition. Cryptographic signing tests use test-only keys; no
operational seed was read. The obsolete engine-placeholder test was removed.

No live RPC, new Testnet transaction, funding, scheduler activation or repeat of
the W2 A proof occurred. Unsigned Testnet validation and a separately scoped
controlled live proof remain pending reviewed public payer/fee inputs and the
appropriate authorization. Fixture success does not close those requirements.

Rakha's workflow remains local implementation → internal review → explicit publish
→ Fatih review/merge. #120/#121 were open at startup; this report does not claim a
later merge. The D15-02b policy draft and W3 handoff remain separate local files.
