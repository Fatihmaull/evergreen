# PR #86 / #88 synchronization — 2026-09-10

Base: main #93 (`96ebe2d`). D11 runtime head `343e112`, D12 runtime head `f661261`. These remain independent PRs. A local validation merge at `65e9d90` on `integration/W2-D11-D12-sync-check` preserves both exports, CLI paths and documentation; it was not merged into main and is not a third PR.

| Tree | Full check | Lines / branches coverage | Installed CLI-only tarball |
|---|---|---|---|
| D11 | 428 tests passed | 94.54% / 86.65% | extend help + scan with new sharing caveat |
| D12 | 376 tests passed | 96.54% / 88.03% | scan with new sharing caveat + three optimizer findings |
| Combined | 446 tests passed | 95.58% / 88.37% | both paths together |

Coverage thresholds, bundle safety and publish safety checks were not weakened. The combined check also ran after generated core/shared-types/CLI dist directories were moved aside, proving the corrected build-before-bundle order works without warm dist. Old generated output was retained in temporary backups.

Each rehearsal packed the CLI, installed only its tarball into a fresh directory outside the repository with a fresh npm cache, and checked that the only runtime dependency is exact `@stellar/stellar-sdk@17.0.1`. No core/shared-types sibling package was installed. The executed binary was the publishable `dist/evergreen.mjs`, not the workspace TypeScript entry point. CLI network requests were intercepted and answered from existing fixtures; unexpected methods threw without accessing the network. Only npm registry downloads used the network. No live RPC, account key, signing or transaction.

The recorded fixture has low temporary TTL, so scan exit **1** is correct. The rehearsal initially assumed exit 0; its assertion was corrected, not the product. A cross-filesystem rename in the temporary backup helper was likewise corrected to a move before the successful clean-output run.

## Corrections that synchronization required

- Shared W2-D14-02d / [Issue #95](https://github.com/Fatihmaull/evergreen/issues/95): pnpm check used to inspect a bundle before building its dist inputs, while CI omitted bundle/publish/policy gates. Typecheck now precedes artifact gates, and CI runs canonical pnpm check. The same corrective change is present in both PRs.
- D11: synthetic quote identities did not replace the real payer/sequence path. Mutation to sequence zero failed the regression (built sequence 1 versus expected 13), then the real implementation was restored. Advisory coverage/sharing issues no longer reject an explicitly selected readable entry.
- D12: new sharing advisory issues initially removed the code recommendation (two findings instead of three). Advisory issues are now distinct from actual read failures; the latter still suppress unsupported advice.

## Merge handling

Recommend reviewing/integrating #86 first, then synchronizing #88 with the resulting main and rerunning combined validation. In the local merge, command.ts and bin.ts combined automatically; core exports and documentation needed explicit preservation of both sides. Keep the extend/default-submit path, optimizer scan path, both sets of exports, and both evidence/doc sections. #89 remains open until the actual main integration and its passing CI are linked. No PR merge is authorized or performed by this rehearsal.

[Machine-readable results](summary.json) retain temporary install locations as provenance. [Rehearsal script](artifact-rehearsal.mjs.txt) is a local-only reproduction aid, run from the repository root with d11/d12/combined as argument after checking out the intended tree. It installs registry dependencies, moves generated dist directories into backups, and never performs chain writes.
