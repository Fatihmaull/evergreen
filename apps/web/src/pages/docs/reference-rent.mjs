/**
 * /docs/reference/rent/ — what rent is, what we measured paying, and why the
 * estimate is an estimate.
 *
 * Every figure here was recorded against our own contracts on testnet. None of
 * it is a formula restated from documentation: the rent model in this project
 * was validated against a real fee, and the first implementation failed that
 * comparison and was replaced.
 */
export const meta = {
  title: 'Rent and cost',
  description:
    'How Soroban rent is priced, the fees Evergreen actually paid on testnet, and why batching an extension is cheaper than extending often.',
  heading: 'Rent and cost',
  lead: 'Soroban state is rented by size and by time. What follows is what we measured paying, not a formula quoted from elsewhere.',
};

export function render() {
  return `
    <h2 id="model">What you are paying for</h2>
    <p>
      Rent is a function of how large an entry is and how far into the future you are extending it.
      Extending the same entry twice as far costs roughly twice as much; extending an entry twice
      the size costs roughly twice as much. The fee is charged once, at submission.
    </p>
    <p>
      There is no subscription and no ongoing charge. An entry with a large remaining TTL is not
      costing you anything per day — you have already paid for that time.
    </p>

    <h2 id="measured">What we paid</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Extension</th><th scope="col">Fee charged</th><th scope="col">Note</th></tr></thead>
      <tbody>
        <tr><td class="num">+1,000 ledgers</td><td class="num">5,064 stroops</td><td>Expiry moved +1,002 including inclusion delay — the target is absolute, so ledgers that close while the transaction is in flight count.</td></tr>
        <tr><td class="num">engine extension</td><td class="num">44,725 stroops</td><td>An unattended run acting on a threshold it was configured with.</td></tr>
      </tbody>
    </table></div>
    <p class="note">
      Both are testnet, recorded with their transaction hashes on
      <a class="site-more" href="/dashboard/history/">the extension history</a>. They are receipts,
      not a price list: what an extension costs you depends on your entries.
    </p>

    <h2 id="batching">Why batching is cheaper</h2>
    <p>
      Every submission pays a base fee regardless of how far it extends. Extending by thirty days
      once therefore costs less than extending by one day thirty times, and the difference is
      thirty base fees rather than anything about the rent itself.
    </p>
    <p>
      This is why the default extension target is 518,400 ledgers, about thirty days, and why the
      act-now threshold is about one day: the gap between them is the window in which a single
      extension can be planned, simulated and submitted without hurry.
    </p>

    <h2 id="estimate">The estimate is an estimate</h2>
    <p>
      <span class="mono">scan --cost</span> prices an extension by <strong>simulating it against
      the network</strong>, so it reflects current pricing rather than a formula in this tool.
      Nothing is submitted.
    </p>
    <p>
      Rent pricing varies with network state. We have measured it differ by about 18% between
      days, so treat a cost figure as a reading with a timestamp. If a budget depends on it, take
      the reading close to when you will submit.
    </p>

    <h2 id="share">Where the money actually goes</h2>
    <p>
      On guinea-pig A, one shared code entry is 8,116,648 of 8,264,289 stroops — 98% of the rent
      across all four of its entries. Scanning only the instance and code entries, that same entry
      is 99%: identical rent, different denominator.
    </p>
    <p>
      The practical consequence is that optimising anything other than the code entry is usually
      rounding error, and that the entry worth watching is shared with every other contract built
      from the same Wasm.
      <a class="site-more" href="/docs/mental-model/">How state archival works</a>
    </p>
  `;
}
