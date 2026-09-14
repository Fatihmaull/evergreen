import { bumpSucceeded, bumpFailed } from '@evergreen-stellar/core';
import type { Notification } from '@evergreen-stellar/core';
import type { EngineExecutionResult } from './execution.js';

export interface PlannedAlert {
  readonly id: string;
  readonly kind: 'bump' | 'liveness' | 'run-failed' | 'missed-run';
  readonly entryKey?: string;
  readonly notification: Notification;
}
export type AlertStage = 'config' | 'execute' | 'persist' | 'alerts';
const SAFE_CODES = new Set([
  'RUN_FAILED',
  'CONFIG_FAILED',
  'WRONG_NETWORK',
  'RECORDER_UNAVAILABLE',
  'INVALID_PAYER',
  'INVALID_FEE_CAP',
  'SCAN_INCOMPLETE',
  'EXECUTION_INCOMPLETE',
  'RUN_DEADLINE',
  'RPC_TIMEOUT',
  'STORAGE_FAILED',
  'ALERT_PLAN_FAILED',
]);
export function assertRunId(id: string): void {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error('Invalid run ID');
}
export function safeRunCode(code: string): string {
  return SAFE_CODES.has(code) ? code : 'RUN_FAILED';
}

export function runFailureAlert(runId: string, stage: AlertStage, code: string): PlannedAlert {
  assertRunId(runId);
  const safe = safeRunCode(code);
  return {
    id: `${runId}:run-failed:${stage}`,
    kind: 'run-failed',
    notification: {
      severity: 'critical',
      subject: `[CRITICAL] Evergreen run failed (${stage})`,
      body: `Run: ${runId}\nStage: ${stage}\nCode: ${safe}\nNo successful bump is asserted by this alert. Inspect the saved run and any intent/hash before retrying. Do not submit a replacement blindly.`,
    },
  };
}
export function planRunAlerts(
  runId: string,
  run: Pick<EngineExecutionResult, 'records' | 'liveness' | 'diagnostics'>,
): readonly PlannedAlert[] {
  assertRunId(runId);
  const alerts: PlannedAlert[] = [];
  const seen = new Set<string>();
  const covered = new Set<string>();
  for (const record of run.records) {
    if (seen.has(record.entryKey)) throw new Error('Duplicate execution records');
    seen.add(record.entryKey);
    if (record.outcome === 'simulated') continue;
    covered.add(record.entryKey);
    const base = record.outcome === 'succeeded' ? bumpSucceeded(record) : bumpFailed(record);
    const severity =
      record.outcome === 'succeeded'
        ? 'info'
        : record.outcome === 'submitted'
          ? 'warn'
          : 'critical';
    alerts.push({
      id: `${runId}:bump:${record.entryKey}:${record.outcome}`,
      kind: 'bump',
      entryKey: record.entryKey,
      notification: {
        ...base,
        severity,
        subject: `[${severity.toUpperCase()}] ${record.outcome === 'succeeded' ? 'CONFIRMED ' : ''}${base.subject}`,
      },
    });
  }
  const findings = new Set<string>();
  for (const f of run.liveness.findings) {
    const key = JSON.stringify([f.entryKey, f.contracts, f.reason]);
    if (covered.has(f.entryKey) || findings.has(key)) continue;
    findings.add(key);
    alerts.push({
      id: `${runId}:liveness:${key}`,
      kind: 'liveness',
      entryKey: f.entryKey,
      notification: {
        severity: f.severity,
        subject: `[${f.severity.toUpperCase()}] Evergreen ${f.reason}: ${f.entryKey.slice(0, 12)}`,
        body: `Run: ${runId}\nContracts: ${f.contracts.join(', ')}\nEntry: ${f.entryKey}\n${f.detail}\nNext action: ${f.remediation}. No successful extension is claimed for this finding.`,
      },
    });
  }
  if (run.diagnostics.length && alerts.length === 0)
    alerts.push(runFailureAlert(runId, 'execute', run.diagnostics[0]!.code));
  return alerts;
}
