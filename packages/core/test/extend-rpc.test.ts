import {
  Account,
  Keypair,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { instanceKey } from '../src/rpc.js';
import { prepareExtension, confirmExtension, submitExtension } from '../src/extend-rpc.js';

const SOURCE = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';
const ENTRY = {
  entryKey: instanceKey('CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'),
  kind: 'instance' as const,
  contracts: ['CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'],
  before: { observedAtLedger: 1000, endsAtLedger: 1100 },
  extendToLedgers: 120,
  wasCapped: false,
  skip: false,
};
function fakeServer() {
  return {
    getNetwork: vi.fn(async () => ({ passphrase: Networks.TESTNET })),
    getAccount: vi.fn(async () => new Account(SOURCE, '12')),
    simulateTransaction: vi.fn(async () => ({
      _parsed: true,
      id: '1',
      latestLedger: 1001,
      events: [],
      minResourceFee: '500',
      transactionData: new SorobanDataBuilder()
        .setReadOnly([xdr.LedgerKey.fromXDR(ENTRY.entryKey, 'base64')])
        .setResourceFee('500'),
    })),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'a'.repeat(64) })),
    getTransaction: vi.fn(async () => ({ status: 'NOT_FOUND', txHash: 'a'.repeat(64) })),
  };
}
describe('extension RPC envelope', () => {
  it('refuses a selection that expired before simulation completed', async () => {
    const server = fakeServer();
    const value = await server.simulateTransaction();
    server.simulateTransaction.mockResolvedValue({ ...value, latestLedger: 1101 });
    await expect(prepareExtension(server, ENTRY, SOURCE)).rejects.toThrow();
  });
  it('sends exactly the signed prepared envelope and checks the returned hash', async () => {
    const server = fakeServer();
    const key = Keypair.random();
    server.getAccount.mockResolvedValue(new Account(key.publicKey(), '12'));
    const p = await prepareExtension(server, ENTRY, key.publicKey());
    const tx = TransactionBuilder.fromXDR(p.transactionXdr, Networks.TESTNET);
    tx.sign(key);
    server.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: p.transactionHash });
    expect(await submitExtension(server, p, tx.toXDR())).toEqual({
      status: 'PENDING',
      hash: p.transactionHash,
    });
    expect(server.sendTransaction).toHaveBeenCalledTimes(1);
    server.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'bad' });
    await expect(submitExtension(server, p, tx.toXDR())).rejects.toThrow('hash mismatch');
  });
  it('assembles the actual one-key, one-target transaction and complete fee', async () => {
    const server = fakeServer();
    const p = await prepareExtension(server, ENTRY, SOURCE);
    const tx = TransactionBuilder.fromXDR(p.transactionXdr, Networks.TESTNET);
    expect(tx.operations).toEqual([{ type: 'extendFootprintTtl', extendTo: 120 }]);
    expect(tx.fee).toBe('600');
    expect(p.feeStroops).toBe('600');
    expect(p.transactionHash).toBe(Buffer.from(tx.hash()).toString('hex'));
    expect(tx.signatures).toEqual([]);
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });
  it('refuses a wrong network before querying accounts', async () => {
    const server = fakeServer();
    server.getNetwork.mockResolvedValue({ passphrase: Networks.PUBLIC });
    await expect(prepareExtension(server, ENTRY, SOURCE)).rejects.toThrow();
    expect(server.getAccount).not.toHaveBeenCalled();
  });
  it.each(['', '-1', '1.1', 'secret'])('refuses malformed resource fees %s', async (fee) => {
    const server = fakeServer();
    const value = await server.simulateTransaction();
    server.simulateTransaction.mockResolvedValue({ ...value, minResourceFee: fee });
    await expect(prepareExtension(server, ENTRY, SOURCE)).rejects.toThrow();
  });
  it('refuses simulation errors and altered read-write footprint', async () => {
    const server = fakeServer();
    const value = await server.simulateTransaction();
    server.simulateTransaction.mockResolvedValue({
      ...value,
      transactionData: new SorobanDataBuilder()
        .setReadWrite([xdr.LedgerKey.fromXDR(ENTRY.entryKey, 'base64')])
        .setResourceFee('500'),
    });
    await expect(prepareExtension(server, ENTRY, SOURCE)).rejects.toThrow();
  });
  it('polls boundedly and never resends NOT_FOUND', async () => {
    const server = fakeServer();
    const sleep = vi.fn(async () => {});
    expect(await confirmExtension(server, 'a'.repeat(64), { attempts: 2, sleep })).toEqual({
      status: 'unconfirmed',
    });
    expect(server.getTransaction).toHaveBeenCalledTimes(2);
    expect(server.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects a confirmation for a different hash', async () => {
    const server = fakeServer();
    server.getTransaction.mockResolvedValue({ status: 'SUCCESS', txHash: 'b'.repeat(64) });
    await expect(
      confirmExtension(server, 'a'.repeat(64), { attempts: 1, sleep: async () => {} }),
    ).rejects.toThrow();
  });
});
