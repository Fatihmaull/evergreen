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
});
