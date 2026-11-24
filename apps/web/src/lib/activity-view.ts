/**
 * Activity (components.md § "Dashboard revamp", Activity): the engine's jobs
 * for this account and their fee-ledger rows, from `GET /jobs` and
 * `GET /ledger` (docs/API.md §7, PH2-E2-08). Pure: the page script fetches,
 * this draws.
 *
 * Honesty rules held here:
 * - Rent and fee come from the ledger's own rows (`rent`, `evergreen-fee`),
 *   never from a simulation. A job with no such row shows an em dash, not 0.
 * - `extended` can carry a margin refund (the unused part of the pull): that
 *   is the normal case, not a failure. `refunded` means the extend failed and
 *   the whole pull, fee included, went back (CEF, 2026-11-24).
 * - The 30-day facts are drawn only when every row of those 30 days was read;
 *   otherwise they say *not yet available*.
 * - Only jobs have a source. Allowance and watchlist events have none yet, so
 *   this page has no pills for them.
 */
import { esc, formatCount, short } from './format';
import { NOT_YET_AVAILABLE } from './overview-view';

export type JobStatus =
  'queued' | 'preflight-failed' | 'cancelled' | 'pulled' | 'extended' | 'refunded' | 'failed';

export interface ApiJob {
  readonly id: string;
  readonly contractId: string;
  readonly kind: 'extend-now' | 'autopilot';
  readonly payerWallet?: string;
  readonly createdAt: string;
  readonly status: JobStatus;
  readonly steps: {
    readonly preflight?: { at: string; ok: boolean; reason?: string; rentStroops?: string };
    readonly pull?: { at: string; txHash: string; amountStroops?: string };
    readonly extendTx?: { txHash: string; rentChargedStroops: string | null };
    readonly refund?: { at?: string; txHash: string; amountStroops?: string };
  };
}

export interface ApiLedgerRow {
  readonly id: string;
  readonly jobId: string;
  readonly kind: 'pull' | 'rent' | 'network-fee' | 'evergreen-fee' | 'refund' | 'difference';
  readonly amountStroops: string;
  readonly txHash: string | null;
  readonly recordedAt: string;
}

export const DAY_MS = 86_400_000;
const NONE = '<span class="none">—</span>';
const TX = (hash: string): string =>
  `<a class="mono" href="https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(hash)}" rel="noopener" target="_blank">${esc(short(hash, 4, 4))}</a>`;

const n = (stroops: string | bigint): string => formatCount(BigInt(stroops));

/** The sums of one job's ledger rows by kind. A kind with no row is absent, not zero. */
export type Money = Partial<Record<ApiLedgerRow['kind'], bigint>>;

export function moneyByJob(rows: readonly ApiLedgerRow[]): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const r of rows) {
    if (!/^\d+$/.test(r.amountStroops)) continue;
    const m = out.get(r.jobId) ?? {};
    m[r.kind] = (m[r.kind] ?? 0n) + BigInt(r.amountStroops);
    out.set(r.jobId, m);
  }
  return out;
}

const EVENT: Record<ApiJob['kind'], string> = {
  autopilot: 'Autopilot extend',
  'extend-now': 'Extend now',
};

/** The UTC stamp of a row: `Nov 23 13:30`. Mono in the table. */
export function when(iso: string): string {
  const d = new Date(iso);
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mon} ${d.getUTCDate()} ${hh}:${mm}`;
}

export type ActivityFilter = 'all' | 'extends' | 'failed';
const FAILED: ReadonlySet<JobStatus> = new Set(['preflight-failed', 'failed', 'refunded']);
const IN_FLIGHT: ReadonlySet<JobStatus> = new Set(['queued', 'pulled']);

export function matches(job: ApiJob, f: ActivityFilter): boolean {
  if (f === 'extends') return job.status === 'extended';
  if (f === 'failed') return FAILED.has(job.status);
  return true;
}

export function statusHtml(status: JobStatus): string {
  switch (status) {
    case 'extended':
      return 'extended';
    case 'preflight-failed':
      return '<span class="chip critical"><span class="shape"></span>pre-flight failed</span>';
    case 'failed':
      return '<span class="chip critical"><span class="shape"></span>failed</span>';
    case 'refunded':
      return '<span class="chip warning"><span class="shape"></span>refunded</span>';
    case 'cancelled':
      return 'cancelled';
    default:
      return '<span class="chip undetermined"><span class="shape"></span>in progress</span>';
  }
}

/** The panel's chip: the same words, with `extended` as a fact chip. */
function panelStatus(status: JobStatus): string {
  return status === 'extended'
    ? '<span class="chip healthy"><span class="shape"></span>extended</span>'
    : statusHtml(status);
}

export interface Facts {
  readonly jobs: readonly ApiJob[];
  readonly ledger: readonly ApiLedgerRow[];
  /** True only when the reads reached past the 30-day edge (or the end of history). */
  readonly complete: boolean;
}

export function factsHtml(f: Facts, now = new Date()): string {
  const cell = (k: string, v: string, s: string): string =>
    `<div class="fact-cell"><p class="k">${k}</p><p class="v">${v}</p><p class="s">${s}</p></div>`;
  if (!f.complete) {
    const na = `<span class="unavailable">${NOT_YET_AVAILABLE}</span>`;
    return [
      cell('Extends, 30 days', na, ''),
      cell('Rent charged', na, ''),
      cell('Evergreen fee', na, ''),
      cell('Refunded', na, ''),
    ].join('');
  }
  const since = now.getTime() - 30 * DAY_MS;
  const recent = f.jobs.filter((j) => Date.parse(j.createdAt) >= since && j.status === 'extended');
  const auto = recent.filter((j) => j.kind === 'autopilot').length;
  const sum = (kind: ApiLedgerRow['kind']): bigint =>
    f.ledger
      .filter(
        (r) =>
          r.kind === kind && Date.parse(r.recordedAt) >= since && /^\d+$/.test(r.amountStroops),
      )
      .reduce((a, r) => a + BigInt(r.amountStroops), 0n);
  return [
    cell(
      'Extends, 30 days',
      esc(formatCount(recent.length)),
      `${formatCount(auto)} autopilot, ${formatCount(recent.length - auto)} manual`,
    ),
    cell('Rent charged', esc(n(sum('rent'))), 'stroops'),
    cell('Evergreen fee', esc(n(sum('evergreen-fee'))), 'stroops'),
    cell('Refunded', esc(n(sum('refund'))), 'stroops, returned on chain'),
  ].join('');
}

export function filtersHtml(jobs: readonly ApiJob[], active: ActivityFilter): string {
  const pills: [ActivityFilter, string][] = [
    ['all', 'All'],
    ['extends', 'Extends'],
    ['failed', 'Failed'],
  ];
  return pills
    .map(([f, label]) => {
      const on = f === active;
      const count = f === 'failed' ? jobs.filter((j) => matches(j, f)).length : undefined;
      return `<a class="filter${on ? ' active' : ''}" href="?${f === 'all' ? '' : `show=${f}`}" data-filter="${f}"${on ? ' aria-current="true"' : ''}>${label}${
        count === undefined || count === 0 ? '' : ` <span class="mono">${formatCount(count)}</span>`
      }</a>`;
    })
    .join('');
}

export type Labels = ReadonlyMap<string, string>;
const nameOf = (labels: Labels, id: string): string => labels.get(id) ?? short(id, 4, 4);

export function listHtml(
  jobs: readonly ApiJob[],
  money: ReadonlyMap<string, Money>,
  labels: Labels,
  openId?: string,
): string {
  const body = jobs
    .map((j) => {
      const m = money.get(j.id) ?? {};
      const fig = (v: bigint | undefined): string =>
        v === undefined
          ? `<td class="num hide-m">${NONE}</td>`
          : `<td class="num mono hide-m">${esc(n(v))}</td>`;
      return `<tr data-open="${esc(j.id)}" tabindex="0"${j.id === openId ? ' class="open" aria-current="true"' : ''}>
        <td class="mono muted-cell nowrap">${esc(when(j.createdAt))}</td>
        <td>${esc(nameOf(labels, j.contractId))}</td>
        <td>${EVENT[j.kind]}${
          j.status === 'extended' ? '' : `<span class="only-m"><br />${statusHtml(j.status)}</span>`
        }</td>
        ${fig(m.rent)}
        ${fig(m['evergreen-fee'])}
        <td class="hide-m">${statusHtml(j.status)}</td>
      </tr>`;
    })
    .join('');
  return `<table class="list activity">
      <thead><tr><th scope="col">When (UTC)</th><th scope="col">Contract</th><th scope="col">Event</th><th scope="col" class="num hide-m">Rent</th><th scope="col" class="num hide-m">Fee</th><th scope="col" class="hide-m">Status</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** `PreflightReason` in packages/core/src/hosted-job.ts, in words. An unknown one is shown as stored. */
const PREFLIGHT_REASON: Record<string, string> = {
  'not-testnet': 'not a testnet contract',
  'simulation-failed': 'the extend could not be simulated',
  'margin-unset': 'the engine’s retry margin is not set',
  budget: 'over the budget set for this contract',
  'daily-limit': 'the daily Extend now limit was reached',
  'allowance-short': 'the allowance is below this extend',
  'balance-short': 'the wallet balance is below this extend',
};

function step(name: string, what: string, tx?: string): string {
  return `<li><span>${name}</span><span>${what}</span><span>${tx === undefined ? '' : TX(tx)}</span></li>`;
}

/** The side panel for one job: its figures, its steps with transaction links, and the identity. */
export function panelHtml(job: ApiJob, money: Money, labels: Labels): string {
  const s = job.steps;
  const top = `<div class="panel-top"><div><h2>${EVENT[job.kind]}</h2><p class="note">${esc(
    nameOf(labels, job.contractId),
  )} · ${esc(when(job.createdAt))} UTC</p></div><button class="close" type="button" data-panel-close>Close</button></div>
    <p>${panelStatus(job.status)}</p>`;

  // A job that never pulled charged nothing: that is a fact, not a missing value.
  const neverPulled =
    s.pull === undefined && (job.status === 'preflight-failed' || job.status === 'cancelled');
  const fig = (v: bigint | undefined): string =>
    v !== undefined
      ? `<span class="mono">${esc(n(v))} stroops</span>`
      : neverPulled
        ? 'none, nothing was pulled'
        : `<span class="unavailable">${NOT_YET_AVAILABLE}</span>`;
  const facts: [string, string][] = [
    ['Rent', fig(money.rent)],
    ['Evergreen fee', fig(money['evergreen-fee'])],
  ];
  if (money.refund !== undefined) facts.push(['Refunded', fig(money.refund)]);
  if (job.payerWallet !== undefined)
    facts.push(['Paid by', `<span class="mono">${esc(short(job.payerWallet, 4, 4))}</span>`]);
  const kv = `<dl class="kv">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  const steps: string[] = [];
  if (s.preflight !== undefined) {
    const p = s.preflight;
    const what = p.ok
      ? p.rentStroops === undefined
        ? 'passed'
        : `<span class="nowrap">rent simulated at <span class="mono">${esc(n(p.rentStroops))}</span></span>`
      : `stopped: ${esc(PREFLIGHT_REASON[p.reason ?? ''] ?? p.reason ?? 'no reason recorded')}. Nothing was pulled.`;
    steps.push(step('Pre-flight', what));
  }
  if (s.pull !== undefined) {
    steps.push(
      step(
        'Pulled',
        s.pull.amountStroops === undefined
          ? 'confirmed'
          : `<span class="mono">${esc(n(s.pull.amountStroops))}</span>`,
        s.pull.txHash,
      ),
    );
  }
  if (s.extendTx !== undefined) {
    const r = s.extendTx.rentChargedStroops;
    steps.push(
      step(
        'Extended',
        r === null
          ? 'not confirmed'
          : `<span class="nowrap">charged <span class="mono">${esc(n(r))}</span></span>`,
        s.extendTx.txHash,
      ),
    );
  }
  if (s.refund !== undefined) {
    steps.push(
      step(
        'Refunded',
        s.refund.amountStroops === undefined
          ? 'sent'
          : `<span class="mono">${esc(n(s.refund.amountStroops))}</span>`,
        s.refund.txHash,
      ),
    );
  }
  if (steps.length === 0) {
    steps.push(
      step('Queued', IN_FLIGHT.has(job.status) ? 'waiting for the engine' : 'no steps recorded'),
    );
  }

  // Pulled = rent + fee + refund + difference, from the ledger's rows alone (§7).
  let identity = '';
  if (money.pull !== undefined) {
    const parts = [money.rent, money['evergreen-fee'], money.refund, money.difference];
    const sum = parts.reduce<bigint>((a, v) => a + (v ?? 0n), 0n);
    const closes = sum === money.pull;
    const term = (v: bigint): string => `<span class="nowrap">${esc(n(v))}</span>`;
    identity = `<p class="note identity">Pulled = rent + fee + refund + difference<br /><span class="mono">${term(
      money.pull,
    )} = ${parts.map((v) => term(v ?? 0n)).join(' + ')}</span>${
      closes
        ? ''
        : `<br /><strong>${esc(n(money.pull - sum))} stroops are not yet accounted for.</strong>`
    }</p>`;
  }
  return `${top}
    ${kv}
    <p class="panel-h">Steps</p>
    <ul class="steps">${steps.join('')}</ul>
    ${identity}
    <p class="note">Network fees are paid by Evergreen, not you.</p>`;
}
