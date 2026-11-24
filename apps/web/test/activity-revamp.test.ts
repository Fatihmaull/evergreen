/**
 * Activity, drawn from `GET /jobs` and `GET /ledger` (PH2-E2-08). Rent and fee
 * come from ledger rows only; a missing row is an em dash, never 0; the
 * 30-day facts say "not yet available" unless every row of the window was
 * read; a margin refund on an extended job is not a failure.
 */
import { expect, test } from 'vitest';
import {
  factsHtml,
  filtersHtml,
  listHtml,
  matches,
  moneyByJob,
  panelHtml,
  when,
  type ApiJob,
  type ApiLedgerRow,
} from '../src/lib/activity-view';

const NOW = new Date('2026-11-24T08:00:00Z');
const C = `C${'A'.repeat(55)}`;
const G = `G${'D'.repeat(55)}`;

const extended: ApiJob = {
  id: 'j1',
  contractId: C,
  kind: 'autopilot',
  payerWallet: G,
  createdAt: '2026-11-24T03:30:00.000Z',
  status: 'extended',
  steps: {
    preflight: { at: '2026-11-24T03:30:01.000Z', ok: true, rentStroops: '141960' },
    pull: { at: '2026-11-24T03:30:05.000Z', txHash: 'aaaa1111bbbb', amountStroops: '288405' },
    extendTx: { txHash: 'cccc2222dddd', rentChargedStroops: '141960' },
    refund: { at: '2026-11-24T03:30:12.000Z', txHash: 'eeee3333ffff', amountStroops: '121445' },
  },
};
const failed: ApiJob = {
  id: 'j2',
  contractId: C,
  kind: 'autopilot',
  createdAt: '2026-11-23T07:10:00.000Z',
  status: 'preflight-failed',
  steps: { preflight: { at: '2026-11-23T07:10:01.000Z', ok: false, reason: 'allowance-short' } },
};
const row = (kind: ApiLedgerRow['kind'], amount: string, id: string): ApiLedgerRow => ({
  id,
  jobId: 'j1',
  kind,
  amountStroops: amount,
  txHash: null,
  recordedAt: '2026-11-24T03:30:09.000Z',
});
const ledger = [
  row('pull', '288405', '1'),
  row('rent', '141960', '2'),
  row('evergreen-fee', '25000', '3'),
  row('refund', '121445', '4'),
];
const labels = new Map([[C, 'oracle-feed']]);

test('🔴 rent and fee come from ledger rows; a job without them shows a dash, never 0', () => {
  const html = listHtml([extended, failed], moneyByJob(ledger), labels);
  expect(html).toContain('141,960');
  expect(html).toContain('25,000');
  const failedRow = html.split('data-open="j2"')[1]!.split('</tr>')[0]!;
  expect(failedRow).toContain('—');
  expect(failedRow).not.toMatch(/>0</);
  expect(failedRow).toContain('pre-flight failed');
  // On mobile the Status column is hidden, so the chip also sits under the event.
  expect(failedRow).toMatch(/class="only-m"><br \/><span class="chip critical"/);
  const okRow = html.split('data-open="j1"')[1]!.split('</tr>')[0]!;
  expect(okRow).not.toContain('only-m');
});

test('🔴 an extended job with a margin refund is not counted as failed', () => {
  expect(matches(extended, 'failed')).toBe(false);
  expect(matches(extended, 'extends')).toBe(true);
  expect(matches(failed, 'failed')).toBe(true);
  expect(filtersHtml([extended, failed], 'all')).toMatch(/Failed <span class="mono">1</);
});

test('🔴 the 30-day facts are "not yet available" unless the whole window was read', () => {
  const partial = factsHtml({ jobs: [extended], ledger, complete: false }, NOW);
  expect(partial).toContain('not yet available');
  expect(partial).not.toContain('141,960');
  const whole = factsHtml({ jobs: [extended, failed], ledger, complete: true }, NOW);
  expect(whole).toContain('>1<'); // one extend; the failed job is not one
  expect(whole).toContain('1 autopilot, 0 manual');
  expect(whole).toContain('141,960');
  expect(whole).toContain('25,000');
  expect(whole).toContain('121,445');
});

test('the panel lists the steps with transaction links and closes the identity', () => {
  const html = panelHtml(extended, moneyByJob(ledger).get('j1')!, labels);
  expect(html).toContain('rent simulated at <span class="mono">141,960</span></span>');
  expect(html).toContain('https://stellar.expert/explorer/testnet/tx/aaaa1111bbbb');
  expect(html).toContain('charged <span class="mono">141,960</span></span>');
  expect(html.replace(/<\/?span[^>]*>/g, '')).toContain('288,405 = 141,960 + 25,000 + 121,445 + 0');
  expect(html).not.toContain('not yet accounted for');
  expect(html).toContain('Network fees are paid by Evergreen, not you.');
});

test('the panel says plainly when the rows do not close', () => {
  const html = panelHtml(extended, moneyByJob(ledger.slice(0, 3)).get('j1')!, labels);
  expect(html).toContain('121,445 stroops are not yet accounted for');
});

test('a failed pre-flight says why and that nothing was pulled', () => {
  const html = panelHtml(failed, {}, labels);
  expect(html).toContain('the allowance is below this extend');
  expect(html).toContain('Nothing was pulled');
  expect(html).toContain('none, nothing was pulled'); // a fact, not a missing value
  expect(panelHtml({ ...failed, status: 'queued', steps: {} }, {}, labels)).toContain(
    'not yet available',
  );
});

test('times are UTC and mono-friendly', () => {
  expect(when('2026-11-23T13:30:59Z')).toBe('Nov 23 13:30');
});
