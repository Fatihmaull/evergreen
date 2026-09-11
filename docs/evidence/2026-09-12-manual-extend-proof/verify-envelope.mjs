import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
const require = createRequire(new URL('../../../packages/cli/package.json', import.meta.url));
export const { TransactionBuilder, Transaction, Keypair, Networks } = require('@stellar/stellar-sdk');
export const payer = 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';
export const key = 'AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB';
export function verifyEnvelope(encoded, before, signed = false, now = Math.floor(Date.now()/1000)) {
  const tx = TransactionBuilder.fromXDR(encoded, Networks.TESTNET);
  assert(tx instanceof Transaction);
  assert.equal(tx.source, payer);
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.memo.type, 'none');
  const op = tx.operations[0];
  assert.equal(op.type, 'extendFootprintTtl');
  assert.equal(op.source, undefined);
  assert(Number.isSafeInteger(before.ledger) && Number.isSafeInteger(before.endsAt));
  assert(before.endsAt >= before.ledger);
  assert.equal(op.extendTo, before.endsAt - before.ledger + 1000);
  assert.equal(tx.toEnvelope().value.tx.ext.type, 'sorobanData');
  const data = tx.toEnvelope().value.tx.ext.value;
  assert.equal(data.resources.footprint.readWrite.length, 0);
  assert.deepEqual(data.resources.footprint.readOnly.map(k=>k.toXDR('base64')), [key]);
  assert(BigInt(tx.fee) > 0n && BigInt(tx.fee) <= 25000n);
  assert(BigInt(tx.timeBounds.maxTime) > BigInt(now));
  assert(BigInt(tx.timeBounds.maxTime) <= BigInt(now+60));
  assert(BigInt(tx.timeBounds.minTime) <= BigInt(now));
  assert.equal(tx.signatures.length, signed ? 1 : 0);
  if (signed) assert(Keypair.fromPublicKey(payer).verify(tx.hash(), tx.signatures[0].signature));
  return { hash:Buffer.from(tx.hash()).toString('hex'), sequence:tx.sequence,
    target:op.extendTo, fee:tx.fee, key, source:tx.source, signed };
}
