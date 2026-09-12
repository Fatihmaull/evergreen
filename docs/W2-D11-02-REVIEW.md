# W2-D11-02/03 — pre-publication evidence review

Reviewed 2026-09-12. Input evidence commit `19d54af`; runtime base `origin/main` `c3ba97b`. Review is scoped to the branch's plan/tracking/evidence changes. Runtime diff against main is empty. No live request, secret read, signature or transaction during this review.

## Verdict

**Ready for publication after Rakha approval.** One P2 evidence-verifier finding was reproduced and corrected. No remaining blocking finding identified in the reviewed scope. PR creation and Fatih review/merge are separate steps; #103 remains open.

## Corrected P2 — reported envelope fee was not bound to the actual envelope

The offline verifier trusted `send-attempt.json.fee` for the reported envelope maximum. Changing only that field from `15073` to `24999` in a temporary evidence copy still exited 0 and reported 24,999, although the sent transaction's encoded fee remained 15,073. The actual transaction was valid; the verifier could certify an incorrect summary.

The verifier now asserts the attempt fee and sequence equal the decoded envelope; pins the approved payer and A-instance key; binds record payer/signer/key/target/before state to the same request; verifies the Ed25519 signature; requires the confirmed signed envelope to match the sent envelope; and checks the raw result is txSuccess. It also decodes resultMetaXdr and requires the operation's exact state/update pair for the SHA-256 ledger-key hash, with old/new TTL equal to the before/after evidence. This directly links the TTL update to the receipt, beyond sampled post-state alone.

No capture-time recorder, raw request/response, original screenshot, or pre-send artifact was changed. Only the verifier, its derived summary, and review documentation changed, with an additional negative-check result file. Manifest regenerated for these intentional changes.

## Verified result

- Transaction: `e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a`, included in ledger 4,626,423.
- A instance only, one extension operation, one read-only footprint key, no writable keys.
- Requested delta 1,000; resolved target 1,400,168; raw receipt TTL 6,025,589 → 6,026,591. Increase 1,002 includes the two-ledger plan-read/inclusion gap.
- Actual fee 5,064 stroops; encoded envelope maximum 15,073; approved ceiling 25,000.
- Exactly one captured send. NOT_FOUND responses are polls of that transaction, not resubmissions.
- Five protected B/C/shared-code control entries retained the same expiry over the proof window. This does not predict future expiry changes.
- Original explorer and before/after CLI screenshots match the recorded values. Image presence checks alone do not interpret image contents; the images were visually inspected at capture and their bytes verified unchanged in this review.

## Validation

- Corrected offline verifier passes on the original proof.
- Six temporary corrupt copies fail: wrong envelope fee, wrong record payer, wrong expiry, changed protected control, missing explorer screenshot, and missing transaction metadata.
- Full `pnpm check` exit 0: **434 Vitest + 36 Node = 470 tests**, coverage enabled (93.88% statements, 88.69% branches, 93.75% functions, 95.67% lines).
- Runtime diff against origin/main is empty; all raw RPC and original screenshot bytes remain unchanged.
- All-ID presence: 146 registered IDs / 147 mirror rows, no missing; sole extra is the intentionally retired Dropped predecessor ~~W3-D18-02~~.

[Proof and artifacts](evidence/2026-09-12-manual-extend-proof/README.md). Evidence is branch work, not merged main. The historical live command must not be rerun.
