import { Networks, WebAuth, type Keypair } from '@stellar/stellar-sdk';

/**
 * Wallet linking by signed challenge, the SEP-10 pattern (ADR-008,
 * docs/API.md §4), on the pinned SDK's `WebAuth` helpers.
 *
 * **Testnet only** until DoD-2 is met (`PH2-E5-02`): the passphrase is fixed
 * here rather than passed in, so no caller can make a mainnet challenge.
 *
 * **Single use, and bound to the session that asked for it.** A signed
 * challenge is valid for its timeout, so without this, anyone who obtained one
 * inside that window could link the wallet to their own account. The challenge
 * ID is the transaction hash, which covers the body and not the signatures, so
 * the signed copy carries the same ID as the issued one.
 */
export const CHALLENGE_NETWORK_PASSPHRASE = Networks.TESTNET;

export interface ChallengeDomains {
  /** The home domain the challenge names (the dashboard's host). */
  readonly homeDomain: string;
  /** The host serving this auth endpoint; same as `homeDomain` under option B. */
  readonly webAuthDomain: string;
}

/** Issued challenges, so each verifies once and only for its own session. */
export interface ChallengeStore {
  remember(id: string, sessionTokenHash: string, expiresAt: number): Promise<void>;
  /** True exactly once, and only for the session it was issued to. Atomic. */
  consume(id: string, sessionTokenHash: string): Promise<boolean>;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function issueWalletChallenge(args: {
  readonly serverKeypair: Keypair;
  readonly account: string;
  readonly domains: ChallengeDomains;
  readonly timeoutSeconds: number;
  readonly sessionTokenHash: string;
  readonly now: number;
  readonly store: ChallengeStore;
}): Promise<{
  readonly challengeXdr: string;
  readonly networkPassphrase: string;
  readonly expiresAt: number;
}> {
  const challengeXdr = WebAuth.buildChallengeTx(
    args.serverKeypair,
    args.account,
    args.domains.homeDomain,
    args.timeoutSeconds,
    CHALLENGE_NETWORK_PASSPHRASE,
    args.domains.webAuthDomain,
  );
  const { tx } = WebAuth.readChallengeTx(
    challengeXdr,
    args.serverKeypair.publicKey(),
    CHALLENGE_NETWORK_PASSPHRASE,
    args.domains.homeDomain,
    args.domains.webAuthDomain,
  );
  const expiresAt = args.now + args.timeoutSeconds;
  await args.store.remember(hex(new Uint8Array(tx.hash())), args.sessionTokenHash, expiresAt);
  return { challengeXdr, networkPassphrase: CHALLENGE_NETWORK_PASSPHRASE, expiresAt };
}

/**
 * The wallet account that signed, or null. Null covers every refusal alike:
 * not our challenge, wrong network, expired, unsigned, signed by someone else,
 * already used, or issued to another session.
 */
export async function verifyWalletChallenge(args: {
  readonly signedXdr: string;
  readonly serverPublicKey: string;
  readonly domains: ChallengeDomains;
  readonly sessionTokenHash: string;
  readonly store: ChallengeStore;
}): Promise<string | null> {
  let account: string;
  let id: string;
  try {
    const read = WebAuth.readChallengeTx(
      args.signedXdr,
      args.serverPublicKey,
      CHALLENGE_NETWORK_PASSPHRASE,
      args.domains.homeDomain,
      args.domains.webAuthDomain,
    );
    account = read.clientAccountID;
    id = hex(new Uint8Array(read.tx.hash()));
    // Throws InvalidChallengeError unless the client account signed (tested:
    // unsigned and stranger-signed both refuse), so its result needs no check.
    WebAuth.verifyChallengeTxSigners(
      args.signedXdr,
      args.serverPublicKey,
      CHALLENGE_NETWORK_PASSPHRASE,
      [account],
      args.domains.homeDomain,
      args.domains.webAuthDomain,
    );
  } catch (error) {
    // The SDK wraps every refusal it understands in InvalidChallengeError,
    // garbage XDR included (checked against 17.0.1). Anything else is a fault
    // here, such as a missing global at the edge, and must surface. A bare
    // catch would report it to every user as "invalid challenge", for ever,
    // which is the shape #311 had.
    if (error instanceof WebAuth.InvalidChallengeError) return null;
    throw error;
  }
  // Consumed last, so a forged or mis-signed attempt cannot burn the real one.
  return (await args.store.consume(id, args.sessionTokenHash)) ? account : null;
}
