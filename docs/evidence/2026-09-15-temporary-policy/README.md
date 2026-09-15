# W3-D15-02b — temporary retention e2e, 2026-09-15

**Outcome:** default-off made no transaction; explicit per-entry opt-in extended
one disposable temporary key and verified post-state. One critical test email was
accepted by Resend and Rakha confirmed **“masuk inbox”** in this session.

Subject: `CA55NQWVWCG2W5HXZVOU7QZRAGMPDVOJG26BJBIIL2GD76AU5IN455Y7`.
Wasm SHA256: `cade2fb6` prefix (full value in deployment.json and verification.json).
The stored Wasm adds an inert custom section to the existing guinea-pig fixture,
creating a distinct code key. A/B/C's shared Wasm is not part of this proof.
Implementation runtime corresponds to local commit `2c3a28a`; no publication yet.

| Transaction | Hash | Raw receipt | Screenshot |
| --- | --- | --- | --- |
| Upload unique fixture | `cc8210e69acdd13b54236614fcd3deae1ae6b4bf7e00d7371afc43b39741cb94` | [JSON](upload-transaction.json) | [Explorer](upload-explorer.png) |
| Deploy | `5b0dd7ac565a82457f1a033cb490042717e109267344afe868c0960581d43b28` | [JSON](deploy-transaction.json) | [Explorer](deploy-explorer.png) |
| Seed | `e893648c48b276af3fcd15ac0705899113de3c7d6a8e01b3034547adb18c3067` | [JSON](seed-transaction.json) | [Explorer](seed-explorer.png) |
| Temporary extension | `c696f477bd50ecaa0574d557c2981aac6c28646cf1e71c7e07dcfae4decdb8fd` | [JSON](extend-transaction.json) | [Explorer](extend-explorer.png) |

Fee cap was 2,000,000 stroops per transaction; charged fees were 1,669,899, 19,502,
29,928 and 8,902 stroops respectively (1,728,231 total). Setup uses the Testnet dev
payer, not the bot's operational balance. No real funds or mainnet interaction.

## Evidence interpretation

- `rpc/` retains full unedited request/response JSON. Named transaction receipts
  are byte-for-byte copies of successful raw RPC responses.
- `default-off-confirmed.json`: no execution records, no secret provider access.
- `opt-in-preview-confirmed.json`: exactly one candidate, the declared temporary key.
- `live-success.json`: the engine's successful record, with expiry **4,686,093 →
  4,785,404**, inclusion ledger **4,685,404**, target 100,000 ledgers.
- `verification.json`: offline checks bound the signed envelope hash to the receipt,
  checked one extendFootprintTtl operation, one temporary read-only footprint key,
  zero read-write keys, and post-state matching a raw getLedgerEntries response.
- `email-intent.json` and `email-receipt.json`: one labelled controlled critical
  alert, provider ID `a5b812d6-4a2e-4b82-b1d6-f7ea0a6807d3`.
  `inbox-confirmation.json` records the recipient's separate confirmation.

## Retained failures and corrections

The upload helper originally rendered a Uint8Array hash using `.toString('hex')`,
which produced a comma-separated number string. The upload was already successful;
only its subsequent lookup failed. `upload-intent.json` retains that original local
metadata. `upload-canonical-hash.json` records the corrected hash derived from the
unchanged signed envelope; the successful raw receipt verifies it. No re-upload.

The first engine attempt (`live-result.json`, `rpc/engine-*`) stopped before any
simulation or submit: execution refresh omitted temporary keys. Its regression test
and implementation were fixed. The second attempt (`rpc/engine2-*`) produced the
single successful extension. No uncertain transaction was retried.

The test email uses the real first attempt's failure alert, clearly labelled as a
controlled historical pre-submit failure, not a current incident. The first local
email construction rejected a display-name sender before network access; the plain
sender address was then used for the one accepted delivery.

## Integrity

From this directory run `sha256sum -c SHA256SUMS` before reading claims. The checksum
manifest includes raw responses, screenshots and interpretation files. Checksums
protect the retained bytes; RPC responses are not themselves signed attestations.
No original response was edited to remove a failure or manufacture success.
