# W2-D14-04 — evidence integrity entry points (#107)

Implementation complete for internal review, based on merged main `ba72ea8`. No new transaction, signature, secret access or runtime CLI change. Issue #107 remains open pending review and publication.

## Behavior

Both advertised entry points now run the same `scripts/verify-evidence-integrity.mjs` helper before SDK/core imports or semantic verification:

```bash
node docs/evidence/2026-09-12-manual-extend-proof/verify-proof.mjs
node docs/evidence/2026-09-11-storage-advice-validation/verify.mjs
```

They read every entry in SHA256SUMS, reject malformed/empty/missing manifests, duplicate paths, absolute/parent paths and symlinks escaping the bundle, then compare file bytes against SHA-256. Missing/unreadable files and mismatches stop execution with a nonzero exit and an `Evidence integrity:` error naming the affected file. A successful integrity pass is printed to stderr; the semantic result remains JSON on stdout.

Both accept an optional evidence-directory argument for isolated offline validation. Both are read-only: they no longer regenerate recorded verification.json/offline-verification.json. Their existing semantic checks still run after integrity, including signed receipt/TTL checks in the manual proof and source/raw-RPC assertions in storage advice.

The manifest is a trusted repository artifact: this checks consistency with that manifest, not authenticity of an arbitrarily replaced manifest. No unlisted-file inventory claim is made. The signed-receipt checks remain a separate layer and are not replaced by checksums.

## Validation

The changed/missing-file tests reproduced the previous false success before the fix. Final new suite: **22 tests passed**, covering both real bundles, changes to previously unchecked files, missing files, missing/empty/malformed manifests, duplicate/escaping paths, symlink escapes, and unchanged recorded outputs. A false semantic claim with an intentionally refreshed checksum still fails, demonstrating that semantic verification remains active.

Full `pnpm check` passed **537 tests** (459 Vitest + 78 Node), including the new suite wired into the canonical test command. No thresholds were lowered. The first full run caught a lint rule on a NUL regex; the check now uses explicit string membership and the full pipeline passed after correction.

Both original bundles verify successfully: manual 103 entries, storage advice 29 entries. Byte comparison against origin/main confirms **102 manual-proof files and 28 storage-advice files unchanged**, excluding only the relevant verifier and SHA256SUMS. This includes every raw RPC response, screenshot, recorded JSON result, capture-time helper and existing README. Each manifest changes exactly one line: the hash of its edited verifier. No raw artifact was regenerated or reformatted.

Implementation is on `fix/W2-D14-04-evidence-integrity`. Next checkpoint: review, then publish a separate tooling PR linked to #107 after Rakha approval. Fatih handles merge.
