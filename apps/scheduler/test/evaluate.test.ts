import { describe, expect, it } from 'vitest';
import {
  LIST_AUTOPILOT_ITEMS_SQL,
  SPENT_LAST_30D_SQL,
} from '@evergreen/engine/dist/pg-tenant-store.js';
import { EvaluationError, evaluate, isReadOnlyStatement, readOnlyQuery } from '../src/evaluate.js';

describe('isReadOnlyStatement', () => {
  it.each([
    ['the engine plan query', LIST_AUTOPILOT_ITEMS_SQL],
    ['the engine spend query', SPENT_LAST_30D_SQL],
    ['a plain select', 'SELECT 1'],
    ['a trailing semicolon', 'SELECT 1;'],
  ])('accepts %s', (_, sql) => expect(isReadOnlyStatement(sql)).toBe(true));

  it.each([
    ['an insert', 'INSERT INTO jobs (id) VALUES (1)'],
    ['an update', 'UPDATE watch_items SET label = 1'],
    ['a delete', 'DELETE FROM jobs'],
    ['a CTE that writes', 'WITH x AS (DELETE FROM jobs RETURNING id) SELECT * FROM x'],
    [
      'a select that writes in a CTE',
      'SELECT * FROM (WITH x AS (UPDATE jobs SET status = 1) SELECT 1) y',
    ],
    ['a row lock', 'SELECT * FROM jobs FOR UPDATE'],
    ['a second statement', 'SELECT 1; DELETE FROM jobs'],
    ['a sequence call', "SELECT nextval('fee_ledger_id_seq')"],
    ['a role switch', 'SET ROLE neondb_owner'],
    ['a write hidden after a comment', '/* SELECT */ DELETE FROM jobs'],
    ['an empty string', ''],
  ])('refuses %s', (_, sql) => expect(isReadOnlyStatement(sql)).toBe(false));
});

describe('evaluate', () => {
  it('passes only read-only statements to the driver', async () => {
    const seen: string[] = [];
    await evaluate(async (sql) => {
      seen.push(sql);
      return sql.includes('missing_pull') ? [] : [];
    });
    expect(seen.length).toBe(2);
    for (const sql of seen) expect(isReadOnlyStatement(sql)).toBe(true);
  });

  it('reports a driver error by code, with nothing from the driver', async () => {
    const error = await evaluate(() =>
      Promise.reject(new Error('postgres://user:secret@host/db timed out')),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluationError);
    expect((error as EvaluationError).code).toBe('EVAL_DB_FAILED');
    expect(String((error as Error).message)).not.toContain('secret');
  });

  it('readOnlyQuery refuses a write without calling the driver', async () => {
    let called = false;
    const q = readOnlyQuery(() => {
      called = true;
      return Promise.resolve([]);
    });
    await expect(q('DELETE FROM jobs', [])).rejects.toMatchObject({ code: 'EVAL_WRITE_REFUSED' });
    expect(called).toBe(false);
  });
});
