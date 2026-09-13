/** Test-only global fetch replacement: never falls through to a real network. */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
const fixture = JSON.parse(
  readFileSync(
    new globalThis.URL(
      '../../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
      import.meta.url,
    ),
    'utf8',
  ),
).result;
const setting = JSON.parse(
  readFileSync(
    new globalThis.URL(
      '../../../core/test/fixtures/state-archival-settings-2026-09-05.json',
      import.meta.url,
    ),
    'utf8',
  ),
).result.entries[0];
const account = JSON.parse(
  readFileSync(
    new globalThis.URL(
      '../../../../docs/evidence/2026-09-12-manual-extend-proof/simulation/06-getLedgerEntries-response.json',
      import.meta.url,
    ),
    'utf8',
  ),
).result.entries[0];
const rows = [
  ...fixture.entries.map((e, i) => ({
    ...e,
    liveUntilLedgerSeq: fixture.latestLedger + (i === 1 ? 5000 : 50),
  })),
  setting,
  account,
];
const environment = process.env;
process.env = new Proxy(environment, {
  get(target, key) {
    if (key === 'ARTIFACT_SEED') throw new Error('Simulation attempted secret access');
    return Reflect.get(target, key);
  },
});
globalThis.fetch = async (_input, options) => {
  const request = JSON.parse(options.body);
  let result;
  switch (request.method) {
    case 'getNetwork':
      result = { passphrase: Networks.TESTNET, protocolVersion: 23 };
      break;
    case 'getLedgerEntries':
      result = {
        latestLedger: fixture.latestLedger,
        entries: rows.filter((e) => request.params.keys.includes(e.key)),
      };
      break;
    case 'simulateTransaction': {
      const tx = TransactionBuilder.fromXDR(request.params.transaction, Networks.TESTNET);
      const env = tx.toEnvelope();
      if (env.type !== 'envelopeTypeTx' || env.value.tx.ext.type !== 'sorobanData')
        throw new Error('Invalid fixture request');
      result = {
        latestLedger: fixture.latestLedger,
        minResourceFee: '500',
        events: [],
        transactionData: new SorobanDataBuilder()
          .setReadOnly(env.value.tx.ext.value.resources.footprint.readOnly)
          .setResourceFee('500')
          .build()
          .toXDR('base64'),
      };
      break;
    }
    default:
      throw new Error(`Unexpected RPC method in offline artifact check: ${request.method}`);
  }
  return new globalThis.Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
    headers: { 'content-type': 'application/json' },
  });
};
