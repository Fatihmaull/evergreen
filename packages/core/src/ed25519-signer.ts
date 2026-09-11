import { Keypair, Networks, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Signer } from '@evergreen-stellar/shared-types';
import { extensionKey } from './extend.js';

export interface ExtensionPolicy {
  readonly sourceAccount: string;
  readonly entryKey: string;
  readonly extendToLedgers: number;
  readonly expectedHash: string;
  readonly maxFeeStroops: string;
  readonly now?: () => number;
}
export function isValidPayerAccount(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value);
}
export function stroopBudget(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('Fee budget must be positive integer stroops');
  return BigInt(value);
}

/** Check the decoded envelope, not the caller's description of its contents. */
export function validateExtensionEnvelope(
  transactionXdr: string,
  policy: ExtensionPolicy,
): Transaction {
  const tx = TransactionBuilder.fromXDR(transactionXdr, Networks.TESTNET);
  if (
    !(tx instanceof Transaction) ||
    !StrKey.isValidEd25519PublicKey(policy.sourceAccount) ||
    tx.source !== policy.sourceAccount ||
    tx.signatures.length !== 0 ||
    tx.operations.length !== 1 ||
    tx.memo.type !== 'none' ||
    Buffer.from(tx.hash()).toString('hex') !== policy.expectedHash
  )
    throw new Error('Extension envelope does not match its approved identity');
  const op = tx.operations[0]!;
  const envelope = tx.toEnvelope();
  if (
    op.type !== 'extendFootprintTtl' ||
    op.source !== undefined ||
    op.extendTo !== policy.extendToLedgers ||
    !Number.isSafeInteger(op.extendTo) ||
    op.extendTo <= 0 ||
    envelope.type !== 'envelopeTypeTx' ||
    envelope.value.tx.ext.type !== 'sorobanData'
  )
    throw new Error('Only the selected TTL extension is permitted');
  const data = envelope.value.tx.ext.value;
  const footprint = data.resources.footprint;
  const key = extensionKey(policy.entryKey);
  if (
    !['contractData', 'contractCode'].includes(key.type) ||
    footprint.readWrite.length !== 0 ||
    footprint.readOnly.length !== 1 ||
    footprint.readOnly[0]!.toXDR('base64') !== policy.entryKey ||
    data.resourceFee < 0n ||
    BigInt(tx.fee) < data.resourceFee + 100n ||
    BigInt(tx.fee) > stroopBudget(policy.maxFeeStroops)
  )
    throw new Error('Extension footprint or fee is outside policy');
  const now = Math.floor((policy.now ?? (() => Date.now() / 1000))());
  if (
    !tx.timeBounds ||
    BigInt(tx.timeBounds.maxTime) <= BigInt(now) ||
    BigInt(tx.timeBounds.maxTime) > BigInt(now + 60) ||
    BigInt(tx.timeBounds.minTime) > BigInt(now) ||
    tx.extraSigners?.length ||
    tx.minAccountSequence !== undefined ||
    tx.ledgerBounds !== undefined
  )
    throw new Error('Extension validity bounds are outside policy');
  return tx;
}

/** Plain local key with software checks; not the W3 on-chain policy signer. */
export function createEd25519Signer(
  options: ExtensionPolicy & {
    readonly payer: string;
    readonly readSecret: () => string;
  },
): Signer {
  return {
    payer: options.payer,
    identity: { kind: 'ed25519', account: options.sourceAccount },
    async signExtendTTL(request) {
      if (request.networkPassphrase !== Networks.TESTNET)
        throw new Error('Only Testnet signing is permitted');
      const tx = validateExtensionEnvelope(request.transactionXdr, options);
      try {
        const key = Keypair.fromSecret(options.readSecret());
        if (key.publicKey() !== options.sourceAccount) throw new Error('Wrong key');
        tx.sign(key);
        return tx.toXDR();
      } catch {
        throw new Error('Unable to sign the validated extension');
      }
    },
  };
}
