import console from 'node:console';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyEvidenceIntegrity } from '../../scripts/verify-evidence-integrity.mjs';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
const root = new globalThis.URL(
  '../../docs/evidence/2026-09-15-policy-feasibility/',
  import.meta.url,
).pathname;
verifyEvidenceIntegrity(root);
const r = JSON.parse(readFileSync(root + 'recorded-extension.json')).result;
const real = TransactionBuilder.fromXDR(r.envelopeXdr, Networks.TESTNET);
assert.equal(r.status, 'SUCCESS');
assert.equal(real.operations.length, 1);
assert.equal(real.operations[0].type, 'extendFootprintTtl');
const op = real.toEnvelope().v1.tx.operations[0].body;
assert.equal(op.type, 'extendFootprintTtl');
assert.deepEqual(Object.keys(op.value).sort(), ['ext', 'extendTo']);
const ephemeral = Keypair.random(),
  destination = Keypair.random().publicKey();
const make = (operation) =>
  new TransactionBuilder(new Account(ephemeral.publicKey(), '0'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();
const ttl = make(Operation.extendFootprintTtl({ extendTo: 100000 }));
ttl.sign(ephemeral);
const payment = make(
  Operation.payment({ destination, asset: Asset.native(), amount: '0.0000001' }),
);
payment.sign(ephemeral);
assert(ephemeral.verify(ttl.hash(), ttl.signatures[0].signature));
assert(ephemeral.verify(payment.hash(), payment.signatures[0].signature));
let cSourceRejected = false;
try {
  make(
    Operation.extendFootprintTtl({
      extendTo: 100000,
      source: 'CA55NQWVWCG2W5HXZVOU7QZRAGMPDVOJG26BJBIIL2GD76AU5IN455Y7',
    }),
  );
} catch {
  cSourceRejected = true;
}
assert(cSourceRejected);
const out = {
  recordedExtension: {
    hash: Buffer.from(real.hash()).toString('hex'),
    source: real.source,
    operation: op.type,
    operationFields: Object.keys(op.value),
    status: r.status,
  },
  offlineChecks: {
    realExtensionHasNoSorobanAuthSlot: true,
    sameUnrestrictedEphemeralKeySignsTtlAndPayment: true,
    contractAddressRejectedAsOperationSource: true,
  },
  limits:
    'Ephemeral signatures only: no payment submitted, no funded-account thresholds tested, no provider runtime executed. Policy hook reachability is established by pinned protocol/provider source, not these signatures alone.',
};
assert.deepEqual(out, JSON.parse(readFileSync(root + 'offline-result.json')));
console.log(JSON.stringify(out, null, 2));
