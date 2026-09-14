import { describe, it, expect, vi } from 'vitest';
import { runWithAlerts } from '../src/notified-run.js';
import { success } from './email-fixtures.js';
import type { EngineExecutionResult } from '../src/execution.js';
const execution: EngineExecutionResult = {
  mode: 'live',
  preview: {
    mode: 'dry-run',
    scan: { network: 'testnet', entries: {}, contracts: [], issues: [] },
    decisions: [],
    liveness: { isAlarm: false, findings: [] },
    health: { byEntry: {}, thresholdsByEntry: {} },
  },
  records: [success],
  decisions: [],
  previews: [],
  refreshes: [],
  liveness: { isAlarm: false, findings: [] },
  feesByPayer: {},
  warnings: [],
  diagnostics: [],
  unattempted: [],
  ok: true,
  exitCode: 0,
};
function setup() {
  const order: string[] = [];
  const journal = {
    start: vi.fn(async () => {
      order.push('start');
    }),
    execution: vi.fn(async () => {
      order.push('execution');
    }),
    intent: vi.fn(async () => {
      order.push('intent');
    }),
    receipt: vi.fn(async () => {
      order.push('receipt');
    }),
  };
  const execute = vi.fn(async () => {
    order.push('execute');
    return execution;
  });
  const delivery = {
    preflight: vi.fn(async () => {
      order.push('preflight');
    }),
    deliver: vi.fn(async () => {
      order.push('deliver');
      return {
        status: 'accepted' as const,
        submitted: true as const,
        emailId: 'fixture-id',
        receivedInInbox: 'unverified' as const,
      };
    }),
  };
  return { order, journal, execute, delivery };
}
describe('notified execution boundary', () => {
  it('persists results and alert intent before send', async () => {
    const s = setup();
    const r = await runWithAlerts({ runId: 'test', ...s });
    expect(r.exitCode).toBe(0);
    expect(s.order).toEqual([
      'start',
      'preflight',
      'execute',
      'execution',
      'intent',
      'deliver',
      'receipt',
    ]);
  });
  it('preserves successful transaction when email fails and never executes twice', async () => {
    const s = setup();
    s.delivery.deliver.mockRejectedValue(new Error('private provider detail'));
    const r = await runWithAlerts({ runId: 'test', ...s });
    expect(r.execution?.records[0]).toEqual(success);
    expect(r.exitCode).toBe(2);
    expect(s.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toContain('private provider');
  });
  it('previews without a delivery dependency', async () => {
    const s = setup();
    const r = await runWithAlerts({ runId: 'test', execute: s.execute, journal: s.journal });
    expect(r.alertReceipts[0]?.status).toBe('preview');
    expect(s.delivery.deliver).not.toHaveBeenCalled();
  });
  it('alerts a thrown execution failure without fabricating a bump record', async () => {
    const s = setup();
    s.execute.mockRejectedValue(new Error('private RPC URL'));
    const r = await runWithAlerts({ runId: 'test', ...s });
    expect(r.execution).toBeUndefined();
    expect(r.runFailure?.stage).toBe('execute');
    expect(s.delivery.deliver).toHaveBeenCalledOnce();
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r)).not.toContain('private RPC');
  });
  it('does not execute if storage or delivery preflight fails', async () => {
    for (const step of ['start', 'preflight']) {
      const s = setup();
      (step === 'start' ? s.journal.start : s.delivery.preflight).mockRejectedValue(
        new Error('unavailable'),
      );
      const r = await runWithAlerts({ runId: 'test', ...s });
      expect(r.exitCode).toBe(2);
      expect(s.execute).not.toHaveBeenCalled();
      expect(s.delivery.deliver).not.toHaveBeenCalled();
    }
  });
  it('does not send without a saved intent, retaining execution truth', async () => {
    const s = setup();
    s.journal.intent.mockRejectedValue(new Error('disk full'));
    const r = await runWithAlerts({ runId: 'test', ...s });
    expect(r.execution).toEqual(execution);
    expect(r.storageComplete).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(s.delivery.deliver).not.toHaveBeenCalled();
  });
  it('persists an alert preflight failure before returning', async () => {
    const s = setup();
    s.delivery.preflight.mockRejectedValue(new Error('invalid sink'));
    const r = await runWithAlerts({ runId: 'test', ...s });
    expect(s.journal.execution).toHaveBeenCalledWith({
      runFailure: { stage: 'alerts', code: 'ALERT_PREFLIGHT_FAILED' },
    });
    expect(r.storageComplete).toBe(true);
    expect(s.execute).not.toHaveBeenCalled();
  });
});
