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
