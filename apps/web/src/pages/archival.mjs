/**
 * /docs/archival/ — state archival reference. Live network values read through
 * core in the browser, with the committed reading as labelled fallback. Our
 * own measurements sit beside them, with the reason each one is worth having.
 */
import {} from './_shared.mjs';

export const meta = {
  title: 'State archival — Evergreen',
  description:
    'How Soroban state archival works on testnet: the live network configuration plus our own measurements.',
  active: '/docs/archival/',
  eyebrow: 'Reference · read from the network, not from documentation',
  heading: 'What the network says about archival',
  lead: 'The configuration below is read live from testnet when the page loads. Rent is not a flat per-byte rate — the CLI prices it by simulating against the network precisely because that formula does not hold, so no such rate appears here.',
  script: '/assets/archival.js',
};

export function render(ctx) {
  const a = ctx.archival.settings;
  return `<section>
    <div id="live-config"><div class="table-wrap"><table>
      <thead><tr><th scope="col">Parameter</th><th scope="col">Ledgers</th><th scope="col">About</th></tr></thead>
      <tbody>
        <tr><td class="num">max_entry_ttl</td><td class="num">${a.maxEntryTtl.toLocaleString('en-US')}</td>
          <td>No entry lives past this. Any figure above it is a live impossibility.</td></tr>
        <tr><td class="num">min_persistent_ttl</td><td class="num">${a.minPersistentTtl.toLocaleString('en-US')}</td>
          <td>Fresh instance, code and persistent entries start here — about seven days.</td></tr>
        <tr><td class="num">min_temporary_ttl</td><td class="num">${a.minTemporaryTtl.toLocaleString('en-US')}</td>
          <td>Fresh temporary entries start here — about an hour. Two orders of magnitude below the rest.</td></tr>
      </tbody></table></div></div>
    <p class="small muted" id="live-note">Committed with this build, read at ledger ${a.observedAtLedger.toLocaleString('en-US')}. Refreshing live…</p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">What happens at zero</h2>
    <p class="muted">
      An entry is still live at its final ledger — remaining zero means one ledger left, not expired. Past it,
      instance, code and persistent entries are <strong>archived</strong>: unusable until someone pays to restore
      them, slower and more expensive than a normal read. Temporary entries are <strong>deleted outright</strong>
      and cannot be restored at any price. Reporting those two fates the same way is a serious interface bug,
      so they are never the same chip anywhere on this site.
    </p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">Measured, not read from documentation</h2>
    <p class="muted">
      Ledger close <strong>5.000000 s, ± 0.000050</strong> — sampled from 11 testnet closes 2,000 ledgers apart
      and run through the same measurement the CLI uses. The precision is the finding: across a full maximum
      TTL the uncertainty band is over an hour wide, so wall-clock dates are estimates and ledgers are the truth.
    </p>
    <p class="muted">
      Temporary floor: the configured minimum is 720 ledgers, about an hour; our own temporary entry had 688
      left when first sampled — the ~57 minutes. Those are two different things and they are stated together
      so they are not conflated.
    </p>
    <p class="muted">
      Durability, not size: persistent rent measured about <strong>1.95×</strong> temporary at byte-identical
      size. The price follows what the entry is, not only how big it is — which is itself the argument for
      simulating rather than computing.
    </p>
  </section>`;
}
