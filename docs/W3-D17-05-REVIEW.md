# W3 Stage 1 internal review — 2026-09-14

**Result: three reproduced P2 findings fixed; no unresolved blocking finding in
this scope.** Fresh full `pnpm check` passed: 731 Vitest + 95 Node = 826 tests.
Publication and Fatih review/merge are separate. No new send or live transaction.

Reviewed W3 Stage 1 baseline `4451394..70efd93`, then checked the fixes below.
Fix commits: `ae151e4` (watcher) and `b005e01` (runtime/manifest).
Sequential review under the repo's agent-cost rules; no subagents. Scope covers
alert planning, execution/delivery journaling, external scheduler observation,
runtime/campaign checks, capture harness, tests, runbook and recorded evidence.
The existing core execution/signer was traced at the integration seams.

## Reproduced findings and corrections

| Severity | Finding | Reproduction and correction |
| --- | --- | --- |
| P2 | Watcher reopened the same late-job incident after an API outage | `late job → observer error → same late job` generated a new ID and third delivery. The incident generation now changes only when execution becomes healthy. Returning from an API error deduplicates the original incident; healthy recovery still rearms. Regression exercises the real persisted watcher. |
| P2 | Runtime could claim HEAD while copying stale build output or uncommitted source | A fixture repository with committed source and ignored stale dist produced the stale marker; an uncommitted source edit was accepted too. Builder now checks tracked/untracked runtime inputs, forces the installed TypeScript compiler to rebuild, checks inputs/HEAD again and only then emits the snapshot. Modified and untracked source cases refuse. No package install or network is needed. |
| P2 | Campaign could omit a modified dependency from hash verification | Remove `engine-recorder.mjs` from campaign files and modify it: readiness passed because it checked only the remaining list. Readiness now requires source commit, root and complete file map to match the generated runtime manifest before verifying bytes. The omission regression now refuses. |

All reproductions failed before their corresponding fix and passed after it.
The source fixture tests create and remove tiny local Git repositories; they do
not alter the Evergreen source history or use credentials.

## Verification and practical limits

- Full check, including the new offline subprocess/runtime tests, passed unchanged.
- The committed builder also produced a new 42-file snapshot from the actual repo
  at b005e01; its command help and complete-manifest readiness passed without
  execution, network, signer or email.
- Persist-before-send paths retain the original transaction result, even when
  delivery or receipt persistence fails. Preview remains separate from delivery.
  An existing run/attempt is never automatically reset to retry a transaction.
- Success/unconfirmed/failure rendering and per-key precedence were traced; a
  separate protected-key alarm is retained beside A's successful bump.
- At local review, before publication reconciliation, production package sources had no diff from the proof's `32670fe`.
  At that review point, after fresh compilation, all 35 recorded package files/metadata hashes matched
  the original campaign. All six captured script hashes match that commit too.
  The pre-fix builder defect therefore did not invalidate this captured run.
- Existing complete campaign passes the strengthened readiness check. Original
  signed-envelope, signature, receipt/metadata TTL change, five unchanged controls,
  timer provenance and checksum verification still pass. Historical evidence and
  the original runtime were preserved rather than rewritten as the reviewed build.
- Email inbox evidence remains human confirmation. One controlled failure initially
  arrived in spam; that observation is preserved. No resend was required.
- The local scheduled A proof is not production GitHub deployment. D18-02a still
  requires Shared acceptance via #130. Hosted recurring live execution still needs
  durable pre-send intent storage; none was silently enabled here.
- Directories and manifests are trusted local operator inputs, not a defense against
  a compromised host. The installed SDK is reused; this is not a hermetic release.

## Before publication

Keep the code/evidence slices reviewable and reconcile them with current GitHub.
Apply these follow-up fixes to the affected published slice heads; old local parent
branches do not automatically acquire them. Refresh #137/#138/#130/#128 then,
without treating this local review as Fatih approval or merge. Notion remains
pending publication per Rakha's staged workflow.
