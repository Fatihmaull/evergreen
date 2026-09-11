import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createEd25519Signer } from '../src/ed25519-signer.js';
import { instanceKey } from '../src/rpc.js';

const key = Keypair.random();
const entryKey = instanceKey('CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L');
function transaction(
  operation = Operation.extendFootprintTtl({ extendTo: 120 }),
  writable = false,
) {
  const data = new SorobanDataBuilder().setResourceFee('500');
  if (writable) data.setReadWrite([xdr.LedgerKey.fromXDR(entryKey, 'base64')]);
  else data.setReadOnly([xdr.LedgerKey.fromXDR(entryKey, 'base64')]);
  return new TransactionBuilder(new Account(key.publicKey(), '12'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setSorobanData(data.build())
    .setTimeout(60)
    .build();
}
function setup(tx = transaction(), cap = '600') {
  const readSecret = vi.fn(() => key.secret());
  const signer = createEd25519Signer({
    payer: 'manual',
    sourceAccount: key.publicKey(),
    entryKey,
    extendToLedgers: 120,
    expectedHash: Buffer.from(tx.hash()).toString('hex'),
    maxFeeStroops: cap,
    readSecret,
  });
  return {
    signer,
    readSecret,
    request: { networkPassphrase: Networks.TESTNET, transactionXdr: tx.toXDR() },
  };
}
describe('local extension signer', () => {
  it('rejects a second operation even when both are extensions', async () => {
    const tx = TransactionBuilder.cloneFrom(transaction())
      .addOperation(Operation.extendFootprintTtl({ extendTo: 120 }))
      .build();
    const item = setup(tx);
    await expect(item.signer.signExtendTTL(item.request)).rejects.toThrow();
    expect(item.readSecret).not.toHaveBeenCalled();
  });
  it('rejects an envelope with a different read-only key', async () => {
    const other = instanceKey('CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ');
    const tx = TransactionBuilder.cloneFrom(transaction(), {
      sorobanData: new SorobanDataBuilder()
        .setReadOnly([xdr.LedgerKey.fromXDR(other, 'base64')])
        .setResourceFee('500')
        .build(),
    }).build();
    const item = setup(tx);
    await expect(item.signer.signExtendTTL(item.request)).rejects.toThrow();
    expect(item.readSecret).not.toHaveBeenCalled();
  });
  it('rejects expired envelopes without asking for a secret', async () => {
    const tx = transaction();
    const readSecret = vi.fn(() => key.secret());
    const signer = createEd25519Signer({
      payer: 'manual',
      sourceAccount: key.publicKey(),
      entryKey,
      extendToLedgers: 120,
      expectedHash: Buffer.from(tx.hash()).toString('hex'),
      maxFeeStroops: '600',
      readSecret,
      now: () => Date.now() / 1000 + 120,
    });
    await expect(
      signer.signExtendTTL({ networkPassphrase: Networks.TESTNET, transactionXdr: tx.toXDR() }),
    ).rejects.toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });
  it('signs a validated envelope with the matching key', async () => {
    const { signer, request } = setup();
    const signed = TransactionBuilder.fromXDR(
      await signer.signExtendTTL(request),
      Networks.TESTNET,
    );
    expect(signed.signatures).toHaveLength(1);
    expect(key.verify(signed.hash(), signed.signatures[0]!.signature.value)).toBe(true);
  });
  it.each([
    Operation.payment({ destination: key.publicKey(), asset: Asset.native(), amount: '1' }),
    Operation.restoreFootprint({}),
    Operation.extendFootprintTtl({ extendTo: 121 }),
    Operation.extendFootprintTtl({ extendTo: 120, source: Keypair.random().publicKey() }),
  ])('rejects forbidden or changed operations before reading secret', async (op) => {
    const { signer, request, readSecret } = setup(transaction(op));
    await expect(signer.signExtendTTL(request)).rejects.toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });
  it('rejects writable footprint, fee over cap and altered network', async () => {
    for (const item of [setup(transaction(undefined, true)), setup(transaction(), '599')]) {
      await expect(item.signer.signExtendTTL(item.request)).rejects.toThrow();
      expect(item.readSecret).not.toHaveBeenCalled();
    }
    const item = setup();
    await expect(
      item.signer.signExtendTTL({
        ...item.request,
        networkPassphrase: Networks.PUBLIC as typeof Networks.TESTNET,
      }),
    ).rejects.toThrow();
    expect(item.readSecret).not.toHaveBeenCalled();
  });
  it('rejects pre-signed envelopes', async () => {
    const tx = transaction();
    tx.sign(key);
    const item = setup(tx);
    await expect(item.signer.signExtendTTL(item.request)).rejects.toThrow();
    expect(item.readSecret).not.toHaveBeenCalled();
  });
  it('sanitizes secret-provider errors and mismatched key identity', async () => {
    const { request } = setup();
    for (const readSecret of [
      () => {
        throw new Error('PRIVATE MATERIAL');
      },
      () => Keypair.random().secret(),
    ]) {
      const signer = createEd25519Signer({
        payer: 'manual',
        sourceAccount: key.publicKey(),
        entryKey,
        extendToLedgers: 120,
        expectedHash: Buffer.from(
          TransactionBuilder.fromXDR(request.transactionXdr, Networks.TESTNET).hash(),
        ).toString('hex'),
        maxFeeStroops: '600',
        readSecret,
      });
      await expect(signer.signExtendTTL(request)).rejects.toThrow(
        'Unable to sign the validated extension',
      );
    }
  });
});
