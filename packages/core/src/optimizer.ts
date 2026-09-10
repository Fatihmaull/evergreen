import type { ScanResult, Stroops, TTLObservation } from '@evergreen-stellar/shared-types';
import { STORAGE_ADVICE_EVIDENCE } from './optimizer-evidence.js';

export interface StorageSettings {
  readonly minTemporaryTtl: number;
  readonly minPersistentTtl: number;
  readonly observedAtLedger: number;
}
export interface StorageAdviceContext {
  readonly settings?: StorageSettings;
  readonly quote?: {
    readonly rentByEntry: Readonly<Record<string, Stroops>>;
    readonly pricedAtLedger: number;
    readonly additionalLedgers: number;
  };
}
export interface StorageAdvice {
  readonly code: 'temporary-retention' | 'durability-review' | 'shared-code-dependency';
  readonly entryKey: string;
  readonly knownConsumers: readonly string[];
  readonly observedAtLedger: number;
  readonly ttl: TTLObservation;
  readonly action: string;
  readonly rationale: string;
  readonly benchmarkId?: 'guinea-pig-a-2026-09-09';
  readonly currentRent:
    { readonly status: 'unavailable' } | { readonly status: 'quoted'; readonly stroops: Stroops };
}
export interface StorageAdviceReport {
  readonly scope: 'observed-keys-only';
  readonly context: StorageAdviceContext;
  readonly findings: readonly StorageAdvice[];
  readonly limitations: readonly string[];
  readonly evidence: typeof STORAGE_ADVICE_EVIDENCE;
}
function ledger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;
}
function lifetime(value: number): boolean {
  return ledger(value) && value > 0;
}

/** Advice about design choices, not another health grade or an instruction to transact. */
export function analyzeStorage(
  scan: ScanResult,
  context: StorageAdviceContext = {},
): StorageAdviceReport {
  if (scan.network !== 'testnet') throw new Error('Storage advice requires Testnet observations');
  const limitations = [
    'Only observed keys were analyzed; storage was not enumerated. No size, duplicate-content or global-consumer inference is supported.',
    'Advice is conditional on application requirements; it does not authorize a transaction or change scan health exits.',
  ];
  const settings = context.settings;
  const validSettings =
    settings != null &&
    lifetime(settings.minTemporaryTtl) &&
    lifetime(settings.minPersistentTtl) &&
    ledger(settings.observedAtLedger);
  if (!validSettings)
    limitations.push(
      "Current minimum lifetimes are unavailable. Historical settings below are a dated reference, not current configuration or this entry's expiry.",
    );
  const quote = context.quote;
  const validQuote =
    quote != null &&
    typeof quote.rentByEntry === 'object' &&
    quote.rentByEntry !== null &&
    !Array.isArray(quote.rentByEntry) &&
    ledger(quote.pricedAtLedger) &&
    Number.isSafeInteger(quote.additionalLedgers) &&
    quote.additionalLedgers > 0;
  const rents: Record<string, Stroops> = {};
  if (validQuote) {
    for (const [key, entry] of Object.entries(scan.entries)) {
      const amount = quote.rentByEntry[key];
      if (
        typeof amount === 'string' &&
        /^(0|[1-9]\d*)$/.test(amount) &&
        quote.pricedAtLedger >= entry.observedAtLedger
      )
        rents[key] = amount;
    }
  }
  const cleanContext: StorageAdviceContext = {
    ...(validSettings
      ? {
          settings: {
            minTemporaryTtl: settings.minTemporaryTtl,
            minPersistentTtl: settings.minPersistentTtl,
            observedAtLedger: settings.observedAtLedger,
          },
        }
      : {}),
    ...(validQuote
      ? {
          quote: {
            rentByEntry: rents,
            pricedAtLedger: quote.pricedAtLedger,
            additionalLedgers: quote.additionalLedgers,
          },
        }
      : {}),
  };
  const findings: StorageAdvice[] = [];
  let unreadable = scan.issues.length > 0;
  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    if (
      entry.ttl.status !== 'known' ||
      !ledger(entry.observedAtLedger) ||
      !ledger(entry.ttl.endsAtLedger) ||
      !Number.isSafeInteger(entry.ttl.remainingLedgers) ||
      entry.ttl.remainingLedgers !== entry.ttl.endsAtLedger - entry.observedAtLedger ||
      scan.issues.some((i) => i.entryKey === entryKey)
    ) {
      unreadable = true;
      continue;
    }
    if (entry.kind === 'instance') continue;
    const base = {
      entryKey,
      knownConsumers: [...new Set(entry.contracts)],
      observedAtLedger: entry.observedAtLedger,
      ttl: { ...entry.ttl },
      currentRent:
        rents[entryKey] === undefined
          ? { status: 'unavailable' as const }
          : { status: 'quoted' as const, stroops: rents[entryKey] },
    };
    if (entry.kind === 'code') {
      findings.push({
        ...base,
        code: 'shared-code-dependency',
        action:
          'Monitor this code key once with its known consumers; checking their instances alone does not establish protection.',
        rationale:
          'Every contract built from the same Wasm uses this code entry. Other consumers may exist outside this scan; sharing is not duplicated storage or a measured saving.',
      });
    } else if (entry.kind === 'temporary') {
      findings.push({
        ...base,
        code: 'temporary-retention',
        benchmarkId: 'guinea-pig-a-2026-09-09',
        action:
          'Compare the observed TTL with intended retention. If data must survive expiry, evaluate persistent storage in contract source; otherwise permit deliberate expiry.',
        rationale:
          "Temporary state is deleted, not archived or restorable. The isolated 2026-09-06 experiment observed the final live ledger and absence at the next ledger; it does not measure this entry's deletion.",
      });
    } else if (entry.kind === 'persistent') {
      findings.push({
        ...base,
        code: 'durability-review',
        benchmarkId: 'guinea-pig-a-2026-09-09',
        action:
          'Only if this data is disposable or recomputable, evaluate temporary storage in contract source. Keep balances, required configuration and durable state persistent.',
        rationale:
          'Historical A rent was about 1.95x higher for persistent than temporary at equal encoded sizes. This is a measured comparison, not guaranteed savings or evidence of equal contents.',
      });
    }
  }
  if (unreadable)
    limitations.push(
      'Some requested entries are missing or unreadable; they receive no inferred retention or cost advice.',
    );
  if (findings.some((f) => f.currentRent.status === 'unavailable'))
    limitations.push(
      'Current rent is unavailable for some findings. Use --cost for quotes where supported; historical benchmark amounts are not per-entry quotes.',
    );
  if (findings.length === 0)
    limitations.push(
      'No supported recommendation for these observations; this does not mean the contract is fully optimized.',
    );
  return {
    scope: 'observed-keys-only',
    context: cleanContext,
    findings,
    limitations,
    evidence: STORAGE_ADVICE_EVIDENCE,
  };
}
