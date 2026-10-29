/**
 * Postgres `AuthStore` over Rakha's schema (apps/api/db/schema.sql, #391),
 * reached through Neon's serverless driver over HTTPS (`PH2-E2-04`).
 *
 * Hashes and MACs travel as hex and are stored as `bytea` (`decode(…,'hex')`).
 * Times are epoch seconds in code and `timestamptz` in the database.
 *
 * Rate counters and wallet challenges have no table in schema.sql. They read
 * `auth_rate_counters` and `wallet_challenges` from migration
 * apps/api/db/0003_auth_rate_counters_wallet_challenges.sql (#419). Until it is
 * applied those queries fail, and the router answers 503 `UPSTREAM_UNAVAILABLE`.
 */
import { neon } from '@neondatabase/serverless';
import type { CounterStore } from './rate-limit.js';
import type { SessionRow } from './sessions.js';
import type { SigninCodeRecord } from './signin-codes.js';
import type { AuthStore, LinkResult, User, WalletLink } from './store.js';
import type { ChallengeStore } from './wallet-challenge.js';

export type SqlRow = Record<string, unknown>;
export interface SqlQuery {
  readonly text: string;
  readonly params: readonly unknown[];
}
/** The two driver calls the store needs, so tests swap in a fake with no network. */
export interface SqlClient {
  query(text: string, params: readonly unknown[]): Promise<SqlRow[]>;
  /** Runs every statement in one non-interactive transaction: all or none. */
  transaction(queries: readonly SqlQuery[]): Promise<SqlRow[][]>;
}

/** The real client: `neon()` over HTTPS. Nothing connects until the first query. */
export function neonSqlClient(databaseUrl: string): SqlClient {
  const sql = neon(databaseUrl);
  return {
    query: (text, params) => sql.query(text, [...params]) as Promise<SqlRow[]>,
    transaction: (queries) =>
      sql.transaction(queries.map((q) => sql.query(q.text, [...q.params]))) as Promise<SqlRow[][]>,
  };
}

const num = (v: unknown): number => Number(v);
const epoch = (col: string, as = col) => `extract(epoch from ${col})::int8 AS ${as}`;

const SESSION_COLUMNS = [
  `encode(id_hash, 'hex') AS id_hash`,
  'user_id::text AS user_id',
  'csrf_token',
  epoch('created_at'),
  epoch('last_used_at'),
  epoch('idle_expires_at'),
  epoch('absolute_expires_at'),
  `encode(rotated_from, 'hex') AS rotated_from`,
].join(', ');

function sessionFromRow(r: SqlRow): SessionRow {
  const row: SessionRow = {
    tokenHash: String(r['id_hash']),
    userId: String(r['user_id']),
    csrfToken: String(r['csrf_token']),
    createdAt: num(r['created_at']),
    lastUsedAt: num(r['last_used_at']),
    idleExpiresAt: num(r['idle_expires_at']),
    absoluteExpiresAt: num(r['absolute_expires_at']),
  };
  const from = r['rotated_from'];
  return from === null || from === undefined ? row : { ...row, rotatedFrom: String(from) };
}

/** Insert or overwrite one session row. */
export function upsertSessionQuery(row: SessionRow): SqlQuery {
  return {
    text: `INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, last_used_at, idle_expires_at, absolute_expires_at, rotated_from)
VALUES (decode($1, 'hex'), $2::uuid, $3, to_timestamp($4), to_timestamp($5), to_timestamp($6), to_timestamp($7), decode($8, 'hex'))
ON CONFLICT (id_hash) DO UPDATE SET user_id = EXCLUDED.user_id, csrf_token = EXCLUDED.csrf_token,
  created_at = EXCLUDED.created_at, last_used_at = EXCLUDED.last_used_at, idle_expires_at = EXCLUDED.idle_expires_at,
  absolute_expires_at = EXCLUDED.absolute_expires_at, rotated_from = EXCLUDED.rotated_from`,
    params: [
      row.tokenHash,
      row.userId,
      row.csrfToken,
      row.createdAt,
      row.lastUsedAt,
      row.idleExpiresAt,
      row.absoluteExpiresAt,
      row.rotatedFrom ?? null,
    ],
  };
}

const userFromRow = (r: SqlRow): User => ({
  id: String(r['id']),
  email: String(r['email']),
  createdAt: num(r['created_at']),
});

export class PgCounterStore implements CounterStore {
  constructor(private readonly sql: SqlClient) {}
  async increment(key: string): Promise<number> {
    const rows = await this.sql.query(
      `INSERT INTO auth_rate_counters (key, count) VALUES ($1, 1)
ON CONFLICT (key) DO UPDATE SET count = auth_rate_counters.count + 1 RETURNING count`,
      [key],
    );
    return num(rows[0]?.['count']);
  }
}

export class PgChallengeStore implements ChallengeStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number,
  ) {}
  async remember(id: string, sessionTokenHash: string, expiresAt: number): Promise<void> {
    await this.sql.query(
      `INSERT INTO wallet_challenges (id, session_hash, expires_at) VALUES ($1, decode($2, 'hex'), to_timestamp($3))`,
      [id, sessionTokenHash, expiresAt],
    );
  }
  /** One DELETE … RETURNING: a challenge is consumed at most once, even under concurrency. */
  async consume(id: string, sessionTokenHash: string): Promise<boolean> {
    const rows = await this.sql.query(
      `DELETE FROM wallet_challenges WHERE id = $1 AND session_hash = decode($2, 'hex') RETURNING ${epoch('expires_at')}`,
      [id, sessionTokenHash],
    );
    const row = rows[0];
    return row !== undefined && this.clock() < num(row['expires_at']);
  }
}

export class PgAuthStore implements AuthStore {
  readonly counters: CounterStore;
  readonly challenges: ChallengeStore;

  constructor(
    private readonly sql: SqlClient,
    clock: () => number,
  ) {
    this.counters = new PgCounterStore(sql);
    this.challenges = new PgChallengeStore(sql, clock);
  }

  async getSigninCode(email: string): Promise<SigninCodeRecord | undefined> {
    const rows = await this.sql.query(
      `SELECT email, encode(code_hash, 'hex') AS code_mac, ${epoch('expires_at')}, failures, used_at IS NOT NULL AS used
FROM signin_codes WHERE lower(email) = lower($1) ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const r = rows[0];
    if (r === undefined) return undefined;
    return {
      email: String(r['email']),
      codeMac: String(r['code_mac']),
      expiresAt: num(r['expires_at']),
      failures: num(r['failures']),
      used: r['used'] === true,
    };
  }

  /** One record per address: replace, atomically. */
  async putSigninCode(record: SigninCodeRecord): Promise<void> {
    await this.sql.transaction([
      { text: 'DELETE FROM signin_codes WHERE lower(email) = lower($1)', params: [record.email] },
      {
        text: `INSERT INTO signin_codes (email, code_hash, expires_at, failures, used_at)
VALUES ($1, decode($2, 'hex'), to_timestamp($3), $4, CASE WHEN $5::boolean THEN now() ELSE NULL END)`,
        params: [record.email, record.codeMac, record.expiresAt, record.failures, record.used],
      },
    ]);
  }

  /**
   * Creates the account, or reactivates it: one email, one row, ever (users_email_uq).
   *
   * **Reactivation turns autopilot off on every watch item** (docs/API.md §10,
   * ADR-008 2026-10-22, NOTES D5): an email session never authorises XLM
   * movement, so coming back by email must not resume the engine drawing on an
   * allowance. It happens in the same statement as the reactivation, so there
   * is no moment where the account is active with autopilot still on. It runs
   * **only** when the row was deactivated: `prior` reads the row as it was before
   * this statement, so an ordinary sign-in leaves autopilot alone.
   *
   * **It also stamps `users.reactivated_at`** (migration 0004, #385 option 2),
   * again only on a real reactivation. A wallet then counts as linked for
   * autopilot only if it was linked strictly after that instant: the user has to
   * sign the §4 challenge again. The clock is the same `now` that stamps
   * `wallets.linked_at`, so the two are comparable.
   */
  async upsertUserByEmail(email: string, now: number): Promise<User> {
    const rows = await this.sql.query(
      `WITH prior AS (
  SELECT id FROM users WHERE lower(email) = lower($1) AND deactivated_at IS NOT NULL
), autopilot_off AS (
  UPDATE watch_items SET autopilot_enabled = false
  WHERE user_id IN (SELECT id FROM prior) AND autopilot_enabled
)
INSERT INTO users (email, created_at) VALUES ($1, to_timestamp($2))
ON CONFLICT ((lower(email))) DO UPDATE SET
  reactivated_at = CASE WHEN users.deactivated_at IS NOT NULL THEN to_timestamp($2) ELSE users.reactivated_at END,
  deactivated_at = NULL
RETURNING id::text AS id, email, ${epoch('created_at')}`,
      [email, now],
    );
    return userFromRow(rows[0]!);
  }

  /** A deactivated account has no user for a session to belong to. */
  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.sql.query(
      `SELECT id::text AS id, email, ${epoch('created_at')} FROM users WHERE id = $1::uuid AND deactivated_at IS NULL`,
      [id],
    );
    return rows[0] === undefined ? undefined : userFromRow(rows[0]);
  }

  async getSession(tokenHash: string): Promise<SessionRow | undefined> {
    const rows = await this.sql.query(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id_hash = decode($1, 'hex')`,
      [tokenHash],
    );
    return rows[0] === undefined ? undefined : sessionFromRow(rows[0]);
  }

  async putSession(row: SessionRow): Promise<void> {
    const q = upsertSessionQuery(row);
    await this.sql.query(q.text, q.params);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.sql.query(`DELETE FROM sessions WHERE id_hash = decode($1, 'hex')`, [tokenHash]);
  }

  /** Atomic: the retired row (cut to grace) and its successor land together or not at all. */
  async rotateSession(retired: SessionRow, next: SessionRow): Promise<void> {
    await this.sql.transaction([upsertSessionQuery(retired), upsertSessionQuery(next)]);
  }

  async hasSuccessor(tokenHash: string): Promise<boolean> {
    const rows = await this.sql.query(
      `SELECT EXISTS (SELECT 1 FROM sessions WHERE rotated_from = decode($1, 'hex')) AS found`,
      [tokenHash],
    );
    return rows[0]?.['found'] === true;
  }

  /** One statement: the row, its successors and the row it rotated from. No grace token survives. */
  async deleteSessionChain(tokenHash: string): Promise<void> {
    await this.sql.query(
      `DELETE FROM sessions WHERE id_hash = decode($1, 'hex') OR rotated_from = decode($1, 'hex')
  OR id_hash = (SELECT rotated_from FROM sessions WHERE id_hash = decode($1, 'hex'))`,
      [tokenHash],
    );
  }

  async listWallets(userId: string): Promise<readonly WalletLink[]> {
    const rows = await this.sql.query(
      `SELECT account, ${epoch('linked_at')} FROM wallets WHERE user_id = $1::uuid AND network = 'testnet' ORDER BY linked_at`,
      [userId],
    );
    return rows.map((r) => ({
      account: String(r['account']),
      network: 'testnet' as const,
      linkedAt: num(r['linked_at']),
    }));
  }

  /**
   * Atomic: the (network, account) primary key decides; a wallet belongs to one user.
   *
   * **Signing again refreshes `linked_at`** when the wallet is already this
   * user's. That is what lets a reactivated user's wallet count as linked
   * again: the autopilot rule compares `linked_at` with `users.reactivated_at`
   * (#385 option 2), so a re-sign that left the old `linked_at` in place could
   * never satisfy it. The refresh is limited to the same user: another user's
   * wallet is never touched, and still answers `linked-elsewhere`.
   */
  async linkWallet(userId: string, account: string, now: number): Promise<LinkResult> {
    const rows = await this.sql.query(
      `WITH ins AS (
  INSERT INTO wallets (network, account, user_id, linked_at) VALUES ('testnet', $2, $1::uuid, to_timestamp($3))
  ON CONFLICT (network, account) DO NOTHING RETURNING 1
), refresh AS (
  UPDATE wallets SET linked_at = to_timestamp($3)
  WHERE network = 'testnet' AND account = $2 AND user_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM ins)
)
SELECT EXISTS (SELECT 1 FROM ins) AS created,
  (SELECT user_id::text FROM wallets WHERE network = 'testnet' AND account = $2) AS owner`,
      [userId, account, now],
    );
    const r = rows[0];
    if (r?.['created'] === true) return 'created';
    return r?.['owner'] === userId ? 'already-linked' : 'linked-elsewhere';
  }

  async unlinkWallet(userId: string, account: string): Promise<boolean> {
    const rows = await this.sql.query(
      `DELETE FROM wallets WHERE network = 'testnet' AND account = $2 AND user_id = $1::uuid RETURNING account`,
      [userId, account],
    );
    return rows.length > 0;
  }

  /** Matches the schema's ON DELETE RESTRICT: any item naming the wallet as payer, removed or not. */
  async walletPaysForWatchedContract(userId: string, account: string): Promise<boolean> {
    const rows = await this.sql.query(
      `SELECT EXISTS (SELECT 1 FROM watch_items WHERE user_id = $1::uuid AND payer_network = 'testnet' AND payer_account = $2) AS found`,
      [userId, account],
    );
    return rows[0]?.['found'] === true;
  }
}
