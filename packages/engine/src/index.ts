/** Scheduled execution adapters; the existing core decision pass remains read-only. */
export { runEngineExecution, EngineExecutionError } from './execution.js';
export type {
  EngineExecutionDependencies,
  EngineExecutionOptions,
  EngineExecutionResult,
  SubmissionIntent,
  SubmissionRecorder,
} from './execution.js';

export { runEngineCommand } from './command.js';
export type { EngineCommandDependencies } from './command.js';

export {
  EmailChannel,
  EmailDeliveryError,
  previewBumpNotification,
  bumpNotificationEventId,
} from './email-channel.js';
export type { EmailChannelOptions, EmailDeliveryResult } from './email-channel.js';
export { runEmailCommand } from './email-command.js';
export type { EmailCommandDependencies } from './email-command.js';
export { parseNotificationRecord, NotificationRecordError } from './notification-record.js';

export { planRunAlerts, runFailureAlert, assertRunId } from './alerts.js';
export type { PlannedAlert, AlertStage } from './alerts.js';

export { runWithAlerts, RunStageError } from './notified-run.js';
export type { NotifiedRun, RunJournal, AlertReceipt, AlertDelivery } from './notified-run.js';

export { assessScheduler, schedulerNotification } from './scheduler-watch.js';
export type { WatchPolicy, JobObservation, SchedulerAssessment } from './scheduler-watch.js';
