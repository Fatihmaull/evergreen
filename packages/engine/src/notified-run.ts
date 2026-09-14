import type { EngineExecutionResult } from './execution.js';
import type { EmailDeliveryResult } from './email-channel.js';
import { EmailDeliveryError } from './email-channel.js';
import { assertRunId, planRunAlerts, runFailureAlert, safeRunCode } from './alerts.js';
import type { PlannedAlert, AlertStage } from './alerts.js';

export class RunStageError extends Error {
  constructor(
    readonly stage: AlertStage,
    readonly code: string,
  ) {
    super(code);
  }
}
export type AlertReceipt = { readonly id: string } & (
  | EmailDeliveryResult
  | {
      readonly status: 'failed';
      readonly code: string;
      readonly classification: 'rejected' | 'unknown';
    }
);
export interface RunFailure {
  readonly stage: AlertStage;
  readonly code: string;
}
export interface RunJournal {
  start(runId: string): Promise<void>;
  execution(value: { execution?: EngineExecutionResult; runFailure?: RunFailure }): Promise<void>;
  intent(alert: PlannedAlert): Promise<void>;
  receipt(receipt: AlertReceipt): Promise<void>;
}
export interface AlertDelivery {
  preflight(): Promise<void>;
  deliver(
    notification: PlannedAlert['notification'],
    eventId: string,
  ): Promise<EmailDeliveryResult>;
}
export interface NotifiedRun {
  readonly runId: string;
  readonly execution?: EngineExecutionResult;
  readonly runFailure?: RunFailure;
  readonly alertReceipts: readonly AlertReceipt[];
  readonly storageComplete: boolean;
  readonly exitCode: 0 | 1 | 2;
}
/** Executes once; mail failure is never a reason to execute the transaction again. */
export async function runWithAlerts(options: {
  runId: string;
  execute: () => Promise<EngineExecutionResult>;
  journal: RunJournal;
  delivery?: AlertDelivery;
  label?: string;
}): Promise<NotifiedRun> {
  assertRunId(options.runId);
  const { runId, journal, delivery } = options;
  const alertReceipts: AlertReceipt[] = [];
  let execution: EngineExecutionResult | undefined,
    runFailure: RunFailure | undefined,
    storageComplete = true;
  let stage: AlertStage = 'persist';
  let exitCode: 0 | 1 | 2;
  try {
    await journal.start(runId);
    stage = 'alerts';
    try {
      await delivery?.preflight();
    } catch {
      runFailure = { stage: 'alerts', code: 'ALERT_PREFLIGHT_FAILED' };
      stage = 'persist';
      await journal.execution({ runFailure });
      return { runId, runFailure, alertReceipts, storageComplete: true, exitCode: 2 };
    }
    try {
      stage = 'execute';
      execution = await options.execute();
      exitCode = execution.exitCode;
    } catch (error) {
      const code = error instanceof RunStageError ? error.code : 'RUN_FAILED';
      stage = error instanceof RunStageError ? error.stage : 'execute';
      // The event sanitizes codes; keep public result equally bounded.
      const safe = safeRunCode(code);
      runFailure = { stage, code: safe };
      exitCode = 2;
    }
    stage = 'persist';
    await journal.execution({
      ...(execution ? { execution } : {}),
      ...(runFailure ? { runFailure } : {}),
    });
    let alerts: readonly PlannedAlert[];
    try {
      alerts = execution
        ? planRunAlerts(runId, execution)
        : [runFailureAlert(runId, runFailure!.stage, runFailure!.code)];
    } catch {
      alerts = [runFailureAlert(runId, 'alerts', 'ALERT_PLAN_FAILED')];
      exitCode = 2;
    }
    for (const original of alerts) {
      const alert = options.label
        ? {
            ...original,
            notification: {
              ...original.notification,
              subject: `[${options.label.replace(/[\r\n]/g, ' ').slice(0, 80)}] ${original.notification.subject}`,
            },
          }
        : original;
      stage = 'persist';
      await journal.intent(alert);
      let receipt: AlertReceipt;
      try {
        stage = 'alerts';
        const result = delivery
          ? await delivery.deliver(alert.notification, alert.id)
          : {
              status: 'preview' as const,
              submitted: false as const,
              notification: alert.notification,
            };
        receipt = { id: alert.id, ...result };
      } catch (error) {
        receipt = {
          id: alert.id,
          status: 'failed',
          code: error instanceof EmailDeliveryError ? error.code : 'EMAIL_UNVERIFIED',
          classification: error instanceof EmailDeliveryError ? error.classification : 'unknown',
        };
        exitCode = 2;
      }
      alertReceipts.push(receipt);
      stage = 'persist';
      await journal.receipt(receipt);
    }
  } catch {
    exitCode = 2;
    storageComplete = stage !== 'persist';
    runFailure = { stage, code: stage === 'persist' ? 'STORAGE_FAILED' : 'ALERT_PREFLIGHT_FAILED' };
  }
  return {
    runId,
    ...(execution ? { execution } : {}),
    ...(runFailure ? { runFailure } : {}),
    alertReceipts,
    storageComplete,
    exitCode,
  };
}
