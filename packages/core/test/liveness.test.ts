import { describe, expect, it } from 'vitest';
import type {
  BumpRecord,
  LedgerEntryTTL,
  ScanIssue,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { assertLiveness } from '../src/liveness.js';
import { needsAction } from '../src/ttl.js';

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

  it('stays quiet one ledger ABOVE the threshold', () => {
    // The margin is untouched here, so there is nothing to say.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(17_281) }),
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

describe('assertLiveness — the threshold is a floor, not a line to sit on', () => {
  it('🔴 alarms when remaining is EXACTLY the threshold', () => {
    // Policy decided 2026-09-10: touching the margin is already the failure we
    // exist to prevent, so `<=` fires. This deliberately does NOT match the
    // inclusive TTL boundary, where zero is still live — see the comparison
    // block in ttl.ts. One is a protocol fact, this is a policy choice.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(17_280) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
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
    expect(v.findings[0]?.detail).toContain('recorded nothing for it');
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
    // 48/48. This number MOVED, and the move was a policy change, not a
    // loosened test: under the original `<` rule the split was 49/47, because
    // the run landing exactly on the threshold stayed quiet. On 2026-09-10 the
    // threshold was redefined as a floor we refuse to touch, so `<=` fires and
    // that boundary run now alarms. Both numbers were correct under their own
    // rule; do not "restore" 49/47 without reversing the policy in ttl.ts.
    expect(quiet).toBe(48);
    expect(alarms).toBe(48);
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
      // Derived from the rule itself, not restated as `<`. When the policy
      // moved from `<` to `<=`, a hand-written copy of it here silently
      // disagreed with the engine it was modelling — and this test caught it.
      const bumped = needsAction(remaining, THRESHOLD);
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

describe('assertLiveness — one bad entry among healthy ones', () => {
  it('🔴 alarms when a SINGLE entry needs action and everything else is fine', () => {
    // Confirming the requested property: health is not a majority vote.
    const v = assertLiveness({
      scan: scan({
        AAAAB0hlYWx0aHkx: entry(200_000, ['CONTRACT_A']),
        AAAAB0hlYWx0aHky: entry(180_000, ['CONTRACT_B']),
        [KEY]: entry(100, ['CONTRACT_C']),
        AAAAB0hlYWx0aHkz: entry(150_000, ['CONTRACT_D']),
      }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]?.entryKey).toBe(KEY);
  });

  it('🔴 one shared code entry at risk means every contract it serves is at risk', () => {
    // A, B and C share one ContractCode entry. Three healthy instances plus one
    // sick shared entry is not three-quarters healthy — it is N contracts down.
    const shared = { ...entry(100, ['A', 'B', 'C']), kind: 'code' as const };
    const v = assertLiveness({
      scan: scan({
        AAAAB0luc3RBAA: entry(200_000, ['A']),
        AAAAB0luc3RCAA: entry(200_000, ['B']),
        AAAAB0luc3RDAA: entry(200_000, ['C']),
        [SHARED]: shared,
      }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]?.contracts).toEqual(['A', 'B', 'C']);
    expect(v.severity).toBe('critical');
  });
});

describe('assertLiveness — expired is not the same as low', () => {
  it('🔴 sends an expired entry to RESTORE, not to extend', () => {
    // extendTTL cannot reach an archived entry. Someone acting under pressure
    // must not be pointed at the wrong operation.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(-5) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.isExpired).toBe(true);
    expect(v.findings[0]?.remediation).toBe('restore');
    expect(v.findings[0]?.detail).toContain('RestoreFootprintOp');
    expect(v.findings[0]?.detail).not.toContain('ledgers remain');
  });

  it('sends a merely-low entry to EXTEND', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.findings[0]?.isExpired).toBe(false);
    expect(v.findings[0]?.remediation).toBe('extend');
    expect(v.findings[0]?.detail).not.toContain('RestoreFootprintOp');
  });

  it('treats the entry on its final live ledger as low, not expired', () => {
    // remaining === 0 is still live (protocol), but it needs action (policy).
    // Both rules apply at once and they do not contradict each other.
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(0) }),
      thresholds: THRESHOLDS,
      records: [],
    });
    expect(v.isAlarm).toBe(true);
    expect(v.findings[0]?.isExpired).toBe(false);
    expect(v.findings[0]?.remediation).toBe('extend');
  });
});

describe('assertLiveness — severity grades the message, never the firing', () => {
  it('grades a dry-run as info but still fires it', () => {
    const simulated: BumpRecord = { ...attempt, outcome: 'simulated', mode: 'dry-run' };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [simulated],
    });
    expect(v.isAlarm).toBe(true); // never suppressed
    expect(v.findings[0]?.severity).toBe('info');
    expect(v.findings[0]?.detail).toContain('dry-run mode');
  });

  it('grades an unconfirmed submission as warn and words it as uncertainty', () => {
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
    expect(v.findings[0]?.severity).toBe('warn');
    expect(v.findings[0]?.detail).toContain('could not confirm');
    // Uncertainty, not failure — the run does not know either way.
    expect(v.findings[0]?.detail).not.toContain('failed');
  });

  it('grades a failure as critical and carries the underlying reason', () => {
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
    expect(v.findings[0]?.severity).toBe('critical');
    expect(v.findings[0]?.detail).toContain('underfunded');
  });

  it('🔴 grades a held claim as critical and names it — the Sunday scenario', () => {
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100) }),
      thresholds: THRESHOLDS,
      records: [],
      decisions: [
        {
          entryKey: KEY,
          contracts: ['CONTRACT_A'],
          reason: 'another run holds the claim',
          action: 'skip',
        },
      ],
    });
    expect(v.findings[0]?.reason).toBe('skipped');
    expect(v.findings[0]?.severity).toBe('critical');
    expect(v.findings[0]?.detail).toContain('holds the claim');
  });

  it('reports the loudest severity present across mixed findings', () => {
    const simulated: BumpRecord = { ...attempt, outcome: 'simulated', mode: 'dry-run' };
    const v = assertLiveness({
      scan: scan({ [KEY]: entry(100), AAAAB090aGVyMQ: entry(50, ['CONTRACT_B']) }),
      thresholds: THRESHOLDS,
      records: [simulated],
    });
    // One info dry-run and one critical silent skip must not average to warn.
    expect(v.severity).toBe('critical');
    expect(v.findings.map((f) => f.severity).sort()).toEqual(['critical', 'info']);
  });
});
