/**
 * /docs/reference/states/ — the three ways a scan declines to conclude.
 *
 * This is the page the rest of the documentation points at when it says
 * "absence is not health", so it has to be exact about which state means what.
 */
export const meta = {
  title: 'Undetermined, unread, not found',
  description:
    'Three states that are not a health grade: undetermined, unread and not found. What each means, and why an RPC failure is none of them.',
  heading: 'Undetermined, unread, not found',
  lead: 'A scan can be healthy, low, or unable to say. The third case is three different cases, and collapsing them into “unknown” loses the part that tells you what to do next.',
};

export function render() {
  return `
    <h2 id="three">The three</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">State</th><th scope="col">Means</th><th scope="col">What to do</th></tr></thead>
      <tbody>
        <tr>
          <td class="num">undetermined</td>
          <td>The check ran and cannot conclude from what it was given. Sharing seen from a single contract is the canonical case.</td>
          <td>Give it more to look at — scan the contracts together.</td>
        </tr>
        <tr>
          <td class="num">unread</td>
          <td>No TTL metadata came back for an entry that exists.</td>
          <td>Retry, and treat the entry as unknown rather than fine in the meantime.</td>
        </tr>
        <tr>
          <td class="num">not found</td>
          <td>No entry came back at all. It may never have existed, or it may already be archived.</td>
          <td>Check whether it was archived. An archived entry needs restoring before it can be extended.</td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="not-a-state">An RPC failure is not one of these</h2>
    <p>
      If the network could not be reached, the check <strong>did not run</strong>. That is an
      error — exit 2 — and it is categorically different from a check that ran and declined. The
      distinction matters because a retry is the right response to one and a change of inputs is
      the right response to another.
    </p>

    <h2 id="issues">How they appear in output</h2>
    <p>
      In the human report these arrive as issue lines under the entries, and as a summary count:
      <span class="mono">Scan is PARTIAL — 2 issue(s). Absence is not health.</span> In
      <span class="mono">--json</span> each one is an object with a code.
    </p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Code</th><th scope="col">Raised when</th></tr></thead>
      <tbody>
        <tr><td class="num">sharing-undetermined</td><td>A code entry was read from a single contract, so the number of consumers is a floor of one rather than a count.</td></tr>
        <tr><td class="num">coverage-limited</td><td>No data keys were supplied, so persistent and temporary entries were not read at all.</td></tr>
        <tr><td class="num">rpc-error</td><td>The network refused or failed. The scan did not complete.</td></tr>
      </tbody>
    </table></div>

    <h2 id="lower-bound">Why sharing is always a lower bound</h2>
    <p>
      The chain does not index reverse dependencies. Given a contract you can find its code entry;
      you cannot ask the chain which other contracts point at that entry. Naming several contracts
      resolves it as far as is possible, and the answer still reads “at least N” — contracts you
      did not list may also depend on it.
    </p>
    <p>
      So a single-contract scan reports <span class="mono">UNDETERMINED</span> rather than
      “unshared”. The difference is the whole point: unshared is a claim, undetermined is an
      admission.
    </p>

    <h2 id="clean">What a clean result covers</h2>
    <p>
      Exactly what was asked for, and never the whole contract. Scanning reads the keys it is
      given and cannot enumerate storage, so a clean exit means “everything I was asked to check is
      healthy”. Coverage is printed with every scan for that reason, and
      <span class="mono">--require-declared-scope</span> exists to turn the silence into a failure
      when you own the contract and should know.
    </p>
  `;
}
