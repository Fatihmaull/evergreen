/**
 * /docs/mental-model/ — the four kinds of entry and the two ways of ending.
 *
 * Every figure on this page is either read from the network's own
 * configuration at build time or measured against our own contracts. The
 * 720-ledger floor in particular was measured on a fresh deploy rather than
 * read from documentation, because the documentation and the network have
 * disagreed before.
 */
import { esc, fmt } from '../_shared.mjs';

export const meta = {
  title: 'How state archival works',
  description:
    'Four kinds of Soroban ledger entry, how each one ends, and which endings can be undone.',
  heading: 'How state archival works',
  lead: 'Soroban state is rented, not owned. Every entry carries a ledger count, every closed ledger takes one off, and what happens at zero depends on which kind of entry it is.',
};

export function render(ctx) {
  const minTemp = ctx.archival?.minimumTemporaryLedgers ?? 720;
  return `
    <h2 id="ledgers">Ledgers, not dates</h2>
    <p>
      A time to live is a ledger number, not a timestamp. An entry is live until a given ledger
      closes, and the network closes ledgers at roughly five seconds each — measured at
      <span class="mono">5.000000 s ± 0.000050</span> on 2026-09-10, not assumed.
    </p>
    <p>
      Every date in this documentation and on this site is derived from that rate and travels with
      a <span class="mono">~</span>. The ledger beside it is the exact value. When the two
      disagree, the ledger is right.
    </p>

    <h2 id="four-kinds">The four kinds</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Kind</th><th scope="col">Holds</th><th scope="col">At zero</th></tr></thead>
      <tbody>
        <tr><td class="num">instance</td><td>The contract’s own state pointer.</td><td>Archived — recoverable</td></tr>
        <tr><td class="num">code</td><td>The compiled Wasm, shared by every contract deployed from it.</td><td>Archived — recoverable</td></tr>
        <tr><td class="num">persistent</td><td>Durable stored values.</td><td>Archived — recoverable</td></tr>
        <tr><td class="num">temporary</td><td>Disposable stored values.</td><td><strong>Deleted — gone permanently</strong></td></tr>
      </tbody>
    </table></div>
    <p class="note">
      A temporary entry’s minimum lifetime is ${fmt(minTemp)} ledgers, about an hour, read from the
      network’s own configuration. Our own temporary entry had 688 left when it was first sampled.
    </p>

    <h2 id="archived-vs-deleted">Archived is not deleted</h2>
    <p>
      An archived entry still exists. Its data is moved out of the live state and the contract
      stops working until someone restores it with <span class="mono">RestoreFootprintOp</span> and
      pays for the restoration. It is an outage and a bill, not a loss.
    </p>
    <p>
      A deleted temporary entry is a loss. There is no restore operation for it, and no amount of
      XLM brings it back. This is the single asymmetry worth carrying away from this page: three of
      the four kinds are a bill, and one is a burial.
    </p>

    <h2 id="shared-code">The entry that is shared</h2>
    <p>
      A contract’s instance can be healthy until December while the code it runs expires in
      October, and without its code the contract cannot execute at all. So the real expiry is the
      earliest entry — which is rarely the obvious one, and is shared by every contract deployed
      from the same Wasm.
    </p>
    <p>
      On guinea-pig A that one shared code entry is <strong>8,116,648 of 8,264,289 stroops</strong>
      — 98% of the rent across all four entries. Scanning only its instance and code, the same
      entry is 99%: identical rent, different denominator. The scope travels with the number.
    </p>

    <h2 id="lower-bound">Why one scan cannot settle it</h2>
    <p>
      The chain does not index reverse dependencies. Given one contract, a scan can see which code
      entry it points at; it cannot ask which <em>other</em> contracts point at the same entry. So
      a single-contract scan reports sharing as <span class="mono">undetermined</span> rather than
      concluding the entry is unshared.
    </p>
    <p>
      Naming several contracts in one scan resolves it as far as the chain allows — and the answer
      is still a <strong>lower bound</strong>. Contracts you did not list may also depend on that
      entry, which is why the count reads “at least”.
    </p>
    <p class="provenance">
      Archival parameters on this page come from <a class="site-more" href="/docs/archival/">the
      live network read</a>; the rent figures were measured against
      <span class="mono">${esc('CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L')}</span>.
    </p>
  `;
}
