# W2-D11-01 — implementation review, 2026-09-10

Reviewed the implementation branch against refreshed `origin/main` at `ed16bc2` (#85), including signer/footprint/fee checks, explicit submission, partial outcomes, confirmation, post-state verification, CLI scope and existing scan compatibility. Sequential review; no sub-agents or live transaction.

## Finding fixed — P1: confirmation hash was an SDK echo

`confirmExtension` compared the requested hash with `getTransaction().txHash`. Installed Stellar SDK 17.0.1 sets that property from the request in `rpc/server.js`; it is not evidence about the returned envelope. A response could therefore have an echoed matching hash and a different transaction envelope and still pass the confirmation check. A later TTL observation does not repair that missing transaction identity check.

Reproduction: return SUCCESS and the requested hash alongside an envelope with another sequence number. The test accepted it before the fix. The adapter now computes the Testnet hash of the returned envelope on both SUCCESS and FAILED. Missing or mismatched envelopes reject confirmation. The execution layer preserves the uncertain submitted hash and does not retry or advance to the next entry. The existing CLI/default-submit interface is unchanged.

Implementation: `packages/core/src/extend-rpc.ts`, `confirmExtension`. Regression coverage: `packages/core/test/extend-rpc.test.ts`, tests for a different envelope and absent envelopes on both terminal statuses; positive tests use actual SDK envelopes.

## Integration and validation

- Integrated #84's stranger-facing quickstart and #85's task closure notes. Kept the new quickstart and appended manual-extension instructions; clarified that scan is read-only while extend requires explicit submission.
- Final `pnpm check` passed: 378 Vitest + 36 Node tests = 414, with typecheck, lint, formatting and repository guards. One formatting mismatch was fixed before the final passing gate.
- `pnpm test:coverage` passed the unchanged thresholds: statements 92.46%, branches 86.60%, functions 92.03%, lines 94.22%. The subsequent formatting-only change has no behavioral effect.
- All-ID mirror presence: 145 registered repo IDs / 146 Notion rows; no missing IDs, only the intentionally retired Dropped predecessor ~~W3-D18-02~~.

## Result and limits

No remaining blocking code finding was identified in this review scope. Ready for PR publication when Rakha authorizes it; no PR or merge was performed during review. The prior unsigned A-instance simulation remains valid evidence for preparation only. D11-01 stays In progress and D11-02/03 remain Pending until the separately reviewed live transaction and TTL-increase evidence are captured. Software signer validation is not the W3 on-chain policy signer. D11-04 remains Fatih's explicit dry-run interface and independent acceptance task.
