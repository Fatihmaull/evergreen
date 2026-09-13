import { rpc, Networks } from '@stellar/stellar-sdk';
import console from 'node:console';
import { createRpcReader, runEngine } from '../core/dist/index.js';
const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 15000 });
if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw new Error('not testnet');
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
for (const [label, below, ids] of [
  ['A, default threshold (17,280)', 17_280, [A]],
  ['A, threshold raised above its TTL (1,500,000)', 1_500_000, [A]],
  ['A + B, threshold raised — B must be REFUSED', 1_500_000, [A, B]],
]) {
  const config = {
    network: { rpcUrl: 'x', networkPassphrase: Networks.TESTNET },
    defaults: { bumpWhenRemainingLedgersBelow: below, extendToLedgers: 500_000 },
    contracts: ids.map((id) => ({ id, payer: 'dev' })),
    payers: {},
  };
  const run = await runEngine(createRpcReader(server), config);
  console.log(`\n── ${label}`);
  console.log(`   mode=${run.mode}  liveness=${run.liveness.severity}`);
  for (const d of run.decisions) {
    console.log(`   ${d.action.toUpperCase().padEnd(6)} ${d.entryKey.slice(0, 12)}… ${d.reason.slice(0, 88)}`);
  }
}
