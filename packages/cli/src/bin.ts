#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { rpc, Networks } from '@stellar/stellar-sdk';
import {
  connectTestnet,
  createSimulatingQuoter,
  estimateRent,
  readStateArchivalSettings,
  resolveExtendTarget,
} from '@evergreen-stellar/core';
import type { ScanResult, Stroops } from '@evergreen-stellar/shared-types';
import type { CostLine } from './cost.js';
import { runCli } from './command.js';
import { EXIT_ERROR } from './scan.js';

const DEFAULT_RPC = 'https://soroban-testnet.stellar.org';
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
async function priceExtend(
  rpcUrl: string,
  sourceAccountId: string,
  args: { scan: ScanResult; additionalLedgers: number },
): Promise<CostLine> {
  const server = new rpc.Server(rpcUrl);
  const settings = await readStateArchivalSettings(server);
  const quoter = createSimulatingQuoter(server, {
    sourceAccountId,
    networkPassphrase: Networks.TESTNET,
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

async function main(): Promise<number> {
  const rpcUrl = process.env.SOROBAN_RPC_URL ?? DEFAULT_RPC;
  // Colour only for a human at a terminal. Piped output, CI logs and captured
  // evidence stay clean, and NO_COLOR is honoured (no-color.org). The health
  // WORD prints either way — colour is never the only carrier of the state.
  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  const output = await runCli(process.argv.slice(2), {
    connect: () => connectTestnet(rpcUrl),
    readKeysFile: (path) => readFile(path, 'utf8'),
    now: () => new Date(),
    color,
    // Public key only; simulation never signs. Falls back to the well-known
    // testnet identity so `--cost` works without configuration.
    priceExtend: (args) =>
      priceExtend(
        rpcUrl,
        process.env.EVERGREEN_SOURCE_ACCOUNT ??
          'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE',
        args,
      ),
  });
  if (output.stdout) console.log(output.stdout);
  if (output.stderr) console.error(output.stderr);
  return output.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch(() => {
    // Never let a raw stack trace reach a user (docs/CONVENTIONS.md).
    console.error('\n✖ Unexpected scan failure.');
    process.exit(EXIT_ERROR);
  });
