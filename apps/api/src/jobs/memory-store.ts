/**
 * In-memory `JobsStore` for tests. Same contract as the Postgres one: the
 * caller's rows only, newest first, keyset pages strictly older than `after`.
 * Tests seed it with `addJob` / `addLedgerRow`; the API itself never writes.
 */
import type {
  ExtendNowRequest,
  ExtendNowResult,
  Job,
  JobQuery,
  JobsStore,
  LedgerQuery,
  LedgerRow,
  Page,
  PageKey,
} from './store.js';

interface Held<T> {
  readonly userId: string;
  readonly us: bigint;
  readonly item: T;
}

const micros = (iso: string): bigint => BigInt(Date.parse(iso)) * 1000n;

/** Newest first: by time, then by id, both descending. */
function newerFirst<T>(a: Held<T>, b: Held<T>, id: (t: T) => string | bigint): number {
  if (a.us !== b.us) return a.us > b.us ? -1 : 1;
  const ia = id(a.item);
  const ib = id(b.item);
  return ia === ib ? 0 : ia > ib ? -1 : 1;
}

function olderThan<T>(
  h: Held<T>,
  after: PageKey | undefined,
  id: (t: T) => string | bigint,
  parse: (s: string) => string | bigint,
): boolean {
  if (after === undefined) return true;
  const t = BigInt(after.t);
  if (h.us !== t) return h.us < t;
  return id(h.item) < parse(after.id);
}

function pageOf<T>(held: Held<T>[], limit: number, id: (t: T) => string | bigint): Page<T> {
  const more = held.length > limit;
  const kept = held.slice(0, limit);
  const last = kept[kept.length - 1];
  return {
    items: kept.map((h) => h.item),
    next: more && last !== undefined ? { t: String(last.us), id: String(id(last.item)) } : null,
  };
}

const jobId = (j: Job): string => j.id;
const rowId = (r: LedgerRow): bigint => BigInt(r.id);

export class MemoryJobsStore implements JobsStore {
  private readonly jobs: Held<Job>[] = [];
  private readonly ledger: Held<LedgerRow>[] = [];
  /** `${userId} ${contractId}` → the item's autopilot payer, or null when autopilot is off. */
  private readonly items = new Map<string, string | null>();
  private readonly keys = new Map<string, { hash: string; jobId: string }>();
  private seq = 0;

  /** Seeds a live watch item, as `watch_items` would hold it. */
  setItem(userId: string, contractId: string, payer: string | null): void {
    this.items.set(`${userId} ${contractId}`, payer);
  }

  createExtendNow(userId: string, req: ExtendNowRequest): Promise<ExtendNowResult> {
    const key = this.keys.get(`${userId} ${req.idempotencyKey}`);
    if (key !== undefined) {
      const job = this.jobs.find((h) => h.item.id === key.jobId)?.item;
      if (job === undefined) throw new Error('key without job');
      return Promise.resolve(
        key.hash === req.requestHash ? { kind: 'existing', job } : { kind: 'key-reused' },
      );
    }
    const itemKey = `${userId} ${req.contractId}`;
    if (!this.items.has(itemKey)) return Promise.resolve({ kind: 'not-found' });
    const payer = this.items.get(itemKey);
    if (payer === null || payer === undefined) return Promise.resolve({ kind: 'autopilot-off' });
    const since = (req.now - 86_400) * 1_000_000;
    const counted = this.jobs.filter(
      (h) =>
        h.userId === userId &&
        h.item.contractId === req.contractId &&
        h.item.kind === 'extend-now' &&
        h.item.status !== 'preflight-failed' &&
        h.item.status !== 'cancelled' &&
        h.us > BigInt(since),
    );
    if (counted.length >= req.limitPerDay) {
      const oldest = counted.reduce((a, h) => (h.us < a ? h.us : a), counted[0]!.us);
      return Promise.resolve({
        kind: 'daily-limit',
        used: counted.length,
        resetsAt: Number(oldest / 1_000_000n) + 86_400,
      });
    }
    this.seq += 1;
    const at = new Date(req.now * 1000 + this.seq).toISOString();
    const job: Job = {
      id: `00000000-0000-4000-9000-${String(this.seq).padStart(12, '0')}`,
      network: 'testnet',
      contractId: req.contractId,
      kind: 'extend-now',
      payerWallet: payer,
      createdAt: at,
      updatedAt: at,
      status: 'queued',
      steps: {},
    };
    this.addJob(userId, job);
    this.keys.set(`${userId} ${req.idempotencyKey}`, { hash: req.requestHash, jobId: job.id });
    return Promise.resolve({ kind: 'created', job });
  }

  addJob(userId: string, job: Job): void {
    this.jobs.push({ userId, us: micros(job.createdAt), item: job });
  }

  /** The row belongs to whoever owns its job, as in Postgres. */
  addLedgerRow(row: LedgerRow): void {
    const owner = this.jobs.find((h) => h.item.id === row.jobId);
    if (owner === undefined) throw new Error(`fee_ledger row for unknown job ${row.jobId}`);
    this.ledger.push({ userId: owner.userId, us: micros(row.recordedAt), item: row });
  }

  listJobs(userId: string, q: JobQuery): Promise<Page<Job>> {
    const held = this.jobs
      .filter((h) => h.userId === userId)
      .filter((h) => q.contractId === undefined || h.item.contractId === q.contractId)
      .filter((h) => olderThan(h, q.after, jobId, (s) => s))
      .sort((a, b) => newerFirst(a, b, jobId));
    return Promise.resolve(pageOf(held, q.limit, jobId));
  }

  getJob(userId: string, id: string): Promise<Job | undefined> {
    return Promise.resolve(this.jobs.find((h) => h.userId === userId && h.item.id === id)?.item);
  }

  listLedger(userId: string, q: LedgerQuery): Promise<Page<LedgerRow>> {
    const held = this.ledger
      .filter((h) => h.userId === userId)
      .filter((h) => q.wallet === undefined || h.item.wallet === q.wallet)
      .filter((h) => q.contractId === undefined || h.item.contractId === q.contractId)
      .filter((h) => q.jobId === undefined || h.item.jobId === q.jobId)
      .filter((h) => olderThan(h, q.after, rowId, (s) => BigInt(s)))
      .sort((a, b) => newerFirst(a, b, rowId));
    return Promise.resolve(pageOf(held, q.limit, rowId));
  }
}
