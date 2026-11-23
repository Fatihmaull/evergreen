/**
 * In-flight pull sum on PGlite. Extended and refunded jobs are not headroom.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IN_FLIGHT_PULLS_SQL } from '../src/float-headroom.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const U = '00000000-0000-4000-8000-0000000000a1';
const C = `C${'A'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
let pg: PGlite;

describe('in-flight pull headroom', () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(db('schema.sql'));
    await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'a@example.test')`);
    await pg.exec(
      `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`,
    );
    const job = (id: string, status: string, amount: string, hash: string) =>
      `INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, autopilot_window, status, pull_tx_hash, pulled_at, pull_amount)
       VALUES ('${id}', '${U}', 'testnet', '${C}', 'autopilot', '${G}', ${id.slice(-1)}, '${status}', '${hash}', now(), ${amount})`;
    await pg.exec(job('00000000-0000-4000-8000-0000000000c1', 'pulled', '100', 'p1'));
    await pg.exec(job('00000000-0000-4000-8000-0000000000c2', 'pulled', '40', 'p2'));
    await pg.exec(job('00000000-0000-4000-8000-0000000000c3', 'extended', '999', 'p3'));
    await pg.exec(job('00000000-0000-4000-8000-0000000000c4', 'refunded', '999', 'p4'));
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('sums only pulled jobs and does not read users', async () => {
    expect(IN_FLIGHT_PULLS_SQL).not.toMatch(/users|email/i);
    const { rows } = await pg.query<{ in_flight_stroops: string }>(IN_FLIGHT_PULLS_SQL);
    expect(rows[0]?.in_flight_stroops).toBe('140');
  });
});
