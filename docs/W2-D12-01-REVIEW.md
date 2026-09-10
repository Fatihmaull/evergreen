# W2-D12-01 — implementation review, 2026-09-10

Reviewed against refreshed `origin/main` at `ed16bc2` (#85). Scope: analyzer eligibility and evidence, optional settings/quotes, CLI integration and fallback, existing scan behavior, packaging of evidence metadata and recorded A output. Sequential review; no sub-agents, live reads or transactions during review.

## Result

No blocking correctness finding was identified in this scope. One wording clarification: historical persistent rent is now described as about **1.95 times the temporary rent**, replacing the ambiguous “1.95x higher.” Numerical data, eligibility and runtime behavior are unchanged. The original A captures retain their original wording and remain dated evidence of the earlier implementation.

Checked that:

- Instance entries do not receive durability-conversion advice; missing/unreadable metadata does not become a fabricated recommendation.
- Minimum lifetime, current observed TTL and the isolated deletion experiment remain distinct.
- Historical rent is separate from total fee and current quotes; malformed/stale/missing prices remain unavailable and a valid zero remains zero.
- Shared code is reported once with unique known consumers and an explicit limitation about unseen consumers.
- Plain scans avoid the added settings read. Optional pricing is called only with `--cost`, once; failures retain scan output and qualified advice.
- JSON adds optimization without replacing existing scan fields; scan exit semantics are preserved.
- Evidence metadata is included in the production build without reading repository fixtures at runtime.

## Validation and publication boundary

Fresh full `pnpm check` after the wording change passed **326 Vitest + 36 Node = 362 tests**, typecheck, lint, formatting and repository guards. The implementation's preceding coverage run passed unchanged thresholds (95.78% lines / 88.01% branches); review did not change control flow or coverage configuration. Diff whitespace check passed.

Ready for PR publication after Rakha's instruction. No D12 PR or merge occurred during review. D12-01 remains Done for its verified branch implementation; D12-02's broader guinea-pig/third-party validation remains Pending. D11 PR #86 and Fatih's #87 handoff remain separate, and this review does not validate their write path.
