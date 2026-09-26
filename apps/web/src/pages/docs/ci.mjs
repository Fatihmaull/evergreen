/**
 * /docs/ci/ — what the Action is for, and the failure it is meant to prevent.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'The GitHub Action',
  description:
    'Fail a pull request when a Soroban contract is closer to expiry than you allow, using the same scan and the same exit codes as the CLI.',
  heading: 'The GitHub Action',
  lead: 'The same scan, run on every pull request, failing the job when a contract is closer to expiry than your repository allows.',
};

export function render(ctx) {
  return `
    <h2 id="why">What it catches</h2>
    <p>
      A contract’s TTL does not change because you opened a pull request — it changes because time
      passed. The Action exists so that the passage of time becomes visible at the moment somebody
      is already looking at the repository, rather than at the moment the contract stops working.
    </p>

    <h2 id="workflow">A workflow</h2>
    <div class="terminal">${esc(`name: Contract TTL
on: [push, pull_request]

jobs:
  ttl:
    runs-on: ubuntu-latest
    steps:
      - uses: Fatihmaull/evergreen@v${ctx.cli.version}
        with:
          contracts: \${{ vars.SOROBAN_CONTRACT_ID }}
          threshold: '${ctx.thresholds.warn}'`)}</div>
    <p class="note">
      The Action lives at the repository root, so it is referenced as
      <span class="mono">Fatihmaull/evergreen@&lt;ref&gt;</span> — there is no
      <span class="mono">/actions/…</span> path. It needs no checkout step of its own and reads
      nothing from your repository.
    </p>

    <h2 id="secrets">A contract id is not a secret</h2>
    <p>
      Contract ids are public — they are on the ledger. Putting one in
      <span class="mono">secrets</span> costs you the ability to read your own workflow logs and
      buys nothing, so the example above uses <span class="mono">vars</span>.
    </p>
    <p>
      The Action never signs anything and takes no key. It runs
      <span class="mono">scan</span>, which is read-only by construction.
      <a class="site-more" href="/docs/cli/extend/">extend</a> is a separate command and is not
      reachable from here.
    </p>

    <h2 id="threshold">Choosing the threshold</h2>
    <p>
      The default is the act-now tier — about one day. That is almost certainly too late for CI: a
      pull request that fails the day before a contract stops working has not given anyone time to
      do anything. Set it to the warning tier, ${ctx.thresholds.warn.toLocaleString('en-US')}
      ledgers or about a week, and treat a failure as a task rather than an incident.
    </p>

    <h2 id="incomplete">Do not treat “incomplete” as a pass</h2>
    <p>
      The job’s exit code is the scan’s. <span class="mono">3</span> means the scan ran and could
      not conclude — an entry was missing, a TTL was unavailable, or nothing was observed. A
      workflow that only fails on <span class="mono">1</span> will pass every time the scan cannot
      see, which is the one situation you most want to hear about.
      <a class="site-more" href="/docs/ci/reference/">Action reference</a>
    </p>
  `;
}
