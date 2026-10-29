/**
 * PH2-E2-04 Postgres AuthStore over a fake SqlClient: no driver, no network.
 * The fake records every statement and answers from a queue, so these tests
 * pin the SQL shape (atomicity, hex<->bytea, epoch<->timestamptz) and the
 * mapping back to the store's types.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PgAuthStore,
  neonSqlClient,
  type SessionRow,
  type SqlClient,
  type SqlQuery,
  type SqlRow,
} from '../src/index.js';

class FakeSql implements SqlClient {
  readonly queries: SqlQuery[] = [];
  readonly transactions: SqlQuery[][] = [];
  readonly answers: SqlRow[][] = [];
  query(text: string, params: readonly unknown[]): Promise<SqlRow[]> {
    this.queries.push({ text, params });
    return Promise.resolve(this.answers.shift() ?? []);
  }
  transaction(queries: readonly SqlQuery[]): Promise<SqlRow[][]> {
    this.transactions.push([...queries]);
    return Promise.resolve(queries.map(() => []));
  }
}

const H = 'ab'.repeat(32);
const H2 = 'cd'.repeat(32);
const UID = '00000000-0000-4000-8000-000000000001';
const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  tokenHash: H,
  userId: UID,
  csrfToken: 'csrf',
  createdAt: 100,
  lastUsedAt: 110,
  idleExpiresAt: 200,
  absoluteExpiresAt: 300,
  ...over,
});

let sql: FakeSql;
let clock: number;
let store: PgAuthStore;
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  sql = new FakeSql();
  clock = 1000;
  store = new PgAuthStore(sql, () => clock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sessions', () => {
  it('rotateSession writes both rows in ONE transaction (atomic)', async () => {
    await store.rotateSession(
      row({ absoluteExpiresAt: 160 }),
      row({ tokenHash: H2, rotatedFrom: H }),
    );
    expect(sql.queries).toHaveLength(0);
    expect(sql.transactions).toHaveLength(1);
    const [retired, next] = sql.transactions[0]!;
    expect(retired!.text).toMatch(/INSERT INTO sessions[\s\S]*ON CONFLICT \(id_hash\) DO UPDATE/);
    expect(retired!.params).toEqual([H, UID, 'csrf', 100, 110, 200, 160, null]);
    expect(next!.params).toEqual([H2, UID, 'csrf', 100, 110, 200, 300, H]);
    expect(next!.text).toContain("decode($8, 'hex')");
  });

  it('getSession maps bytea hex and epoch columns back, omitting a null rotated_from', async () => {
    sql.answers.push([
      {
        id_hash: H,
        user_id: UID,
        csrf_token: 'csrf',
        created_at: '100',
        last_used_at: '110',
        idle_expires_at: '200',
        absolute_expires_at: '300',
        rotated_from: null,
      },
    ]);
    expect(await store.getSession(H)).toEqual(row());
    expect(sql.queries[0]!.text).toContain("WHERE id_hash = decode($1, 'hex')");
    expect(await store.getSession(H)).toBeUndefined();
  });

  it('hasSuccessor asks for a row whose rotated_from is this hash', async () => {
    sql.answers.push([{ found: true }], [{ found: false }]);
    expect(await store.hasSuccessor(H)).toBe(true);
    expect(await store.hasSuccessor(H)).toBe(false);
    expect(sql.queries[0]!.text).toMatch(
      /EXISTS \(SELECT 1 FROM sessions WHERE rotated_from = decode\(\$1, 'hex'\)\)/,
    );
  });

  it('🔴 deleteSessionChain is one statement covering the row, its successor and its predecessor', async () => {
    await store.deleteSessionChain(H);
    expect(sql.queries).toHaveLength(1);
    const { text, params } = sql.queries[0]!;
    expect(params).toEqual([H]);
    expect(text).toContain("id_hash = decode($1, 'hex')");
    expect(text).toContain("rotated_from = decode($1, 'hex')");
    expect(text).toContain(
      "id_hash = (SELECT rotated_from FROM sessions WHERE id_hash = decode($1, 'hex'))",
    );
  });
});

describe('users and sign-in codes', () => {
  it('upsertUserByEmail reactivates on the lower(email) unique index, never a second row', async () => {
    sql.answers.push([{ id: UID, email: 'a@example.test', created_at: '5' }]);
    expect(await store.upsertUserByEmail('a@example.test', 5)).toEqual({
      id: UID,
      email: 'a@example.test',
      createdAt: 5,
    });
    const { text } = sql.queries[0]!;
    expect(text).toMatch(/ON CONFLICT \(\(lower\(email\)\)\) DO UPDATE SET/);
    expect(text).toContain('deactivated_at = NULL');
    // Stamped only when the row was deactivated; behaviour is proven in reactivation.pglite.test.ts.
    expect(text).toContain('CASE WHEN users.deactivated_at IS NOT NULL THEN to_timestamp($2)');
  });

  it('🔴 reactivation turns autopilot off on every watch item, in the same statement', async () => {
    // docs/API.md §10, ADR-008 2026-10-22, NOTES D5: coming back by email must
    // not resume the engine drawing on an allowance. Proven against Postgres 16
    // in the PR; this pins the statement's shape.
    sql.answers.push([{ id: UID, email: 'a@example.test', created_at: '5' }]);
    await store.upsertUserByEmail('a@example.test', 5);
    expect(sql.queries).toHaveLength(1);
    const { text } = sql.queries[0]!;
    expect(text).toMatch(/UPDATE watch_items SET autopilot_enabled = false/);
    expect(text).toMatch(/WHERE user_id IN \(SELECT id FROM prior\)/);
  });

  it('🔴 only a deactivated row counts as a reactivation, so an ordinary sign-in leaves autopilot alone', async () => {
    sql.answers.push([{ id: UID, email: 'a@example.test', created_at: '5' }]);
    await store.upsertUserByEmail('a@example.test', 5);
    expect(sql.queries[0]!.text).toMatch(
      /SELECT id FROM users WHERE lower\(email\) = lower\(\$1\) AND deactivated_at IS NOT NULL/,
    );
  });

  it('getUser ignores a deactivated account', async () => {
    await store.getUser(UID);
    expect(sql.queries[0]!.text).toContain('deactivated_at IS NULL');
  });

  it('putSigninCode replaces the address record atomically', async () => {
    await store.putSigninCode({
      email: 'a@example.test',
      codeMac: H,
      expiresAt: 600,
      failures: 2,
      used: true,
    });
    expect(sql.transactions).toHaveLength(1);
    const [del, ins] = sql.transactions[0]!;
    expect(del!.text).toMatch(/^DELETE FROM signin_codes WHERE lower\(email\) = lower\(\$1\)/);
    expect(ins!.params).toEqual(['a@example.test', H, 600, 2, true]);
  });

  it('getSigninCode reads the newest record', async () => {
    sql.answers.push([
      { email: 'a@example.test', code_mac: H, expires_at: '600', failures: 1, used: false },
    ]);
    expect(await store.getSigninCode('a@example.test')).toEqual({
      email: 'a@example.test',
      codeMac: H,
      expiresAt: 600,
      failures: 1,
      used: false,
    });
    expect(sql.queries[0]!.text).toContain('ORDER BY created_at DESC LIMIT 1');
  });
});

describe('wallets', () => {
  const G = 'G' + 'A'.repeat(55);
  it('linkWallet: created / already-linked / linked-elsewhere from one atomic statement', async () => {
    sql.answers.push(
      [{ created: true, owner: null }],
      [{ created: false, owner: UID }],
      [{ created: false, owner: 'other' }],
    );
    expect(await store.linkWallet(UID, G, 9)).toBe('created');
    expect(await store.linkWallet(UID, G, 9)).toBe('already-linked');
    expect(await store.linkWallet(UID, G, 9)).toBe('linked-elsewhere');
    expect(sql.queries[0]!.text).toContain('ON CONFLICT (network, account) DO NOTHING');
    // Signing again as the same user refreshes linked_at; never another user's wallet.
    expect(sql.queries[0]!.text).toContain('UPDATE wallets SET linked_at = to_timestamp($3)');
    expect(sql.queries[0]!.text).toContain('user_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM ins)');
  });

  it("🔴 unlinkWallet only deletes the caller's own wallet", async () => {
    expect(await store.unlinkWallet(UID, G)).toBe(false);
    expect(sql.queries[0]!.text).toContain('AND user_id = $1::uuid');
    expect(sql.queries[0]!.params).toEqual([UID, G]);
  });

  it('walletPaysForWatchedContract matches the FK restrict (removed items too)', async () => {
    sql.answers.push([{ found: true }]);
    expect(await store.walletPaysForWatchedContract(UID, G)).toBe(true);
    expect(sql.queries[0]!.text).not.toContain('removed_at');
  });
});

describe('counters and challenges', () => {
  it('increment is one atomic upsert', async () => {
    sql.answers.push([{ count: '4' }]);
    expect(await store.counters.increment('k')).toBe(4);
    expect(sql.queries[0]!.text).toMatch(
      /ON CONFLICT \(key\) DO UPDATE SET count = auth_rate_counters.count \+ 1 RETURNING count/,
    );
  });

  it('🔴 consume is a single DELETE…RETURNING scoped to the session, and refuses an expired challenge', async () => {
    expect(await store.challenges.consume('id', H)).toBe(false);
    sql.answers.push([{ expires_at: '1001' }], [{ expires_at: '1000' }]);
    expect(await store.challenges.consume('id', H)).toBe(true);
    expect(await store.challenges.consume('id', H)).toBe(false);
    expect(sql.queries[0]!.text).toMatch(
      /^DELETE FROM wallet_challenges WHERE id = \$1 AND session_hash = decode\(\$2, 'hex'\) RETURNING/,
    );
  });
});

describe('neonSqlClient', () => {
  it('constructing the client makes no network call', () => {
    expect(() => neonSqlClient('postgres://user:pw@db.invalid/evergreen')).not.toThrow();
  });
});
