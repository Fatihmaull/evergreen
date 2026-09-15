import { describe, it, expect } from 'vitest';
import { planRunAlerts, runFailureAlert } from '../src/alerts.js';
import { success, submitted, simulated } from './email-fixtures.js';
import type { LivenessFinding } from '@evergreen-stellar/core';
const finding: LivenessFinding = {
  entryKey: 'shared-code',
  contracts: success.contracts,
  reason: 'skipped',
  severity: 'critical',
  remediation: 'extend',
  isExpired: false,
  detail: 'REFUSED BY WRITE GUARD',
};
describe('run alert truth', () => {
  it('preserves successful A and a separate protected-key alarm', () => {
    const a = planRunAlerts('run-1', {
      records: [success],
      liveness: { isAlarm: true, findings: [finding] },
      diagnostics: [],
    });
    expect(a.map((x) => x.kind)).toEqual(['bump', 'liveness']);
    expect(a[0]?.notification.subject).toContain('CONFIRMED');
    expect(a[1]?.notification.subject).toContain('CRITICAL');
  });
  it('does not duplicate a record with its liveness finding or call submitted success', () => {
    const a = planRunAlerts('run-1', {
      records: [submitted],
      liveness: {
        isAlarm: true,
        findings: [
          {
            ...finding,
            entryKey: submitted.entryKey,
            reason: 'submitted-unconfirmed',
            severity: 'warn',
          },
        ],
      },
      diagnostics: [],
    });
    expect(a).toHaveLength(1);
    expect(a[0]?.notification.subject).toContain('UNCONFIRMED');
    expect(a[0]?.notification.severity).toBe('warn');
  });
  it('reports dry-run liveness honestly without fabricating a bump success', () => {
    const a = planRunAlerts('run-1', {
      records: [simulated],
      liveness: {
        isAlarm: true,
        findings: [
          { ...finding, entryKey: simulated.entryKey, reason: 'dry-run-only', severity: 'info' },
        ],
      },
      diagnostics: [],
    });
    expect(a[0]?.kind).toBe('liveness');
    expect(a[0]?.notification.subject).toContain('INFO');
  });
  it('has stable event IDs and rejects duplicate records', () => {
    const input = {
      records: [success],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [],
    };
    expect(planRunAlerts('same', input)).toEqual(planRunAlerts('same', input));
    expect(() => planRunAlerts('same', { ...input, records: [success, success] })).toThrow(
      /duplicate/i,
    );
  });
  it('creates a run failure without a fake bump or provider detail', () => {
    const a = runFailureAlert('run-1', 'execute', 'Bearer private-url');
    expect(a.kind).toBe('run-failed');
    expect(JSON.stringify(a)).not.toContain('Bearer');
    expect(a.notification.body).toContain('No successful bump is asserted');
  });
  /**
   * The exact case measured on 2026-09-14 while reviewing #142:
   * `records:[success], diagnostics:[RPC_TIMEOUT]` returned `["bump"]` and
   * nothing else, so a run-level failure was silent whenever anything else
   * alerted.
   *
   * This is the dangerous ordering, not a corner case. `runEngineExecution`
   * pushes EXECUTION_INCOMPLETE and then breaks out of the loop, so entries
   * bumped before the stop have already produced success alerts. The operator
   * heard about the bumps that worked and never heard that the run stopped with
   * a possibly-submitted hash to reconcile.
   */
  it('🔴 alerts a run-level diagnostic even when a bump already alerted', () => {
    const a = planRunAlerts('run-1', {
      records: [success],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [{ code: 'RPC_TIMEOUT', message: 'timed out' }],
    });
    expect(a.map((x) => x.kind)).toEqual(['bump', 'run-failed']);
    expect(a[1]?.notification.severity).toBe('critical');
    expect(a[1]?.notification.body).toContain('RPC_TIMEOUT');
  });

  it('🔴 alerts the stop when execution breaks after a successful entry', () => {
    const a = planRunAlerts('run-1', {
      records: [success],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [{ code: 'EXECUTION_INCOMPLETE', message: 'stopped' }],
    });
    expect(a.some((x) => x.kind === 'run-failed')).toBe(true);
    expect(JSON.stringify(a)).toContain('EXECUTION_INCOMPLETE');
  });

  it('gives each diagnostic its own event id, and does not fan out duplicates', () => {
    const a = planRunAlerts('run-1', {
      records: [],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [
        { code: 'RPC_TIMEOUT', message: 'x' },
        { code: 'SCAN_INCOMPLETE', message: 'y' },
        { code: 'RPC_TIMEOUT', message: 'again' },
      ],
    });
    // Two distinct codes, not three alerts — and distinct ids, because the
    // journal names files by a hash of the id and a collision would overwrite.
    expect(a).toHaveLength(2);
    expect(new Set(a.map((x) => x.id)).size).toBe(2);
  });

  it('still sanitizes a diagnostic code rather than trusting it', () => {
    const a = planRunAlerts('run-1', {
      records: [],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [{ code: 'Bearer private-token', message: 'leaky' }],
    });
    expect(JSON.stringify(a)).not.toContain('Bearer');
    expect(JSON.stringify(a)).toContain('RUN_FAILED');
  });
  /**
   * Dedupe must key on the SANITIZED code, not the raw one.
   *
   * Found by a surviving mutant. Replacing `safeRunCode(diagnostic.code)` with
   * the raw code leaves every other test green, because `runFailureAlert`
   * sanitizes again internally — the two calls are redundant for keeping
   * provider text out of an email, and removing both does fail.
   *
   * They are not redundant for deduplication. Two different unknown codes both
   * collapse to RUN_FAILED, so keying on the raw code emits two alerts carrying
   * one id. The journal names files by a hash of that id and creates them with
   * `wx`, so the second write throws EEXIST and a diagnostic turns into a
   * STORAGE_FAILED — the alert lost, and the run misreported as a storage fault.
   */
  it('🔴 keys deduplication on the sanitized code, so ids cannot collide', () => {
    const a = planRunAlerts('run-1', {
      records: [],
      liveness: { isAlarm: false, findings: [] },
      diagnostics: [
        { code: 'Bearer aaa', message: 'x' },
        { code: 'Bearer bbb', message: 'y' },
      ],
    });
    expect(a).toHaveLength(1);
    expect(a.length).toBe(new Set(a.map((x) => x.id)).size);
  });
});

it('keeps opted-in temporary urgency when a submitted record covers liveness', () => {
  const alerts = planRunAlerts('temporary-unconfirmed', {
    records: [submitted],
    diagnostics: [],
    liveness: {
      isAlarm: true,
      severity: 'critical',
      findings: [
        {
          ...finding,
          entryKey: submitted.entryKey,
          reason: 'submitted-unconfirmed',
          temporaryRetention: true,
          detail: 'Temporary data is DELETED at expiry; no restore.',
        },
      ],
    },
  });
  expect(alerts).toHaveLength(1);
  expect(alerts[0]?.notification.severity).toBe('critical');
  expect(alerts[0]?.notification.body).toContain('DELETED');
  expect(alerts[0]?.notification.subject).toContain('UNCONFIRMED');
});
