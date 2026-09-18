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
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Ledger delta converted at 5 seconds per ledger, as a `~date` estimate. */
export function approxDate(targetLedger, refLedger, refIso) {
  const ms = Date.parse(refIso) + (targetLedger - refLedger) * 5000;
  const d = new Date(ms);
  return `~${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** '2026-09-21' → '21 September 2026'. Read from the write guard, never typed. */
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
