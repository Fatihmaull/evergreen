import { instanceKey } from '@evergreen-stellar/core';
import type { BumpRecord } from '@evergreen-stellar/shared-types';

export const base = {
  entryKey: instanceKey('CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'),
  contracts: ['CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'],
  payer: 'test-payer',
  reason: 'Fixture extension',
  extendToLedgers: 1000,
  before: { observedAtLedger: 1000, endsAtLedger: 1050 },
  recordedAt: '2026-09-14T00:00:00.000Z',
};
export const signer = {
  kind: 'ed25519' as const,
  account: 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB',
};
export const success: BumpRecord = {
  ...base,
  mode: 'live',
  outcome: 'succeeded',
  signer,
  transactionHash: 'a'.repeat(64),
  after: { observedAtLedger: 1001, endsAtLedger: 2001 },
};
export const submitted: BumpRecord = {
  ...base,
  mode: 'live',
  outcome: 'submitted',
  signer,
  transactionHash: 'b'.repeat(64),
};
export const failed: BumpRecord = {
  ...base,
  mode: 'live',
  outcome: 'failed',
  transactionHash: 'c'.repeat(64),
  error: { code: 'EXTENSION_FAILED', message: 'Post-state unverified' },
};
export const simulated: BumpRecord = { ...base, mode: 'dry-run', outcome: 'simulated' };
export const emailId = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
