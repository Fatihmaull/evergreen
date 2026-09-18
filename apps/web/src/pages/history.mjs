/**
 * /dashboard/history/ — extension history. Every extend that actually
 * happened, past tense, each with its real transaction hash, inclusion ledger,
 * fee, and who triggered it. Fees are in stroops. "Gas" is not Stellar
 * terminology and appears nowhere here.
 */
import { esc, fmt, txLink } from './_shared.mjs';

export const meta = {
  title: 'Extension history — Evergreen',
  description:
    'Every TTL extension this project actually submitted: transaction hash, inclusion ledger, fee charged, and who triggered it.',
  active: '/dashboard/history/',
  eyebrow: 'Extension history · past tense only',
  heading: 'Everything we extended, and who asked for it',
  lead: 'Four rounds. Each names its trigger honestly — manual CLI, or engine on a local timer. No row is labelled scheduled cron: as far as the record goes, the production cron has never extended anything.',
  script: null,
};

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

function row(date, entry, change, fee, actor, hash, source) {
  return `<tr>
    <td class="num">${esc(date)}</td>
    <td>${esc(entry)}</td>
    <td class="num">${esc(change)}</td>
    <td class="num">${esc(fee)}</td>
    <td>${esc(actor)}</td>
    <td>${txLink(hash)}</td>
    <td class="small muted mono">${esc(source)}</td>
  </tr>`;
}

export function render() {
  const shortA = `${A.slice(0, 6)}…${A.slice(-6)}`;
  return `<section class="card card-pad stack">
    <h2 class="section">5 September — calibration, disclosed</h2>
    <p class="muted">
      Three extend transactions placed B's crossing in-window, and the shared code was extended again while
      preparing C — 19 transactions that day in total, inventoried with every hash, unedited RPC response and
      explorer screenshot in <span class="mono">docs/EVIDENCE.md</span> § W1 inventory. Deliberate intervention,
      recorded as such: none of it is an unattended-engine proof. The table below carries the extensions that
      changed what the charts show; the inventory carries all of them.
    </p>
  </section>
  <section>
    <h2 class="section">The extensions behind the charts</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col">Expiry change</th><th scope="col">Fee</th><th scope="col">Triggered by</th><th scope="col">Transaction</th><th scope="col">Record</th></tr></thead>
      <tbody>
        ${row('9 Sep 2026', `A instance (${shortA})`, '→ ~6,025,590', '156,840 stroops, as recorded', 'manual CLI · evergreen-b key', 'f15efca7bfabed10df9ec61f5b2bcb2a8bdfdd53c16d574e0f56766b81db77c0', 'docs/evidence/2026-09-09-guinea-pig-a-extend/')}
        ${row('9 Sep 2026', 'A persistent', '→ ~6,025,590', '106,308 stroops, as recorded', 'manual CLI · evergreen-b key', 'f48b7e796f9727758de59b8864320033265daf4eff72a70dc9db7183350af787', 'docs/evidence/2026-09-09-guinea-pig-a-extend/')}
        ${row('9 Sep 2026', 'A temporary', '→ ~6,025,590', '55,655 stroops, as recorded', 'manual CLI · evergreen-b key', '2963ac1e4cf818fe979dafba009d8d281424638779b0873df1a84e877f90d4fb', 'docs/evidence/2026-09-09-guinea-pig-a-extend/')}
        ${row('12 Sep 2026', `A instance (${shortA})`, '6,025,589 → 6,026,591 (+1,002 incl. inclusion delay)', '5,064 stroops charged', 'manual CLI', 'e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a', 'docs/evidence/2026-09-12-manual-extend-proof/')}
        ${row('14 Sep 2026', `A instance (${shortA})`, '6,026,591 → 6,370,261', '44,725 stroops charged', 'engine, local timer', 'dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128', 'docs/evidence/2026-09-14-scheduled-a-save/')}
      </tbody>
    </table></div>
    <p class="small muted">
      The 9 September rescue found A nine days from archival and carried all three entries to December; its code
      entry still expires 20 October 2026 and is refused by the guard until W3-D18-02d. The 14 September save ran
      under a threshold raised to 1,500,000 — arranged timing, genuine response. "Charged" means decoded from the
      receipt; "as recorded" means the evidence record's fee column, not re-decoded here.
    </p>
  </section>`;
}
