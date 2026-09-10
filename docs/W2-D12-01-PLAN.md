# W2-D12-01 — basic storage advice implementation plan

> Execute sequentially with `superpowers:executing-plans` after Rakha reviews this plan. Checkboxes are steps within W2-D12-01, not additional backlog IDs. No sub-agents for routine implementation.

**Goal:** add actionable, evidence-qualified storage advice to an existing Testnet scan without changing storage, extending TTL or changing scan health policy.

**Architecture:** a pure core analyzer consumes the existing `ScanResult`, optional network settings and optional per-key rent quotes. CLI adds an opt-in `--optimize` report alongside existing health/cost output. Evidence metadata is bundled as small production constants verified against repository fixtures; runtime never imports from a test/evidence directory.

**Stack:** existing TypeScript, Node 24, pnpm and Vitest; no new dependency.

**Spec:** BACKLOG.md § Day 12, narrowed by merged #81; PRD § 6.1 / storage-optimizer deliverable; ARCHITECTURE § shared entries and shared types; SOROBAN-PRIMER § measured TTL floors; ADR-005/006. Owner: Rakha. Planning only, 2026-09-10.

**Base and branch:** `origin/main` at `ed16bc2` (#85), planning branch `docs/W2-D12-01-optimizer-plan`. Use `feat/W2-D12-01-basic-storage-advice` from this reviewed plan when implementation starts. D11's branch/PR #86 stays separate, and #87 stays Fatih's D11-04 handoff. D12 does not import or reimplement D11 signing, submission or confirmation. Check current main and coordinate the shared CLI dispatch before editing it; consume D11's changes only once merged or explicitly coordinated, never silently replace them.

## Execution status — 2026-09-10

Rakha approved execution. Analyzer, bundled evidence and CLI integration are implemented on `feat/W2-D12-01-basic-storage-advice`. Full 362-test gate, unchanged coverage thresholds, isolated built-module check and actual read-only A human/JSON runs passed. The remaining workflow checkpoint is Rakha result review before PR publication; D12-02 remains Pending. The checkboxes below retain the original execution recipe, including future publication and broader validation steps. No transaction was performed.

## Scope and what this adds

The current `health.ts` already grades expiry, temporary deletion severity and sharing; `scan.ts` prints health and coverage, and `cost.ts` prints estimates and cost concentration. D12 adds **what to consider doing and why**, with the limits of the available evidence. It does not add another health grading system or another rent model.

| Advice | Trigger | Action and limits | Cost evidence |
|---|---|---|---|
| Temporary retention | Observed temporary data key | Compare intended retention with its observed TTL. If it must survive expiry, evaluate persistent storage in contract source; otherwise allow deliberate expiry. Never silently auto-bump or decide application retention policy. | Historical A durability comparison; optional current quote for this key. |
| Durability review | Observed persistent **data** key | Only if data is disposable/recomputable, evaluate temporary storage. Keep balances, durable configuration and other required state persistent. Not a recommendation to migrate an unknown contract's data automatically. | A measured 103,849 versus 53,196 **rent** stroops, equal encoded sizes, extension durations differing by two ledgers. About 1.95x in that observation, not a universal coefficient. |
| Shared code dependency | Observed code key | Monitor the code key once and retain all known consumers; their instances alone do not establish protection. One observed consumer does not establish exclusivity. | Current per-key quote when supplied; otherwise explicitly unavailable. No claimed global savings or duplicated rent. |

Instance entries do not receive a persistent-to-temporary suggestion. Missing/unreadable entries do not acquire invented lifecycle/size/cost facts. Do not mark a missing temporary key as a directly observed deletion merely from an absent response.

**Excluded by the basic-only cut:** size/duplication heuristics, arbitrary storage enumeration, payload collection, automatic migration, contract-source analysis, writing transactions, batch CLI syntax and changing W3 temporary-entry policy. `ScanResult` contains TTL metadata, not values or byte lengths; calling entries oversized or byte-identical from this structure would be unsupported. No shared-types schema change is needed.

## Evidence rules

- Prefer current network configuration via existing `readStateArchivalSettings`, labelled with its observation ledger. Historical settings at ledger 4,519,665 were minimum lifetime 720 temporary / 120,960 persistent; 688 / 120,927 were later **remaining-TTL samples**, not creation minima. Never present the minimum lifetime as the current entry's expiry. The setting includes the current ledger; remaining zero stays live.
- If settings are unavailable/invalid (including parser defaults of zero), omit current minima and show a dated historical reference plus an explicit context limitation. Do not report zero lifetime or silently call historical settings current.
- The direct adjacent-ledger deletion proof is the **isolated temporary entry** from 2026-09-06 in `docs/evidence/2026-09-06-ttl-boundary/`. B's later absent temporary entry is a separate observation; do not attribute the isolated L/L+1 proof to B or claim its exact deletion minute.
- Use the numerical fields of `extendTTL-fees-guinea-pig-a.json`. Persistent/temporary data were both 88 encoded bytes with 76-byte keys; rent was 103,849 / 53,196 stroops, while total fees were 106,308 / 55,655. Do not label total fee as rent, infer byte-identical contents from equal sizes, or explain the rent-ratio residual as non-refundable fees already excluded from rent.
- Historical amounts are benchmark context, not a quote for the scanned key and not forecast savings. A current quote keeps its key, ledger, requested increment and unavailable state. Never multiply an unknown entry's cost by 1.95 to invent a counterfactual price.
- Sharing reports known consumers only, once per canonical code key. Unknown quotes are `unavailable`, never zero; a measured zero quote is distinct from missing data.

## Proposed command and result contract

```text
evergreen scan <contract-id> --optimize --keys-file keys.json
evergreen scan <contract-id> --optimize --cost --ledgers 518400 --json
```

Without `--optimize`, existing scan behavior/output and RPC work stay unchanged. With it, one additional network-settings read is permitted; no funded payer or rent simulation is required unless `--cost` is also requested. Reuse the existing cost path once and map `CostLine.rentByEntry` into core context, keeping its provenance. `--ledgers` retains its existing cost-only validation; this task introduces no alternative target convention.

Proposed core-local types in `optimizer.ts` (names are new, not existing SDK APIs):

```ts
type AdviceCode = 'temporary-retention' | 'durability-review' | 'shared-code-dependency';
interface StorageAdviceContext {
  settings?: { minTemporaryTtl: number; minPersistentTtl: number; observedAtLedger: number };
  quote?: {
    rentByEntry: Readonly<Record<string, import('@evergreen-stellar/shared-types').Stroops>>;
    pricedAtLedger: number;
    additionalLedgers: number;
  };
}
interface StorageAdvice {
  code: AdviceCode;
  entryKey: string;
  knownConsumers: readonly string[];
  action: string;
  rationale: string;
  benchmarkId?: 'guinea-pig-a-2026-09-09';
  currentRent: { status: 'unavailable' } | { status: 'quoted'; stroops: string };
}
interface StorageAdviceReport {
  scope: 'observed-keys-only';
  context: StorageAdviceContext;
  findings: readonly StorageAdvice[];
  limitations: readonly string[];
}
// analyzeStorage(scan: ScanResult, context: StorageAdviceContext): StorageAdviceReport
```

The report is added as `optimization` to CLI JSON, alongside the unchanged `entries`, `issues`, `coverage`, `health` and optional `cost`. Human output appends recommendations with compact source references. No advice means no supported recommendation for the supplied keys, not "fully optimized". Exit precedence remains the existing scan result (2 > 3 > 1 > 0); advice is not a new alarm or authorization to transact. Partial settings/quotes are visibly qualified in `limitations` and per-key fields rather than hidden by exit 0.

## File map

| File | Change |
|---|---|
| New `packages/core/src/optimizer.ts` | Pure analyzer, core-local report types |
| New `packages/core/src/optimizer-evidence.ts` | Small bundled historical benchmark with source URLs/dates; no runtime fixture-file access |
| New `packages/core/test/optimizer.test.ts` | Advice eligibility, truthful scope, absent data, deduplication and immutable inputs |
| New `packages/core/test/optimizer-evidence.test.ts` | Compare bundled facts with recorded fixture/config/proof fields |
| Existing `packages/core/src/index.ts` | Export analyzer and report types |
| New `packages/cli/src/optimizer.ts` and `packages/cli/test/optimizer.test.ts` | Human formatter and additive JSON/flag integration tests |
| Existing `packages/cli/src/command.ts`, `bin.ts` | Opt-in argument, injectable settings context, existing cost result reuse |
| CLI README, ARCHITECTURE, BACKLOG, STATUS | Usage, supported limits, ownership and outcomes |

## Ordered implementation and review checkpoints

### 1. Evidence and analyzer

- [ ] Refresh main/PR #86 and #87; coordinate any active CLI edits. Validate D12 Notion rows, mark implementation In progress, create and immediately push the implementation branch. Preserve this plan's separate history.
- [ ] Write the evidence tests first: assert rent 103849/53196 versus total fee 106308/55655; assert historical configured minima 720/120960 versus sampled remaining values; point exact deletion evidence at the isolated experiment. Run `pnpm exec vitest run packages/core/test/optimizer-evidence.test.ts` and observe failure before adding production constants.
- [ ] Implement only those verified constants, with source/date metadata. Unit tests may read repo fixtures; packaged runtime must not. Repeat the same command to green.
- [ ] Write analyzer tests using existing scan fixtures/mock: temporary and persistent data produce conditional advice; instance never gets durability conversion advice; each code key appears once with all known consumers; unknown/missing entries do not become recommendations with fabricated facts. Test no mutation of the input.

Required behavioral assertions on fixture-built reports include:

```ts
// scan is produced from the recorded four-entry fixture via the existing mock reader.
const report = analyzeStorage(scan, {});
const persistentKey = Object.keys(scan.entries).find(key => scan.entries[key]?.kind === 'persistent')!;
const instanceKey = Object.keys(scan.entries).find(key => scan.entries[key]?.kind === 'instance')!;
expect(report.scope).toBe('observed-keys-only');
expect(report.findings.filter(f => f.code === 'shared-code-dependency')).toHaveLength(1);
expect(report.findings.find(f => f.entryKey === persistentKey)?.currentRent)
  .toEqual({ status: 'unavailable' });
expect(report.findings.some(f => f.entryKey === instanceKey && f.code === 'durability-review'))
  .toBe(false);
```

- [ ] Run `pnpm exec vitest run packages/core/test/optimizer.test.ts` to prove the missing analyzer/behavior fails, implement `analyzeStorage`, and rerun green. Reuse TTL/health helpers if a condition needs them; do not duplicate expiry/threshold comparisons. Commit the core slice with W2-D12-01 in the subject.

### 2. Opt-in CLI integration

- [ ] Write command tests first: plain scan never requests settings; `--optimize` requests them once and never requests pricing unless `--cost` is also present. Reject repeated/unknown flags before RPC. A transport error for optional settings is a visible limitation, not a false zero minimum.
- [ ] Add `readStorageSettings?()` to `CliDependencies`, returning the settings context or unavailable context after a sanitized error. `bin.ts` supplies the read-only implementation. This callback runs only after the scan's Testnet network check.
- [ ] Implement the formatter and opt-in JSON property. Preserve scan exit and every pre-existing JSON field. Evidence-backed historical comparison and unavailable current pricing must remain distinguishable in human output as well as JSON.
- [ ] Handle the existing `--cost` error early-return path: even when the quote fails, produce the optimization report with unavailable prices and the original scan result. Do not change non-optimize behavior while consolidating this path. Assert the existing pricing callback is called once, not again per recommendation.
- [ ] Test example outcomes: shared code with one observed consumer still warns about unseen consumers; malformed/missing quotes never become savings; a temporary entry with an extended TTL uses its actual observation rather than claiming imminent expiry from a historical minimum. Run `pnpm exec vitest run packages/cli/test/optimizer.test.ts packages/cli/test/command.test.ts packages/cli/test/cost.test.ts packages/cli/test/scan.test.ts`. Commit once green.

### 3. D12-01 validation and result review

- [ ] Run full `pnpm check` and `pnpm test:coverage` with existing thresholds unchanged. Confirm production build includes the benchmark without importing `test/` or `docs/evidence/` at runtime.
- [ ] Run explicit read-only Testnet advice on A with its documented keys; preserve raw reads/settings and complete CLI human/JSON output. If pricing is requested, preserve the raw simulation and label its current quote independently from historical benchmarks. No secret, funding, signing or submission.
- [ ] Check actual advice for eligibility and provenance, not just exit 0. Observe whether unknown data/settings remain visible. Record evidence and update docs/trackers; do not call a unit-only implementation Done.
- [ ] Present Rakha the result, limitations and diff. Review precedes PR publication. Only after publication approval, create the D12 PR and request Fatih's review; use a dedicated Issue if a real blocker/overlap requires coordination. Do not auto-merge or start transactions.

### 4. Following task — W2-D12-02

This remains Pending. Reuse the A evidence where applicable; add B/C read-only shared-key coverage via the existing core multi-contract scanner and one independently published third-party Testnet contract with documented provenance. Verify the selected contract exists at execution time and use only known explicit data keys. If only instance/code can be established, report that scope rather than inventing data keys or claiming the contract has none. No new batch CLI feature or third-party deployment. Compare advice with known lifecycle/source facts; correct unsupported advice before reporting this validation Done.

## Current limits and completion state

This turn produces the plan and tracking only. No optimizer implementation, new live read, quote or transaction. D11 remains published separately in #86 and D11-04 handoff in #87. A D11 review blocker takes priority if Fatih reports one. No new task IDs; end-of-session Notion comparison covers all registered IDs, and D12-01 is In progress for planning only while D12-02 stays Pending.
