/**
 * PH2-E3-02 evidence capture: the five-item check is only worth running if it
 * fails when the thing it watches is wrong, and passes when it is right. Each
 * line is driven both ways here, and the rows that are NOT an engine
 * observation (a browser read, no observation) must not be passed as one.
 */
import { describe, expect, test } from 'vitest';
import {
  GUINEA_PIG_A,
  captureItem,
  verdict,
  type ItemReport,
  type Live,
} from '../src/lib/watchlist-capture';
import { bindingFromScan, type WatchItem } from '../src/lib/watchlist-view';
import { A, B, item, scanOf } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T04:00:53Z');
const liveOf = (id: string): Live => ({ binding: bindingFromScan(scanOf(id), NOW) });
const status = (r: ItemReport) => r.lines.map((l) => `${l.n}:${l.status}`).join(' ');

describe('a correct engine observation', () => {
  test('guinea-pig A passes all five and the verdict is ready-pass', () => {
    expect(A).toBe(GUINEA_PIG_A);
    const r = captureItem(item(A), NOW, liveOf(A));
    expect(status(r)).toBe('1:pass 2:pass 3:pass 4:pass 5:pass');
    expect(r.lines[2]!.detail).toContain('code entry');
    expect(r.lines[2]!.detail).toContain('guinea-pig A');
    expect(verdict([r])).toBe('ready-pass');
  });

  test('an expired binding is a state with an observation, and passes', () => {
    const r = captureItem(item(B), NOW, liveOf(B));
    expect(status(r)).toBe('1:pass 2:pass 3:pass 4:pass 5:pass');
  });
});

describe('what it must not pass', () => {
  test('no observation is "not time", never a pass', () => {
    const r = captureItem(item(A, { lastObservation: null }), NOW, undefined);
    expect(r.observed).toBe(false);
    expect(r.lines[0]!.status).not.toBe('pass');
    expect(verdict([r])).toBe('not-time');
    expect(verdict([])).toBe('not-time');
  });

  test('a state without a usable observation fails lines 1 and 2 (§9a)', () => {
    const bad = item(A);
    const r = captureItem(
      { ...bad, lastObservation: { ...bad.lastObservation!, observedAtLedger: 0 } },
      NOW,
      liveOf(A),
    );
    expect(r.lines.find((l) => l.n === 1)!.status).toBe('fail');
    expect(r.lines.find((l) => l.n === 2)!.status).toBe('fail');
    expect(verdict([r])).toBe('fail');
  });

  test('guinea-pig A binding on the instance instead of the code entry fails line 3', () => {
    const scan = scanOf(A);
    const noCode = {
      ...scan,
      entries: Object.fromEntries(
        Object.entries(scan.entries).filter(([, e]) => e.kind !== 'code'),
      ),
    };
    const bad = item(A);
    const r = captureItem(
      { ...bad, lastObservation: { ...bad.lastObservation!, scan: noCode } },
      NOW,
      undefined,
    );
    const l3 = r.lines.find((l) => l.n === 3)!;
    expect(l3.status).toBe('fail');
    expect(l3.detail).toContain('code entry');
    expect(verdict([r])).toBe('fail');
  });

  test('a row that fell off the engine path fails line 4, not just line 1', () => {
    const bad = item(A);
    const r = captureItem(
      { ...bad, lastObservation: { ...bad.lastObservation!, health: 'unknown' as never } },
      NOW,
      liveOf(A),
    );
    expect(r.lines.find((l) => l.n === 4)!.status).toBe('fail');
    expect(r.lines.find((l) => l.n === 1)!.status).toBe('fail');
  });
});

describe('item 5, against the scanner now', () => {
  test('a different end ledger is undetermined with both values, not a fault', () => {
    const live: Live = liveOf(A);
    if (!('binding' in live) || live.binding.state !== 'live') throw new Error('fixture');
    const moved: Live = {
      binding: { ...live.binding, endsAtLedger: live.binding.endsAtLedger + 100 },
    };
    const r = captureItem(item(A), NOW, moved);
    const l5 = r.lines.find((l) => l.n === 5)!;
    expect(l5.status).toBe('undetermined');
    expect(l5.detail).toContain('8,297,162');
    expect(l5.detail).toContain('8,297,262');
    expect(verdict([r])).toBe('undetermined');
  });

  test('a scan that threw is undetermined, and says why', () => {
    const r = captureItem(item(A), NOW, { error: 'RPC down' });
    expect(r.lines.find((l) => l.n === 5)).toMatchObject({ status: 'undetermined' });
    expect(r.lines.find((l) => l.n === 5)!.detail).toContain('RPC down');
  });

  test('a different kind of entry is undetermined, never a pass', () => {
    const live = liveOf(A) as {
      binding: Extract<ReturnType<typeof bindingFromScan>, { state: 'live' }>;
    };
    const r = captureItem(item(A), NOW, { binding: { ...live.binding, kind: 'instance' } });
    expect(r.lines.find((l) => l.n === 5)!.status).toBe('undetermined');
  });
});

describe('the verdict over several rows', () => {
  test('one failing row fails the whole answer; unobserved rows are ignored', () => {
    const good = captureItem(item(A), NOW, liveOf(A));
    const none = captureItem(item(B, { lastObservation: null }), NOW, undefined);
    expect(verdict([good, none])).toBe('ready-pass');
    const bad = item(A);
    const failing = captureItem(
      { ...bad, lastObservation: { ...bad.lastObservation!, observedAtLedger: 0 } } as WatchItem,
      NOW,
      undefined,
    );
    expect(verdict([good, failing])).toBe('fail');
  });
});
