import {
  extensionKey,
  instanceKey,
  isValidContractId,
  isValidPayerAccount,
} from '@evergreen-stellar/core';
import type { BumpRecord, SignerIdentity, Stroops } from '@evergreen-stellar/shared-types';

export class NotificationRecordError extends Error {
  constructor() {
    super(
      'Invalid notification record. Supply one complete BumpRecord; unknown fields and contradictory outcomes are refused.',
    );
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new NotificationRecordError();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new NotificationRecordError();
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new NotificationRecordError();
  return value;
}
function ledger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff)
    throw new NotificationRecordError();
  return value;
}
function observation(value: unknown) {
  const v = object(value);
  keys(v, ['observedAtLedger', 'endsAtLedger']);
  return { observedAtLedger: ledger(v.observedAtLedger), endsAtLedger: ledger(v.endsAtLedger) };
}
function signer(value: unknown): SignerIdentity {
  const v = object(value);
  keys(v, ['kind', 'account']);
  if (
    (v.kind !== 'ed25519' && v.kind !== 'policy') ||
    typeof v.account !== 'string' ||
    !isValidPayerAccount(v.account)
  )
    throw new NotificationRecordError();
  return { kind: v.kind, account: v.account };
}

/** Structural validation only: a supplied file is not independently verified chain evidence. */
export function parseNotificationRecord(raw: string): BumpRecord {
  try {
    if (raw.length > 1_048_576) throw new NotificationRecordError();
    const v = object(JSON.parse(raw));
    keys(v, [
      'entryKey',
      'contracts',
      'payer',
      'reason',
      'before',
      'extendToLedgers',
      'recordedAt',
      'outcome',
      'mode',
      'signer',
      'transactionHash',
      'after',
      'error',
      'paidFeeStroops',
    ]);
    const entryKey = text(v.entryKey);
    const key = extensionKey(entryKey);
    if (!['contractData', 'contractCode'].includes(key.type)) throw new NotificationRecordError();
    if (
      !Array.isArray(v.contracts) ||
      !v.contracts.length ||
      v.contracts.some((id) => typeof id !== 'string' || !isValidContractId(id)) ||
      new Set(v.contracts).size !== v.contracts.length
    )
      throw new NotificationRecordError();
    const contracts = v.contracts as string[];
    // ContractData names its owner in the key; only ContractCode can be shared.
    if (key.type === 'contractData') {
      if (contracts.length !== 1) throw new NotificationRecordError();
      const ownerKey = extensionKey(instanceKey(contracts[0]!));
      if (
        ownerKey.type !== 'contractData' ||
        key.contractData.contract.toXDR('base64') !== ownerKey.contractData.contract.toXDR('base64')
      )
        throw new NotificationRecordError();
    }
    const recordedAt = text(v.recordedAt);
    if (
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(recordedAt) ||
      !Number.isFinite(Date.parse(recordedAt))
    )
      throw new NotificationRecordError();
    const extendToLedgers = ledger(v.extendToLedgers);
    if (!extendToLedgers) throw new NotificationRecordError();
    const base = {
      entryKey,
      contracts: [...contracts],
      payer: text(v.payer),
      reason: text(v.reason),
      before: observation(v.before),
      extendToLedgers,
      recordedAt,
    };
    const identity = v.signer === undefined ? undefined : signer(v.signer);
    const hash = v.transactionHash === undefined ? undefined : text(v.transactionHash);
    if (hash !== undefined && !/^[0-9a-f]{64}$/.test(hash)) throw new NotificationRecordError();
    if (v.mode !== 'dry-run' && v.mode !== 'live') throw new NotificationRecordError();
    if (v.outcome !== 'succeeded' && (v.after !== undefined || v.paidFeeStroops !== undefined))
      throw new NotificationRecordError();
    if (v.outcome !== 'failed' && v.error !== undefined) throw new NotificationRecordError();
    if (v.mode === 'dry-run' && hash !== undefined) throw new NotificationRecordError();
    if (v.outcome === 'simulated' && v.mode === 'dry-run')
      return {
        ...base,
        mode: 'dry-run',
        outcome: 'simulated',
        ...(identity ? { signer: identity } : {}),
      };
    if (v.outcome === 'failed') {
      const e = object(v.error);
      keys(e, ['code', 'message']);
      const failure = {
        ...base,
        outcome: 'failed' as const,
        error: { code: text(e.code), message: text(e.message) },
        ...(identity ? { signer: identity } : {}),
      };
      return v.mode === 'dry-run'
        ? { ...failure, mode: 'dry-run' }
        : { ...failure, mode: 'live', ...(hash ? { transactionHash: hash } : {}) };
    }
    if (v.mode !== 'live' || !identity || !hash) throw new NotificationRecordError();
    if (v.outcome === 'submitted')
      return {
        ...base,
        mode: 'live',
        outcome: 'submitted',
        signer: identity,
        transactionHash: hash,
      };
    if (v.outcome === 'succeeded') {
      const after = observation(v.after);
      if (
        after.observedAtLedger < base.before.observedAtLedger ||
        after.endsAtLedger <= base.before.endsAtLedger
      )
        throw new NotificationRecordError();
      const fee = v.paidFeeStroops === undefined ? undefined : text(v.paidFeeStroops);
      if (fee !== undefined && !/^(0|[1-9]\d*)$/.test(fee)) throw new NotificationRecordError();
      return {
        ...base,
        mode: 'live',
        outcome: 'succeeded',
        signer: identity,
        transactionHash: hash,
        after,
        ...(fee === undefined ? {} : { paidFeeStroops: fee as Stroops }),
      };
    }
    throw new NotificationRecordError();
  } catch {
    // DELIBERATE CATCH-ALL — reviewed 2026-09-17, keep as-is.
    // Deliberately collapses an unexpected fault into the same typed error the
    // block throws on purpose. Callers branch on the type, never on a message, so
    // there is no diagnostic here for an operator to lose.
    throw new NotificationRecordError();
  }
}
