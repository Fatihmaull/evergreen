import {
  Account,
  Networks,
  Operation,
  SorobanDataBuilder,
  StrKey,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import type { PlannedExtension } from './extend.js';
import { extensionKey } from './extend.js';
import { validateExtensionEnvelope } from './ed25519-signer.js';

export interface ExtensionRpc {
  getNetwork(): Promise<{ passphrase: string }>;
  getAccount(address: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
  sendTransaction(tx: Transaction): Promise<{ status: string; hash: string }>;
  getTransaction(
    hash: string,
  ): Promise<{
    status: string;
    txHash?: string;
    ledger?: number;
    envelopeXdr?: xdr.TransactionEnvelope;
  }>;
}
export interface PreparedExtension {
  readonly entry: PlannedExtension;
  readonly sourceAccount: string;
  readonly transactionXdr: string;
  readonly transactionHash: string;
  readonly feeStroops: string;
  readonly simulatedAtLedger: number;
}

export async function prepareExtension(
  server: ExtensionRpc,
  entry: PlannedExtension,
  sourceAccount: string,
): Promise<PreparedExtension> {
  if (!StrKey.isValidEd25519PublicKey(sourceAccount) || entry.skip)
    throw new Error('Invalid extension payer or no-op');
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET)
    throw new Error('RPC is not Stellar Testnet');
  const account = await server.getAccount(sourceAccount);
  if (account.accountId() !== sourceAccount) throw new Error('RPC returned another payer');
  const tx = new TransactionBuilder(new Account(sourceAccount, account.sequenceNumber()), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.extendFootprintTtl({ extendTo: entry.extendToLedgers }))
    .setSorobanData(new SorobanDataBuilder().setReadOnly([extensionKey(entry.entryKey)]).build())
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (
    !rpc.Api.isSimulationSuccess(simulation) ||
    'restorePreamble' in simulation ||
    typeof simulation.minResourceFee !== 'string' ||
    !/^\d+$/.test(simulation.minResourceFee) ||
    !Number.isSafeInteger(simulation.latestLedger) ||
    simulation.latestLedger < entry.before.observedAtLedger ||
    simulation.latestLedger > entry.before.endsAtLedger ||
    simulation.transactionData.build().resourceFee !== BigInt(simulation.minResourceFee)
  )
    throw new Error('Extension simulation failed or returned invalid resources');
  const prepared = rpc.assembleTransaction(tx, simulation).build();
  const transactionXdr = prepared.toXDR();
  const transactionHash = Buffer.from(prepared.hash()).toString('hex');
  validateExtensionEnvelope(transactionXdr, {
    sourceAccount,
    entryKey: entry.entryKey,
    extendToLedgers: entry.extendToLedgers,
    expectedHash: transactionHash,
    maxFeeStroops: prepared.fee,
  });
  return {
    entry,
    sourceAccount,
    transactionXdr,
    transactionHash,
    feeStroops: prepared.fee,
    simulatedAtLedger: simulation.latestLedger,
  };
}

export type ExtensionConfirmation =
  | { readonly status: 'unconfirmed' }
  | { readonly status: 'failed' }
  | { readonly status: 'confirmed'; readonly ledger: number };

export async function confirmExtension(
  server: Pick<ExtensionRpc, 'getTransaction'>,
  hash: string,
  options: {
    readonly attempts?: number;
    readonly sleep?: () => Promise<void>;
  } = {},
): Promise<ExtensionConfirmation> {
  const attempts = options.attempts ?? 12;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60)
    throw new Error('Invalid confirmation bound');
  for (let i = 0; i < attempts; i++) {
    const response = await server.getTransaction(hash);
    if (response.txHash !== hash) throw new Error('Transaction confirmation hash mismatch');
    if (response.status === 'SUCCESS' || response.status === 'FAILED') {
      // SDK 17 getTransaction() fills txHash from the request, not the response.
      // Bind the result to the returned envelope rather than accepting that echo.
      if (!response.envelopeXdr) throw new Error('Missing transaction confirmation envelope');
      const transaction = TransactionBuilder.fromXDR(
        response.envelopeXdr.toXDR('base64'),
        Networks.TESTNET,
      );
      if (Buffer.from(transaction.hash()).toString('hex') !== hash)
        throw new Error('Transaction confirmation envelope hash mismatch');
    }
    if (response.status === 'FAILED') return { status: 'failed' };
    if (response.status === 'SUCCESS') {
      if (!Number.isSafeInteger(response.ledger) || response.ledger! <= 0)
        throw new Error('Invalid inclusion ledger');
      return { status: 'confirmed', ledger: response.ledger! };
    }
    if (response.status !== 'NOT_FOUND') throw new Error('Unknown transaction status');
    if (i + 1 < attempts)
      await (options.sleep ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1000))))();
  }
  return { status: 'unconfirmed' };
}

export async function submitExtension(
  server: ExtensionRpc,
  prepared: PreparedExtension,
  signedXdr: string,
): Promise<{ status: string; hash: string }> {
  const signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  if (
    !(signed instanceof Transaction) ||
    signed.source !== prepared.sourceAccount ||
    Buffer.from(signed.hash()).toString('hex') !== prepared.transactionHash ||
    signed.signatures.length !== 1
  )
    throw new Error('Signed envelope differs from the prepared transaction');
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET)
    throw new Error('RPC is not Stellar Testnet');
  const response = await server.sendTransaction(signed);
  if (response.hash !== prepared.transactionHash) throw new Error('Submission hash mismatch');
  return response;
}
