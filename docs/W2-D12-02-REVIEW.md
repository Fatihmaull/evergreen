# W2-D12-02 — internal evidence review, 2026-09-11

Reviewed validation branch based on #88 at `38e6543`; refreshed main remains `96ebe2d`. Scope: third-party provenance, explicit storage keys, raw/reported TTLs, B/C deduplication and post-read, scope limits, and offline verification. No production code or live chain action during review.

## P2 finding fixed: offline verification did not bind every conclusion to raw evidence

The original capture asserted post-read completeness and registry equality, and the captured evidence remains consistent. However, the standalone offline verifier was weaker: an empty B/C post-read passed its loop vacuously, and an altered published Wasm hash was not checked directly because the verifier only compared against its derived summary. Both mutations incorrectly exited 0 on temporary copies.

The verifier now checks:

- Every B/C post-read key appears exactly once, matches the request and initial key set, and comes from a ledger no earlier than the initial observation.
- The publisher registry digest, selected pool/asset and pinned commits agree with provenance; the observed Wasm hash agrees directly with the registry and the derived summary.
- Captured Testnet passphrase and parsed network settings agree with the saved inputs.
- Blend keys decode to the documented persistent variants and asset; reported exits, counts and shared consumers agree with explicit expectations.

## Validation

The unmodified capture passes offline replay. Four temporary-copy mutations are rejected for the intended reasons: empty post-read, duplicate post-read key, different registry hash even with its checksum updated, and settings not matching raw RPC. See [mutation results](evidence/2026-09-11-storage-advice-validation/review-mutation-results.json) and its reproducible script.

All 15 original RPC request/response and publisher-registry raw files still match their pre-review SHA256 digests. Original live reports and observations were not replaced. Full `pnpm check` passed **340 Vitest + 36 Node = 376 tests**, with existing gates and thresholds unchanged.

## Conclusion and publication boundary

No remaining blocking finding identified in this review scope. B/C exit 3 is expected for missing temporary keys; Blend exit 0 only covers the explicit live keys. The conditional advice does not classify required reserve/config data as disposable or promise savings. A's prior evidence remains a dated reused baseline, not a new live read. Source/schema inspection plus a registry-matching Wasm hash is not a reproducible build attestation.

Ready for publication after Rakha's instruction: PR plus issue for the work, with Fatih mentioned and requested to review. Fatih handles merge. No PR or issue publication was performed during this internal review.
