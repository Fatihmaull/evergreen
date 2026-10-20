/**
 * Shared build-time helpers for the static pages. Numbers are pinned to
 * en-US: an unpinned toLocaleString renders 120,909 as 120.909 in German.
 * Wall-clock dates are estimates from the measured 5-second cadence and
 * always travel with `~`; the ledger beside them is the exact value.
 */

export function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Ledger delta converted at 5 seconds per ledger, as a `~date` estimate. */
/**
 * An end ledger that is still in the future, or the build stops.
 *
 * On 2026-10-19 `/dashboard/contracts/` and `/dashboard/decay/` told visitors
 * that the shared code entry — the one this product calls 98% of the bill, the
 * entry that binds all three contracts — **expires about 20 October 2026 at
 * ledger 5,290,829**. It had been extended to 8,297,162 five days earlier
 * (#296), and the chain had been saying so ever since. The page said it in the
 * present tense, two days before the date it named, about the claim the whole
 * product rests on. Wrong, and wrong in the frightening direction.
 *
 * The number was a LITERAL typed into page source. No reader fetched it, so no
 * reader could refuse when it moved; `5290829` appeared four times across two
 * pages and nothing related any of them to the chain.
 *
 * So a future expiry is rendered through here or not at all. The ledger must be
 * ahead of the one the snapshot was observed at — a ledger already passed
 * cannot be something an entry "expires at", and saying so is the failure this
 * product exists to name, committed by its own dashboard.
 *
 * A RECORDED past end — guinea-pig B's 4,793,687 — is a different statement and
 * does not come through here. It is read from `ops/crossing-schedule.json` via
 * `knownEnds`, and it is written in the past tense.
 */
export function futureEnd(targetLedger, observedAtLedger, label = 'an end ledger') {
  if (!Number.isInteger(targetLedger) || !Number.isInteger(observedAtLedger)) {
    throw new Error(
      `${label}: expected two ledger numbers, got ${targetLedger} and ${observedAtLedger}`,
    );
  }
  if (targetLedger <= observedAtLedger) {
    throw new Error(
      `${label}: ledger ${targetLedger} is not ahead of the snapshot's ${observedAtLedger}. ` +
        'A page may not present a ledger that has already passed as a future expiry; ' +
        'refresh the snapshot (apps/web/scripts/make-snapshot.mjs) or write it in the past tense.',
    );
  }
  return targetLedger;
}

export function approxDate(targetLedger, refLedger, refIso) {
  const ms = Date.parse(refIso) + (targetLedger - refLedger) * 5000;
  const d = new Date(ms);
  return `~${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** '2026-09-21' → '21 September 2026'. Read from the crossing schedule, never typed. */
export function dateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function explorerTx(hash) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function txLink(hash, label = null) {
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  return `<a class="mono" href="${explorerTx(hash)}">${esc(label ?? short)}</a>`;
}

export function shortId(id, head = 6, tail = 6) {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export const CONTRACTS = [
  {
    id: 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L',
    label: 'guinea-pig A',
    role: 'The working subject. Bump it, break it, redeploy it freely — it is what every scan, screenshot and live proof is verified against.',
  },
  {
    id: 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ',
    label: 'guinea-pig B',
    role: 'The natural-decay control. Calibrated once on 5 September with a disclosed extend, then left alone. It crosses the alert threshold on 20 September and expires on the 21st — be present for the second date, that is the unrepeatable event.',
  },
  {
    id: 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL',
    label: 'guinea-pig C',
    role: 'The backup proof, five days behind B: threshold crossing 25 September, expiry the 26th. The only second shot if B is missed.',
  },
];
