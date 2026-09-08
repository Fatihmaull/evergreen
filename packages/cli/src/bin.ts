#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { connectTestnet, scanInstances } from '@evergreen/core';
import { EXIT_ERROR, exitCodeFor, formatHuman } from './scan.js';

/** Default threshold: 17,280 ledgers ≈ 24h at ~5s per ledger. */
const DEFAULT_THRESHOLD_LEDGERS = 17_280;
const DEFAULT_RPC = 'https://soroban-testnet.stellar.org';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command !== 'scan' || args.length < 2) {
    console.error('usage: evergreen scan <contract-id> [--json]');
    console.error('\nReports remaining TTL for a contract instance on Stellar testnet.');
    return EXIT_ERROR;
  }

  const contractId = args[1] as string;
  const asJson = args.includes('--json');
  const rpcUrl = process.env.SOROBAN_RPC_URL ?? DEFAULT_RPC;

  // Refuses anything that is not testnet, by comparing the live passphrase
  // rather than trusting a URL that merely looks like testnet.
  const reader = await connectTestnet(rpcUrl);
  const result = await scanInstances(reader, [{ id: contractId }]);

  if (asJson) console.log(JSON.stringify(result, null, 2));
  else console.log(formatHuman(result, new Date()));

  return exitCodeFor(result, DEFAULT_THRESHOLD_LEDGERS);
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    // Never let a raw stack trace reach a user (docs/CONVENTIONS.md).
    console.error(`\n✖ ${err instanceof Error ? err.message : 'Unexpected failure'}`);
    process.exit(EXIT_ERROR);
  });
