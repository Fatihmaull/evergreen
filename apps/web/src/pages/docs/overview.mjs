/**
 * /docs/ — the documentation landing page.
 *
 * Its job is to say what this tool is, what it refuses to do, and where to go
 * next. The refusals are not a disclaimer section bolted on the end: they are
 * the fastest way for a reader to find out whether this is the tool they are
 * looking for, so they come second.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Evergreen documentation',
  description:
    'Soroban contract state expires on a schedule. Evergreen reads what expires first, what it costs, and what fails with it — and documents exactly what it will not do.',
  heading: 'Overview',
  lead: 'Evergreen reads the time-to-live on a Soroban contract’s ledger entries, tells you which one ends first, and can extend it. Everything on this page and under it describes behaviour that exists in the published package today.',
};

export function render(ctx) {
  return `
    <h2 id="what-it-does">What it does</h2>
    <p>
      Soroban keeps a contract’s state in ledger entries, and each one carries a time to live
      measured in ledgers. When it runs out the entry is archived — or, for temporary entries,
      deleted. A contract whose code entry has been archived cannot execute at all.
    </p>
    <p>
      Evergreen is three things over that fact. A <a class="site-more" href="/docs/cli/">command
      line tool</a> that reads a contract’s entries and reports what expires first. An engine that
      re-reads the entries you configure on a schedule and decides whether any of them need acting
      on. And a <span class="mono">GitHub Action</span> that fails a pull request when a contract
      is closer to expiry than you allow.
    </p>

    <h2 id="refusals">What it will not do</h2>
    <p>
      Four of these are enforced in code rather than promised in prose, and each one is documented
      where it is enforced.
    </p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">It will not</th><th scope="col">Where that is enforced</th></tr></thead>
      <tbody>
        <tr>
          <td>Touch mainnet</td>
          <td>The config loader compares the network passphrase rather than trusting a label. <a class="site-more" href="/docs/reference/security/">Security</a></td>
        </tr>
        <tr>
          <td>Submit anything you did not ask it to</td>
          <td><span class="mono">extend</span> simulates by default; submitting needs <span class="mono">--submit</span>, a named secret variable and a fee cap. <a class="site-more" href="/docs/cli/extend/">extend</a></td>
        </tr>
        <tr>
          <td>Read a secret from a file or an argument</td>
          <td>Secrets are passed by environment variable name only. There is no <span class="mono">.env</span> auto-loading.</td>
        </tr>
        <tr>
          <td>Claim a contract is healthy when it did not look</td>
          <td>A scan reports what it read and names what it could not. <a class="site-more" href="/docs/reference/states/">Undetermined, unread, not found</a></td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">
      It also has no wallet connection and no web control that signs anything. This site is
      read-only: every page here renders committed data or reads the chain, and none of them can
      submit a transaction.
    </p>

    <h2 id="four-kinds">Four kinds of entry, and one that matters most</h2>
    <p>
      Most descriptions of Soroban storage name three kinds — instance, persistent and temporary.
      There is a fourth, and on a real bill it is usually the largest: the <strong>code</strong>
      entry, which holds the compiled Wasm and is shared by every contract deployed from it.
    </p>
    <p>
      On guinea-pig A, one shared code entry is <strong>8,116,648 of 8,264,289 stroops</strong> —
      98% of the rent across all four of its entries. It is also the entry a single-contract scan
      cannot fully resolve, because the chain does not index reverse dependencies.
      <a class="site-more" href="/docs/mental-model/">How state archival works</a>
    </p>

    <h2 id="start">Where to start</h2>
    <p>
      If you want to see it work, the quickstart is one command and needs no key and no account.
      If you want to know whether you can trust it, read the refusals above and then the exit
      codes — what a tool does when it cannot answer is more informative than what it prints when
      it can.
    </p>
    <p class="provenance">
      Package <span class="mono">${esc(ctx.cli.packageName)}@${esc(ctx.cli.version)}</span>, published to npm and
      verified from a clean machine on 2026-09-25. Testnet only.
    </p>
  `;
}
