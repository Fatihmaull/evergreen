// W1-D5-03: read-only runtime/scheduler probe; not the W3 auto-bump engine.
import console from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Contract, Networks, rpc } from '@stellar/stellar-sdk';

export const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org/';
export const CONTRACT_ID = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const instanceKey = new Contract(CONTRACT_ID).getFootprint();

/** Verify SDK connectivity and a live A instance, using the same response's ledger. */
export async function runSchedulerSmoke(server) {
  const network = await server.getNetwork();
  if (network?.passphrase !== Networks.TESTNET) {
    throw new Error('Expected the Stellar Testnet passphrase; refusing further reads');
  }

  const result = await server.getLedgerEntries(instanceKey);
  if (!Number.isSafeInteger(result?.latestLedger) || result.latestLedger < 1) {
    throw new Error('Invalid getLedgerEntries latestLedger');
  }
  if (!Array.isArray(result.entries) || result.entries.length !== 1) {
    throw new Error('Expected exactly one live guinea-pig A instance entry');
  }
  const entry = result.entries[0];
  if (entry?.key?.toXdr?.('base64') !== instanceKey.toXdr('base64')) {
    throw new Error('RPC returned an unexpected ledger key');
  }
  if (!Number.isSafeInteger(entry.liveUntilLedgerSeq) || entry.liveUntilLedgerSeq < 1) {
    throw new Error('Instance entry is missing a valid liveUntilLedgerSeq');
  }
  const remainingLedgers = entry.liveUntilLedgerSeq - result.latestLedger;
  if (remainingLedgers < 0) {
    throw new Error('RPC returned an instance past its final live ledger');
  }

  return {
    network: 'Testnet',
    protocolVersion: network.protocolVersion,
    contractId: CONTRACT_ID,
    latestLedger: result.latestLedger,
    liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
    remainingLedgers,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const started = Date.now();
  const context = {
    task: 'W1-D5-03',
    trigger: process.env.GITHUB_EVENT_NAME ?? 'local',
    runId: process.env.GITHUB_RUN_ID ?? null,
    startedAt: new Date(started).toISOString(),
    nodeVersion: process.version,
    rpcUrl: TESTNET_RPC_URL,
  };
  console.log(JSON.stringify({ ...context, status: 'started' }));
  try {
    const server = new rpc.Server(TESTNET_RPC_URL);
    // SDK 17's fetch transport reads defaults; its constructor ignores opts.timeout.
    server.httpClient.defaults.timeout = 10_000;
    const result = await runSchedulerSmoke(server);
    console.log(
      JSON.stringify({ ...context, ...result, status: 'ok', durationMs: Date.now() - started }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ...context,
        status: 'error',
        error: typeof error?.message === 'string' ? error.message : String(error),
        durationMs: Date.now() - started,
      }),
    );
    process.exitCode = 1;
  }
}
