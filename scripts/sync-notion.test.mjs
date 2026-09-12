import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBacklog, planSync } from './sync-notion.mjs';
import { recurringIds } from './task-id.mjs';
import { readFileSync } from 'node:fs';

const row = (id, status, owner, pageId = `page:${id}`) => ({ id, status, owner, pageId });

test('a standing obligation is not a phantom', () => {
  // The regression this exists for: W1-D4-09 lives in § Recurring obligations
  // and carries no checkbox, so a checkbox-only parser called its Notion row a
  // phantom on EVERY run. A phantom report that cries wolf every time is one
  // people stop reading — that disarms the mechanism silently rather than
  // breaking it loudly, which is the worse failure.
  const { phantom } = planSync([], [row('W1-D4-09', 'In progress', 'Shared')], ['W1-D4-09']);
  assert.deepEqual(phantom, []);
});

test('a standing obligation is never written to either', () => {
  // It has no checkbox, so this script has no status for it. The mirror's
  // value is the human's and stays that way.
  const { changes } = planSync([], [row('W1-D4-09', 'Blocked', 'Fatih')], ['W1-D4-09']);
  assert.deepEqual(changes, []);
});

test('a genuine phantom is still reported', () => {
  const { phantom } = planSync([], [row('W3-D18-02', 'Dropped', 'Rakha')], ['W1-D4-09']);
  assert.deepEqual(phantom, ['W3-D18-02']);
});

test('a backlog row with no Notion row is reported, never created', () => {
  const { missing, changes } = planSync([{ id: 'W2-D10-01c', status: 'Pending' }], [], []);
  assert.deepEqual(missing, ['W2-D10-01c']);
  assert.deepEqual(changes, [], 'creating the row would hide the disagreement');
});

test('an owner absent from BACKLOG.md does not clear a human-set owner', () => {
  // Unstated is not "nobody". Clearing it would be the script overwriting
  // information it does not have.
  const { changes } = planSync(
    [{ id: 'W1-D1-01', status: 'Done', owner: undefined }],
    [row('W1-D1-01', 'Done', 'Shared')],
    [],
  );
  assert.deepEqual(changes, []);
});

test('only Status and Owner are ever written', () => {
  const { changes } = planSync(
    [{ id: 'W1-D1-01', status: 'Done', owner: 'Fatih' }],
    [row('W1-D1-01', 'Pending', 'Shared')],
    [],
  );
  assert.deepEqual(Object.keys(changes[0].fields).sort(), ['Owner', 'Status']);
});

test('parseBacklog refuses to skip a row that occupies an ID slot', () => {
  // 22 rows were dropped silently while reporting "parsed 124". A parser that
  // skips quietly makes partial work look finished.
  assert.throws(
    () => parseBacklog('- [ ] **W9-NOPE-1a** something\n'),
    /look like tasks but did not parse/,
  );
});

test('recurringIds finds the standing obligation in the real backlog', () => {
  // Guards the section-splitting itself: a renamed heading would silently
  // return [] and bring the phantom false-positive straight back.
  const backlog = readFileSync('BACKLOG.md', 'utf8');
  assert.ok(recurringIds(backlog).includes('W1-D4-09'));
});

// ── PR #102 review findings (Rakha, 2026-09-12) ──────────────────────────────

test('an ownership-transfer annotation still yields an owner', () => {
  // `(F, was R)` is written on rows where ownership MOVED — the one case the
  // mirror most needs corrected. The old `\((.)\)` required exactly one
  // character, so those rows parsed with no owner and planSync emitted nothing.
  const rows = parseBacklog(
    '- [x] **W2-D9-01** (F, was R) something\n- [x] **W2-D9-02** (F, was R) something\n',
  );
  assert.deepEqual(
    rows.map((r) => r.owner),
    ['Fatih', 'Fatih'],
  );
});

test('a genuinely absent owner is still absent, not invented', () => {
  const [row] = parseBacklog('- [ ] **W1-D1-01** no owner here\n');
  assert.equal(row.owner, undefined);
});

test('an annotation that is not an owner does not become one', () => {
  const [row] = parseBacklog('- [ ] **W1-D1-01** (P1) priority, not a person\n');
  assert.equal(row.owner, undefined);
});

test('the real backlog has no row whose owner failed to parse', () => {
  // Guards the live file, not a fixture: this is how the two W2-D9 rows hid.
  const rows = parseBacklog(readFileSync('BACKLOG.md', 'utf8'));
  assert.deepEqual(
    rows.filter((r) => !r.owner).map((r) => r.id),
    [],
  );
});

test('two mirror pages with one task ID are refused, not collapsed', () => {
  // A Map keeps the LAST, so the other page was never compared, never written
  // and never mentioned — a clean run over a row diverging forever. This is the
  // mirror-side twin of the duplicate check already enforced on BACKLOG.md.
  const { changes, ambiguous } = planSync(
    [{ id: 'W1-D1-01', status: 'Done', owner: 'Fatih' }],
    [row('W1-D1-01', 'Pending', 'Fatih', 'page-AAA'), row('W1-D1-01', 'Done', 'Fatih', 'page-BBB')],
    [],
  );
  assert.deepEqual(changes, [], 'writing to one of two candidate pages is the papering-over');
  assert.deepEqual(ambiguous, [{ id: 'W1-D1-01', pageIds: ['page-AAA', 'page-BBB'] }]);
});

test('an ambiguous ID names every page, so a person can delete the right one', () => {
  const { ambiguous } = planSync(
    [],
    [
      row('X-1', 'Done', 'Fatih', 'p1'),
      row('X-1', 'Done', 'Fatih', 'p2'),
      row('X-1', 'Done', 'Fatih', 'p3'),
    ],
    ['X-1'],
  );
  assert.deepEqual(ambiguous[0].pageIds, ['p1', 'p2', 'p3']);
});

test('one ambiguous row does not strand every other row', () => {
  // 145 correct rows must still sync. Blocking everything on one bad row trades
  // a small visible problem for a large invisible one.
  const { changes, ambiguous } = planSync(
    [
      { id: 'W1-D1-01', status: 'Done', owner: 'Fatih' },
      { id: 'W1-D1-02', status: 'Done', owner: 'Fatih' },
    ],
    [
      row('W1-D1-01', 'Pending', 'Fatih', 'pA'),
      row('W1-D1-01', 'Pending', 'Fatih', 'pB'),
      row('W1-D1-02', 'Pending', 'Fatih', 'pC'),
    ],
    [],
  );
  assert.equal(ambiguous.length, 1);
  assert.deepEqual(
    changes.map((c) => c.id),
    ['W1-D1-02'],
  );
});
