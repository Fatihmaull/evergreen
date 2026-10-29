/** In-memory `AuthStore` for tests and local runs. Not for production: nothing persists. */
import { MemoryCounterStore } from './rate-limit.js';
import type { SessionRow } from './sessions.js';
import type { SigninCodeRecord } from './signin-codes.js';
import type { AuthStore, LinkResult, User, WalletLink } from './store.js';
import type { ChallengeStore } from './wallet-challenge.js';

export class MemoryChallengeStore implements ChallengeStore {
  private readonly rows = new Map<string, { session: string; expiresAt: number }>();
  constructor(private readonly clock: () => number) {}
  remember(id: string, sessionTokenHash: string, expiresAt: number): Promise<void> {
    this.rows.set(id, { session: sessionTokenHash, expiresAt });
    return Promise.resolve();
  }
  consume(id: string, sessionTokenHash: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (row === undefined || row.session !== sessionTokenHash) return Promise.resolve(false);
    this.rows.delete(id);
    return Promise.resolve(this.clock() < row.expiresAt);
  }
}

export class MemoryAuthStore implements AuthStore {
  readonly counters = new MemoryCounterStore();
  readonly challenges: ChallengeStore;
  readonly codes = new Map<string, SigninCodeRecord>();
  readonly users = new Map<string, User>();
  readonly sessions = new Map<string, SessionRow>();
  /** account -> owner and link. */
  readonly wallets = new Map<string, { userId: string; link: WalletLink }>();
  /** `${userId}\n${account}` pairs that pay for a watched contract. */
  readonly payers = new Set<string>();
  private nextId = 1;

  constructor(clock: () => number) {
    this.challenges = new MemoryChallengeStore(clock);
  }

  getSigninCode(email: string): Promise<SigninCodeRecord | undefined> {
    return Promise.resolve(this.codes.get(email));
  }
  putSigninCode(record: SigninCodeRecord): Promise<void> {
    this.codes.set(record.email, record);
    return Promise.resolve();
  }
  upsertUserByEmail(email: string, now: number): Promise<User> {
    for (const user of this.users.values()) if (user.email === email) return Promise.resolve(user);
    const user: User = { id: `user-${this.nextId++}`, email, createdAt: now };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
  getUser(id: string): Promise<User | undefined> {
    return Promise.resolve(this.users.get(id));
  }
  getSession(tokenHash: string): Promise<SessionRow | undefined> {
    return Promise.resolve(this.sessions.get(tokenHash));
  }
  putSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.tokenHash, row);
    return Promise.resolve();
  }
  deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }
  rotateSession(retired: SessionRow, next: SessionRow): Promise<void> {
    this.sessions.set(retired.tokenHash, retired);
    this.sessions.set(next.tokenHash, next);
    return Promise.resolve();
  }
  hasSuccessor(tokenHash: string): Promise<boolean> {
    for (const row of this.sessions.values()) {
      if (row.rotatedFrom === tokenHash) return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
  deleteSessionChain(tokenHash: string): Promise<void> {
    const row = this.sessions.get(tokenHash);
    for (const [hash, other] of this.sessions) {
      if (other.rotatedFrom === tokenHash) this.sessions.delete(hash);
    }
    if (row?.rotatedFrom !== undefined) this.sessions.delete(row.rotatedFrom);
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }
  listWallets(userId: string): Promise<readonly WalletLink[]> {
    return Promise.resolve(
      [...this.wallets.values()].filter((w) => w.userId === userId).map((w) => w.link),
    );
  }
  linkWallet(userId: string, account: string, now: number): Promise<LinkResult> {
    const existing = this.wallets.get(account);
    if (existing !== undefined) {
      if (existing.userId !== userId) return Promise.resolve('linked-elsewhere');
      // Signing again refreshes the link time, as the Postgres store does (#385 option 2).
      existing.link = { ...existing.link, linkedAt: now };
      return Promise.resolve('already-linked');
    }
    this.wallets.set(account, { userId, link: { account, network: 'testnet', linkedAt: now } });
    return Promise.resolve('created');
  }
  unlinkWallet(userId: string, account: string): Promise<boolean> {
    if (this.wallets.get(account)?.userId !== userId) return Promise.resolve(false);
    this.wallets.delete(account);
    return Promise.resolve(true);
  }
  walletPaysForWatchedContract(userId: string, account: string): Promise<boolean> {
    return Promise.resolve(this.payers.has(`${userId}\n${account}`));
  }
}
