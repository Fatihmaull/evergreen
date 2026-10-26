/**
 * The real `WalletPort`: `@stellar/freighter-api`, unchanged.
 *
 * Kept apart from `lib/wallet.ts` so the primitive stays testable without the
 * extension's API, and so this one import is the whole of what a page pays for
 * Freighter. The mapping from each call to a `WalletFailure` kind is recorded
 * in `lib/wallet.ts`.
 */
import freighter from '@stellar/freighter-api';
import type { WalletPort } from './wallet';

export function freighterPort(): WalletPort {
  return {
    isConnected: () => freighter.isConnected(),
    requestAccess: () => freighter.requestAccess(),
    getAddress: () => freighter.getAddress(),
    getNetworkDetails: () => freighter.getNetworkDetails(),
    signTransaction: (xdr, opts) => freighter.signTransaction(xdr, opts),
  };
}
