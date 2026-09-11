import { stroopsToXlm } from '@evergreen-stellar/core';
import type { Stroops } from '@evergreen-stellar/shared-types';

/**
 * Cost presentation (`W2-D9`).
 *
 * Two rules, both learned rather than assumed.
 *
 * **Lead with the total.** The fee fixture separates `rentFeeCharged` from the
 * non-refundable part, and that split is analytically valuable — it is what
 * produced the durability-not-size finding. It is not what the user is
 * deciding with. Someone funding a bot account wants to know what LEAVES THE
 * ACCOUNT. Rent is broken out underneath for whoever cares why.
 *
 * **Never print a precise-looking figure.** Simulated rent moved ~18% against a
 * real fee recorded one day earlier, because pricing varies with network state.
 * `0.0327 XLM` implies four significant figures from a method that cannot
 * support them — the same error as printing a bare instant for a projection
 * whose cadence has a band. So: two significant figures, an explicit "about",
 * and the provenance travelling with it.
 */

export interface CostLine {
  readonly totalStroops: Stroops;
  readonly rentStroops: Stroops;
  readonly otherStroops: Stroops;
  readonly entryCount: number;
  readonly additionalLedgers: number;
  readonly cappedEntryCount: number;
  readonly maxEntryTtl: number;
  readonly pricedAtLedger: number;
  /**
   * Rent per entry. The shared `code` entry routinely dominates the bill —
   * it holds the Wasm — so a total alone hides where the money goes, and
   * "which entry costs what" is what a funding decision actually turns on.
   */
  readonly rentByEntry: Readonly<Record<string, Stroops>>;
}

/**
 * Round to two significant figures and say "about".
 *
 * A number the method cannot support should not be printed as though it can.
 */
export function approximateXlm(stroops: Stroops): string {
  const exact = Number(stroopsToXlm(stroops));
  if (exact === 0) return '0 XLM';
  const magnitude = Math.floor(Math.log10(Math.abs(exact)));
  const factor = 10 ** (magnitude - 1);
  const rounded = Math.round(exact / factor) * factor;
  // Enough decimals to show two significant figures, never more.
  const decimals = Math.max(0, 1 - magnitude);
  return `about ${rounded.toFixed(decimals)} XLM`;
}

export function formatCost(cost: CostLine): string[] {
  const lines: string[] = [];
  const entries = `${cost.entryCount} entr${cost.entryCount === 1 ? 'y' : 'ies'}`;
  lines.push(
    `Cost to extend ${entries} by ${cost.additionalLedgers.toLocaleString()} more ledgers`,
  );
  // Total first: it is the number the funding decision is made with.
  lines.push(
    `  total   ${approximateXlm(cost.totalStroops)}  (${Number(cost.totalStroops).toLocaleString()} stroops) — what leaves the account`,
  );
  lines.push(
    `    rent  ${approximateXlm(cost.rentStroops)}  (${Number(cost.rentStroops).toLocaleString()} stroops)`,
  );
  lines.push(
    `    fees  ${approximateXlm(cost.otherStroops)}  (${Number(cost.otherStroops).toLocaleString()} stroops) — non-refundable resource + base fee`,
  );
  const rentEntries = Object.entries(cost.rentByEntry);
  if (rentEntries.length > 1) {
    const [topKey, topRent] = rentEntries.reduce((a, b) => (BigInt(b[1]) > BigInt(a[1]) ? b : a));
    const share = Number((BigInt(topRent) * 100n) / (BigInt(cost.rentStroops) || 1n));
    if (share >= 60) {
      lines.push('');
      lines.push(
        `  ${share}% of that rent is one entry (${topKey.slice(0, 10)}…). Code entries hold the`,
      );
      lines.push(
        '  Wasm and are usually the expensive one — and the one shared between contracts.',
      );
    }
  }
  lines.push('');
  lines.push(
    `  Priced by simulating against the network at ledger ${cost.pricedAtLedger.toLocaleString()}.`,
  );
  // The imprecision is stated, not implied by rounding alone.
  lines.push('  Rent pricing varies with network state — a quote taken on another day has');
  lines.push('  differed by ~18%. This is an estimate to budget against, not a quoted price.');
  if (cost.cappedEntryCount > 0) {
    // Silent capping would hand back less than was asked for while reporting
    // success — the same shortfall shape as passing a delta where a target belongs.
    lines.push('');
    lines.push(
      `  ⚠ ${cost.cappedEntryCount} entr${cost.cappedEntryCount === 1 ? 'y was' : 'ies were'} CAPPED at the operation maximum of ${(cost.maxEntryTtl - 1).toLocaleString()} ledgers`,
    );
    lines.push('    (~180 days). Those entries get less than requested; the price above reflects');
    lines.push('    the capped extension, not the request.');
  }
  lines.push('');
  lines.push('  Targets are computed from TTL read now; the ledger advances before submission,');
  lines.push('  so the achieved remaining TTL lands a few ledgers under the target.');
  return lines;
}
