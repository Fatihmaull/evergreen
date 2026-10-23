import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { verifyWalletChallenge } from '../src/index.js';

// A fault that is not a refusal must surface. Its own file, because the SDK's
// WebAuth has to be replaced at module level (an ESM namespace cannot be spied
// on in place). The fault is the one PH2-E2-01 met at the edge: a missing
// global. Under a bare catch every user would see "invalid challenge" for ever.
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...sdk,
    WebAuth: {
      ...sdk.WebAuth,
      readChallengeTx: () => {
        throw new ReferenceError('Buffer is not defined');
      },
    },
  };
});

describe('wallet challenge verification', () => {
  it('🔴 rethrows a fault instead of calling the challenge invalid', async () => {
    const consume = vi.fn(() => Promise.resolve(true));
    await expect(
      verifyWalletChallenge({
        signedXdr: 'anything',
        serverPublicKey: Keypair.random().publicKey(),
        domains: { homeDomain: 'h.test', webAuthDomain: 'h.test' },
        sessionTokenHash: 's',
        store: { remember: () => Promise.resolve(), consume },
      }),
    ).rejects.toThrow(ReferenceError);
    expect(consume).not.toHaveBeenCalled();
  });
});
