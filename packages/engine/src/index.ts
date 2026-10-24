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
export {
  TelegramChannel,
  TelegramDeliveryError,
  telegramText,
  TELEGRAM_TEXT_LIMIT,
} from './telegram-channel.js';
export type { TelegramChannelOptions, TelegramDeliveryResult } from './telegram-channel.js';
export { WebhookChannel, WebhookDeliveryError } from './webhook-channel.js';
export type { WebhookChannelOptions, WebhookDeliveryResult } from './webhook-channel.js';
export { planTenants, checkBudget, isEligible, spendKey } from './tenants.js';
export type {
  AutopilotItemRow,
  BudgetVerdict,
  TenantItem,
  TenantNetwork,
  TenantPlan,
} from './tenants.js';
export { MemoryTenantStore, planTenantsFromStore } from './tenant-store.js';
export type { MemorySpendEntry, TenantStore } from './tenant-store.js';
export {
  PgTenantStore,
  TenantStoreError,
  LIST_AUTOPILOT_ITEMS_SQL,
  SPENT_LAST_30D_SQL,
} from './pg-tenant-store.js';
export type { TenantQuery } from './pg-tenant-store.js';
export { SPENT_LAST_30D_BATCH_SQL } from './pg-tenant-store.js';
export {
  runTenantPlan,
  tenantConfigs,
  TESTNET_PASSPHRASE,
  DEFAULT_TENANT_DEADLINE_MS,
} from './tenant-run.js';
export type {
  TenantErrorCode,
  TenantItemResult,
  TenantRunDeps,
  TenantRunReport,
  TenantRunResult,
  TenantRunStatus,
} from './tenant-run.js';
export { MemoryTenantJournal } from './tenant-journal.js';
export type { TenantJournal, TenantJournalEntry } from './tenant-journal.js';
