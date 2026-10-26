/** In-memory `WatchlistStore` for tests and local runs. Not for production: nothing persists. */
import {
  DAY_SECONDS,
  type AddOutcome,
  type AutopilotSettings,
  type NewWatchItem,
  type UpdateResult,
  type WatchNetwork,
  type WatchPatch,
  type WatchRecord,
  type WatchScope,
  type WatchlistStore,
} from './store.js';

interface Row {
  readonly userId: string;
  readonly network: WatchNetwork;
  readonly contractId: string;
  label?: string;
  scope: WatchScope;
  readonly addedAt: number;
  removedAt?: number;
  autopilot?: AutopilotSettings;
}

/** A job, as far as the watchlist cares: the status and whether it pulled. */
export interface MemoryJob {
  readonly userId: string;
  readonly network: WatchNetwork;
  readonly contractId: string;
  status: 'queued' | 'cancelled' | 'pulled';
}

export interface MemoryExtendNowUse {
  readonly userId: string;
  readonly network: WatchNetwork;
  readonly contractId: string;
  /** Unix seconds the pull confirmed. */
  readonly pulledAt: number;
}

export interface MemoryObservation {
  readonly network: WatchNetwork;
  readonly contractId: string;
  readonly observedAtLedger: number;
  readonly observedAt: number;
  readonly scan: unknown;
  readonly health: string;
}

const same = (r: Row, userId: string, network: WatchNetwork, contractId: string): boolean =>
  r.userId === userId && r.network === network && r.contractId === contractId;

export class MemoryWatchlistStore implements WatchlistStore {
  readonly rows: Row[] = [];
  readonly jobs: MemoryJob[] = [];
  readonly uses: MemoryExtendNowUse[] = [];
  readonly observations: MemoryObservation[] = [];

  private record(r: Row, now: number): WatchRecord {
    const used = this.uses.filter(
      (u) => same(r, u.userId, u.network, u.contractId) && u.pulledAt > now - DAY_SECONDS,
    );
    const latest = this.observations
      .filter((o) => o.network === r.network && o.contractId === r.contractId)
      .sort((a, b) => b.observedAtLedger - a.observedAtLedger)[0];
    return {
      network: r.network,
      contractId: r.contractId,
      ...(r.label === undefined ? {} : { label: r.label }),
      addedAt: r.addedAt,
      scope: r.scope,
      ...(r.autopilot === undefined ? {} : { autopilot: r.autopilot }),
      extendNow: {
        usedToday: used.length,
        ...(used.length === 0 ? {} : { oldestUseAt: Math.min(...used.map((u) => u.pulledAt)) }),
      },
      lastObservation: latest === undefined ? null : { ...latest },
    };
  }

  list(userId: string, now: number): Promise<readonly WatchRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.userId === userId && r.removedAt === undefined)
        .sort(
          (a, b) =>
            a.addedAt - b.addedAt ||
            (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0),
        )
        .map((r) => this.record(r, now)),
    );
  }

  get(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    now: number,
  ): Promise<WatchRecord | undefined> {
    const row = this.rows.find(
      (r) => same(r, userId, network, contractId) && r.removedAt === undefined,
    );
    return Promise.resolve(row === undefined ? undefined : this.record(row, now));
  }

  add(userId: string, item: NewWatchItem, now: number): Promise<AddOutcome> {
    const row = this.rows.find((r) => same(r, userId, item.network, item.contractId));
    if (row === undefined) {
      this.rows.push({
        userId,
        network: item.network,
        contractId: item.contractId,
        ...(item.label === undefined ? {} : { label: item.label }),
        scope: item.scope,
        addedAt: now,
      });
      return Promise.resolve('created');
    }
    if (row.removedAt === undefined) return Promise.resolve('existing');
    delete row.removedAt; // old label, scope and budget stay; autopilot is already off
    return Promise.resolve('restored');
  }

  update(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    patch: WatchPatch,
  ): Promise<UpdateResult> {
    const row = this.rows.find(
      (r) => same(r, userId, network, contractId) && r.removedAt === undefined,
    );
    if (row === undefined) return Promise.resolve('not-found');
    // Deliberately no wallet-ownership check here: the route owns that guard,
    // and the Postgres store enforces it again in SQL. A fake that also checked
    // would hide a route that forgot to.
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.scope !== undefined) row.scope = patch.scope;
    if (patch.autopilot?.enabled === true) {
      const a = patch.autopilot;
      row.autopilot = {
        payerWallet: a.payerWallet,
        thresholdLedgers: a.thresholdLedgers,
        extendToLedgers: a.extendToLedgers,
        perJobMaxStroops: a.perJobMaxStroops,
        per30DaysMaxStroops: a.per30DaysMaxStroops,
      };
    } else if (patch.autopilot?.enabled === false) {
      delete row.autopilot; // the payer is released with it, so the wallet can be unlinked
    }
    return Promise.resolve('updated');
  }

  remove(userId: string, network: WatchNetwork, contractId: string, now: number): Promise<boolean> {
    const row = this.rows.find(
      (r) => same(r, userId, network, contractId) && r.removedAt === undefined,
    );
    if (row === undefined) return Promise.resolve(false);
    for (const job of this.jobs) {
      if (same(row, job.userId, job.network, job.contractId) && job.status === 'queued') {
        job.status = 'cancelled';
      }
    }
    row.removedAt = now;
    delete row.autopilot;
    return Promise.resolve(true);
  }
}
