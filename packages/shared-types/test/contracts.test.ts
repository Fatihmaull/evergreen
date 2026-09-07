import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  BumpDecision,
  BumpRecord,
  LedgerEntryTTL,
  NotificationChannel,
  ScanResult,
  Signer,
} from '../src/index.js';
import {
  configExample,
  contractA,
  multiPayerConfig,
  recordedScan,
  secondContract,
  sharedKey,
  sharedScan,
  successfulBump,
} from './examples.js';

function withoutNotes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNotes);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith('_'))
        .map(([key, item]) => [key, withoutNotes(item)]),
    );
  }
  return value;
}

describe('shared domain contracts', () => {
  it('represents the four recorded Testnet entry kinds using the same-response ledger', () => {
    expect(Object.values(recordedScan.entries).map((entry) => entry.kind)).toEqual([
      'instance',
      'code',
      'persistent',
      'temporary',
    ]);
    expect(Object.values(recordedScan.entries).map((entry) => entry.ttl)).toEqual([
      { status: 'known', endsAtLedger: 4633568, remainingLedgers: 120927 },
      { status: 'known', endsAtLedger: 4633567, remainingLedgers: 120926 },
      { status: 'known', endsAtLedger: 4633569, remainingLedgers: 120928 },
      { status: 'known', endsAtLedger: 4513329, remainingLedgers: 688 },
    ]);
  });

  it('represents a shared code entry once, with two consumers and one rent amount', () => {
    expect(Object.keys(sharedScan.entries)).toEqual([sharedKey]);
    expect(sharedScan.entries[sharedKey]?.contracts).toEqual([contractA, secondContract]);
    expect(Object.keys(sharedScan.rentEstimate.estimatedRentStroopsByEntry)).toEqual([sharedKey]);
    expect(JSON.parse(JSON.stringify(sharedScan))).toEqual(sharedScan);
    expect(BigInt(sharedScan.rentEstimate.totalEstimatedRentStroops)).toBe(9007199254740993n);
  });

  it('keeps unknown TTL and absent entries separate from a known final live ledger', () => {
    const unknown: LedgerEntryTTL = {
      kind: 'persistent',
      endBehavior: 'archived',
      contracts: [contractA],
      observedAtLedger: 100,
      ttl: { status: 'unavailable' },
    };
    const partial: ScanResult = {
      network: 'testnet',
      contracts: [{ id: contractA }],
      entries: { [sharedKey]: unknown },
      issues: [
        { kind: 'entry-not-found', contracts: [contractA], message: 'Key absent from response' },
      ],
    };
    expect(partial.entries[sharedKey]?.ttl).not.toHaveProperty('remainingLedgers');
    expect(partial).not.toHaveProperty('rentEstimate');
    expect(sharedScan.entries[sharedKey]?.ttl).toEqual({
      status: 'known',
      endsAtLedger: 100,
      remainingLedgers: 0,
    });
    const nextLedger: LedgerEntryTTL = {
      kind: 'temporary',
      endBehavior: 'deleted',
      contracts: [contractA],
      observedAtLedger: 101,
      ttl: { status: 'known', endsAtLedger: 100, remainingLedgers: -1 },
    };
    expect(nextLedger.endBehavior).toBe('deleted');
  });

  it('keeps the shipped JSON config aligned with its compiler-checked example', () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL('../../../evergreen.config.example.json', import.meta.url), 'utf8'),
    );
    expect(withoutNotes(json)).toEqual(configExample);
    expect(configExample.mode).toBe('dry-run');
    expect(multiPayerConfig.contracts.map((contract) => contract.payer)).toEqual([
      'first',
      'second',
      'first',
    ]);
    expect(Object.keys(multiPayerConfig.payers)).toEqual(['first', 'second']);
  });

  it('can skip an unresolved shared payer without inventing a payer or extension', () => {
    const decision: BumpDecision = {
      action: 'skip',
      entryKey: sharedKey,
      contracts: [contractA, secondContract],
      reason: 'Shared entry has multiple payer candidates; resolution required',
    };
    expect(decision).not.toHaveProperty('payer');
    expect(decision).not.toHaveProperty('extendToLedgers');
  });

  it('represents pre-submit failure, pending confirmation and simulation independently', () => {
    const { after, transactionHash, ...attempt } = successfulBump;
    expect(after.endsAtLedger).toBe(1101);
    expect(transactionHash).toBe('synthetic-confirmed-hash');
    const failed: BumpRecord = {
      ...attempt,
      outcome: 'failed',
      error: { code: 'SIGNER_UNAVAILABLE', message: 'Signer not loaded' },
    };
    const submitted: BumpRecord = {
      ...attempt,
      outcome: 'submitted',
      transactionHash: 'synthetic-unconfirmed-hash',
    };
    const simulated: BumpRecord = { ...attempt, outcome: 'simulated', mode: 'dry-run' };
    expect(failed).not.toHaveProperty('transactionHash');
    expect(submitted).not.toHaveProperty('after');
    expect(simulated).not.toHaveProperty('transactionHash');
  });

  it('accepts both signer implementations and a channel without an SDK or credentials', async () => {
    const signedBy: string[] = [];
    const signers: Signer[] = (['ed25519', 'policy'] as const).map((kind) => ({
      payer: kind === 'ed25519' ? 'first' : 'second',
      identity: { kind, account: 'synthetic-public-account' },
      signExtendTTL(request) {
        signedBy.push(kind);
        return Promise.resolve(`synthetic-${kind}:${request.transactionXdr}`);
      },
    }));
    for (const signer of signers) {
      await signer.signExtendTTL({
        networkPassphrase: configExample.network.networkPassphrase,
        transactionXdr: 'synthetic-envelope',
      });
    }
    const notifications: BumpRecord[] = [];
    const channel: NotificationChannel = {
      name: 'in-memory-test',
      notify(record) {
        notifications.push(record);
        return Promise.resolve();
      },
    };
    await channel.notify(successfulBump);
    expect(signedBy).toEqual(['ed25519', 'policy']);
    expect(notifications[0]?.payer).toBe('first');
    expect(notifications[0]?.contracts).toEqual([contractA, secondContract]);
  });
});
