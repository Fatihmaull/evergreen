import { rpc } from '@stellar/stellar-sdk';
import type { ScanResult, Stroops } from '@evergreen-stellar/shared-types';
import type { NetworkChoice } from './network.js';
import { readStateArchivalSettings, resolveExtendTarget } from './network-config.js';
import { createSimulatingQuoter } from './rent-quoter.js';
import { estimateRent } from './rent.js';

/**
 * What extending a scan's entries would cost, priced by simulation.
 *
 * Moved here from the CLI's `bin.ts` for `PH2-E1-07`, so the CLI's `--cost` and
 * the MCP server's `cost` tool price with one function rather than two copies.
 * The body is unchanged. It is a network adapter like `bin.ts`, so it is
 * excluded from unit coverage; what it prints is tested in `cli/test/cost.test.ts`.
 */
export interface ExtendPrice {
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
   * it holds the Wasm — so a total alone hides where the money goes.
   */
  readonly rentByEntry: Readonly<Record<string, Stroops>>;
}

/** Base inclusion fee per operation, added so the total is what actually leaves the account. */
const BASE_FEE_STROOPS = 100n;

/**
 * Price an extend by simulating it. Lives here rather than in `command.ts`
 * because it is the one part that touches the network — the command stays a
 * pure function of its dependencies, which is what makes it testable offline.
 *
 * The user asks for "N more ledgers". `extendTo` is an absolute target, so the
 * conversion happens HERE and never reaches the user's vocabulary. The ceiling
 * comes from the network, because the primer is explicit that state-archival
 * settings are configuration rather than constants to hardcode.
 */
export async function priceExtend(
  network: NetworkChoice,
  sourceAccountId: string | undefined,
  args: { scan: ScanResult; additionalLedgers: number },
): Promise<ExtendPrice> {
  // Simulation is a read, so it follows the chosen network (PH2-E1-03).
  const server = new rpc.Server(network.rpcUrl);
  const settings = await readStateArchivalSettings(server);
  const quoter = createSimulatingQuoter(server, {
    ...(sourceAccountId === undefined ? {} : { sourceAccountId }),
    networkPassphrase: network.passphrase,
  });

  // EACH entry gets its own target. `extendTo` is absolute, so entries with
  // different remaining TTL need different targets to receive the same
  // increment — a single shared target silently over-extends the entry with
  // least headroom, which is exactly what it must not do.
  let cappedEntryCount = 0;
  const targets: Record<string, number> = {};
  for (const [entryKey, entry] of Object.entries(args.scan.entries)) {
    if (entry.ttl.status !== 'known') continue;
    const resolved = resolveExtendTarget({
      currentRemainingLedgers: entry.ttl.remainingLedgers,
      additionalLedgers: args.additionalLedgers,
      maxEntryTtl: settings.maxEntryTtl,
    });
    if (resolved.wasCapped) cappedEntryCount += 1;
    targets[entryKey] = resolved.extendToLedgers;
  }

  const { estimate } = await estimateRent(args.scan, { extendToLedgers: targets }, quoter);
  const priced = Object.keys(estimate.estimatedRentStroopsByEntry);
  let resourceTotal = 0n;
  for (const entryKey of priced) {
    const [q] = await quoter.quoteDetailed({
      entryKeys: [entryKey],
      extendToLedgers: targets[entryKey]!,
    });
    resourceTotal += BigInt(q!.minResourceFeeStroops);
  }
  const rent = BigInt(estimate.totalEstimatedRentStroops);
  const total = resourceTotal + BASE_FEE_STROOPS * BigInt(priced.length);

  return {
    totalStroops: total.toString() as Stroops,
    rentStroops: rent.toString() as Stroops,
    otherStroops: (total - rent).toString() as Stroops,
    entryCount: priced.length,
    additionalLedgers: args.additionalLedgers,
    cappedEntryCount,
    maxEntryTtl: settings.maxEntryTtl,
    pricedAtLedger: settings.observedAtLedger,
    rentByEntry: estimate.estimatedRentStroopsByEntry,
  };
}
