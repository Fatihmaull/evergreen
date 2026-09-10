import { describe, expect, it } from 'vitest';
import type {
  BumpRecord,
  LedgerEntryTTL,
  ScanIssue,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { assertLiveness } from '../src/liveness.js';

const KEY = 'AAAAB0NvZGVLZXk=';
const SHARED = 'AAAAB1NoYXJlZEs=';
const THRESHOLDS = { bumpWhenRemainingLedgersBelow: 17_280 };

function entry(remaining: number | undefined, contracts = ['CONTRACT_A']): LedgerEntryTTL {
  return {
    kind: 'persistent',
    endBehavior: 'archived',
    contracts,
    observedAtLedger: 1_000_000,
    ttl:
      remaining === undefined
        ? { status: 'unavailable' }
        : { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
  };
}

function scan(entries: Record<string, LedgerEntryTTL>, issues: ScanIssue[] = []): ScanResult {
  return { network: 'testnet', contracts: [{ id: 'CONTRACT_A' }], entries, issues };
}

const attempt = {
  entryKey: KEY,
  contracts: ['CONTRACT_A'],
  reason: 'below threshold',
  payer: 'primary',
  extendToLedgers: 518_400,
  recordedAt: '2026-09-20T12:00:00.000Z',
  before: { observedAtLedger: 1_000_000, endsAtLedger: 1_000_100 },
} as const;

const signer = { kind: 'ed25519', account: 'GABC' } as const;

const succeeded: BumpRecord = {
  ...attempt,
  outcome: 'succeeded',
  mode: 'live',
  signer,
  transactionHash: 'abc',
  after: { observedAtLedger: 1_000_010, endsAtLedger: 1_518_400 },
};

describe('assertLiveness — it PERMITS what it should', () => {
  it('stays quiet when everything is comfortably above threshold', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100_000) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(false);
    expect(v.findings).toEqual([]);
  });

  it('stays quiet when a low entry WAS confirmed extended', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [succeeded],
    });
    expect(v.isAlarm).toBe(false);
  });

  it('treats an entry exactly AT the threshold as healthy, not below it', () => {
    // The threshold is "bump when remaining is BELOW this". Equal is not below.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(17_280) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(false);
  });

  it('stays quiet on an empty scan — nothing watched, nothing claimed', () => {
    expect(assertLiveness({ scan: scan({}), thresholds: THRESHOLDS, records: [] }).isAlarm).toBe(
      false,
    );
  });
});

describe('assertLiveness — it STOPS what it should', () => {
  it('🔴 alarms on the silent skip — the Sunday failure mode', () => {
    // This is the whole reason the task exists: `claim()` returning null is the
    // ordinary path, so ~96 runs could pass looking exactly like this while
    // guinea-pig B archives unattended.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('no-action-recorded');
  });

  it('🔴 alarms when the run was only a DRY RUN — the default mode', () => {
    // Dry-run is the safety default, which makes "scheduled job silently left
    // in dry-run" a likely, not exotic, failure.
    const simulated: BumpRecord = { ...attempt, outcome: 'simulated', mode: 'dry-run' };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [simulated],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('dry-run-only');
  });

  it('🔴 alarms on a SUBMITTED but unconfirmed bump — the ledger has not agreed', () => {
    const submitted: BumpRecord = {
      ...attempt,
      outcome: 'submitted',
      mode: 'live',
      signer,
      transactionHash: 'pending',
    };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [submitted],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('submitted-unconfirmed');
  });

  it('🔴 alarms on a failed bump, and says so specifically', () => {
    const failed: BumpRecord = {
      ...attempt,
      outcome: 'failed',
      mode: 'live',
      error: { code: 'tx_insufficient_balance', message: 'underfunded' },
    };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [failed],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('bump-failed');
  });

  it('🔴 alarms when a watched entry could not be OBSERVED at all', () => {
    // Unknown must never collapse into fine.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(undefined) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('not-observed');
  });

  it('🔴 alarms when an RPC error hid an entry entirely', () => {
    const v = assertLiveness({
      scan: scan({}, [
        { kind: 'rpc-error', contracts: ['CONTRACT_A'], entryKey: KEY, message: 'timeout' },
      ]),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('not-observed');
  });

  it('does not double-report an entry that was both observed and mentioned in an issue', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }, [
        { kind: 'entry-not-found', contracts: ['CONTRACT_A'], entryKey: KEY, message: 'absent' },
      ]),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.findings).toHaveLength(1);
  });
});

describe('assertLiveness — a record for the WRONG entry is not cover', () => {
  it('🔴 alarms when the only confirmed bump belongs to a different entry', () => {
    // The dangerous version of "something got bumped, so we are fine".
    const other: BumpRecord = { ...succeeded, entryKey: 'AAAAB090aGVyS2V5' };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [other],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.reason).toBe('no-action-recorded');
  });
});

describe('assertLiveness — blast radius', () => {
  it('alarms ONCE for a shared entry but names every contract it takes down', () => {
    const contracts = ['CONTRACT_A', 'CONTRACT_B', 'CONTRACT_C'];
    const v = assertLiveness({
      scan: scan({ [SHARED]: { ...entry(100, contracts), kind: 'code', endBehavior: 'archived' } }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]?.contracts).toEqual(contracts);
  });
});

describe('assertLiveness — reporting', () => {
  it('reports the most informative reason when several records exist', () => {
    const simulated: BumpRecord = { ...attempt, outcome: 'simulated', mode: 'dry-run' };
    const failed: BumpRecord = {
      ...attempt,
      outcome: 'failed',
      mode: 'live',
      error: { code: 'e', message: 'm' },
    };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [simulated, failed],
    });
    expect(v.findings[0]?.reason).toBe('bump-failed');
  });

  it('produces a printable detail carrying no raw error text', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.findings[0]?.detail).toContain('recorded no action');
    expect(v.findings[0]?.detail).not.toMatch(/Error:|at .*\.ts:/);
  });

  it('refuses a nonsensical threshold rather than silently permitting everything', () => {
    expect(() =>
      assertLiveness({
        scan: scan({ [KEY]: entry(100) }),
        thresholds: { bumpWhenRemainingLedgersBelow: -1 },
        records: [],
      }),
    ).toThrow();
  });
});

describe("assertLiveness — guinea-pig B's Sunday, simulated", () => {
  // The scenario the task was written from, run end to end rather than argued
  // about. B crosses threshold ~2026-09-20 12:00 UTC, unattended. A 15-minute
  // cron produces 96 runs in the surrounding 24 hours. `claim()` returns null
  // every time, which is its ORDINARY behaviour, so every run does nothing.
  const RUNS = 96;
  const LEDGERS_PER_RUN = 180; // 15 min at 5 s/ledger
  const THRESHOLD = 17_280; // 24 h

  function runsAcrossTheWindow(): { isAlarm: boolean; reason?: string }[] {
    const out: { isAlarm: boolean; reason?: string }[] = [];
    // Start comfortably above threshold and decay past it mid-window.
    let remaining = THRESHOLD + (RUNS / 2) * LEDGERS_PER_RUN;
    for (let i = 0; i < RUNS; i += 1) {
      const v = assertLiveness({
        scan: scan({ [KEY]: entry(remaining, ['GUINEA_PIG_B']) }),
        thresholds: { bumpWhenRemainingLedgersBelow: THRESHOLD },
        records: [], // claim() returned null — the ordinary skip path
      });
      out.push({ isAlarm: v.isAlarm, reason: v.findings[0]?.reason });
      remaining -= LEDGERS_PER_RUN;
    }
    return out;
  }

  it('turns ~48 silent successes into ~48 alarms, and not one before the crossing', () => {
    const results = runsAcrossTheWindow();
    const quiet = results.filter((r) => !r.isAlarm).length;
    const alarms = results.filter((r) => r.isAlarm).length;

    expect(quiet + alarms).toBe(RUNS);
    // 49 quiet, not 48: the run that lands EXACTLY on the threshold is still
    // healthy, because the rule is "below", not "at or below". Same inclusive
    // boundary as remainingLedgers === 0 being live, one layer up. Asserting a
    // round 48/48 here would have been asserting a bug.
    expect(quiet).toBe(49);
    expect(alarms).toBe(47);
    // And once it fires it must not stop firing — a single alert is missable.
    const firstAlarm = results.findIndex((r) => r.isAlarm);
    expect(results.slice(firstAlarm).every((r) => r.isAlarm)).toBe(true);
    expect(results[firstAlarm]?.reason).toBe('no-action-recorded');
  });

  it('stays silent for all 96 runs when the engine actually did its job', () => {
    // The other direction: the same window with a confirmed bump must not cry
    // wolf, or the alarm gets muted and the whole mechanism is worthless.
    const results: boolean[] = [];
    let remaining = THRESHOLD + (RUNS / 2) * LEDGERS_PER_RUN;
    for (let i = 0; i < RUNS; i += 1) {
      const bumped = remaining < THRESHOLD;
      const v = assertLiveness({
        scan: scan({ [KEY]: entry(bumped ? 518_400 : remaining, ['GUINEA_PIG_B']) }),
        thresholds: { bumpWhenRemainingLedgersBelow: THRESHOLD },
        records: bumped ? [{ ...succeeded, entryKey: KEY }] : [],
      });
      results.push(v.isAlarm);
      remaining -= LEDGERS_PER_RUN;
    }
    expect(results.some(Boolean)).toBe(false);
  });
});
