/**
 * Per-tenant run journal (PH2-E4-01). In-memory for now: a durable journal needs a migration and
 * lands with the money flow (PH2-E4-02). A journal failure never aborts a run; the runner turns it
 * into a run warning.
 */
import type { TenantRunStatus } from './tenant-run.js';

export interface TenantJournalEntry {
  readonly runId: string;
  readonly payerAccount: string;
  readonly status: TenantRunStatus;
  readonly errorCode?: string;
  readonly at: Date;
}

export interface TenantJournal {
  record(entry: TenantJournalEntry): Promise<void>;
}

export class MemoryTenantJournal implements TenantJournal {
  readonly entries: TenantJournalEntry[] = [];
  async record(entry: TenantJournalEntry): Promise<void> {
    this.entries.push(entry);
  }
}
