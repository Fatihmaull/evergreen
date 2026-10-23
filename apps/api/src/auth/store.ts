/**
 * Storage behind an interface (`PH2-E2-04`). The real implementation is
 * Postgres on Neon and waits for Rakha's schema (`PH2-E2-03`); until then the
 * routes run against `MemoryAuthStore`. Where his schema disagrees with these
 * shapes, the schema wins and this interface changes.
 */
import type { CounterStore } from './rate-limit.js';
import type { SessionRow } from './sessions.js';
import type { SigninCodeRecord } from './signin-codes.js';
import type { ChallengeStore } from './wallet-challenge.js';

export interface User {
  readonly id: string;
  readonly email: string;
  /** Unix seconds. */
  readonly createdAt: number;
}

export interface WalletLink {
  readonly account: string;
  readonly network: 'testnet';
  /** Unix seconds. */
  readonly linkedAt: number;
}

export type LinkResult = 'created' | 'already-linked' | 'linked-elsewhere';

export interface AuthStore {
  readonly counters: CounterStore;
  readonly challenges: ChallengeStore;

  getSigninCode(email: string): Promise<SigninCodeRecord | undefined>;
  putSigninCode(record: SigninCodeRecord): Promise<void>;

  /** Creates the account if new, or reactivates a deactivated one (API.md §10). */
  upsertUserByEmail(email: string, now: number): Promise<User>;
  getUser(id: string): Promise<User | undefined>;

  getSession(tokenHash: string): Promise<SessionRow | undefined>;
  putSession(row: SessionRow): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;

  listWallets(userId: string): Promise<readonly WalletLink[]>;
  /** Atomic: a wallet belongs to at most one user. */
  linkWallet(userId: string, account: string, now: number): Promise<LinkResult>;
  unlinkWallet(userId: string, account: string): Promise<boolean>;
  /** True while any of the user's watch items names this wallet as `payerWallet`. */
  walletPaysForWatchedContract(userId: string, account: string): Promise<boolean>;
}

/** Sends the one-time sign-in code. The real one is Resend; tests use a recorder. */
export interface Mailer {
  sendSigninCode(email: string, code: string): Promise<void>;
}
