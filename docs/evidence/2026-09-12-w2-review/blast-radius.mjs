/**
 * What the CLI's own advice requires, and what the CLI cannot do (`W2-D10-01c`).
 *
 * `evergreen scan` prints "pass them together to see the real blast radius" and
 * accepts exactly one contract ID. `scanContracts` has taken an array all along.
 *
 * To run: copy into `packages/cli/` first — the repo root cannot resolve
 * workspace dependencies. That inconvenience IS the finding.
 */
import console from 'node:console';
import { rpc, Networks } from '@stellar/stellar-sdk';
import { createRpcReader, scanContracts, assessEntry, coverageIssues } from '../core/dist/index.js';
const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 15000 });
if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw new Error('not testnet');
const ids = [
  'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L',
  'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ',
  'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL',
];
const scan = await scanContracts(
  createRpcReader(server),
  ids.map((id) => ({ contract: { id }, dataKeys: [] })),
);
for (const [key, e] of Object.entries(scan.entries)) {
  const a = assessEntry(e, 120960);
  console.log(`${e.kind.padEnd(10)} ${key.slice(0,14)}…  consumers=${e.contracts.length}  sharing=${a.sharingStatus}  blastRadiusAtLeast=${a.blastRadiusAtLeast}  health=${a.health}`);
  if (e.ttl.status === 'known') console.log(`           remaining ${e.ttl.remainingLedgers.toLocaleString()} ledgers, ends at ${e.ttl.endsAtLedger.toLocaleString()}`);
}
console.log('\nissues:', coverageIssues(scan).map(i=>i.kind).join(', ') || '(none)');
