/**
 * /docs/quickstart/ — one command, a real contract, no key.
 *
 * The command and the contract are the README's, which was executed before it
 * was written. The output shown is a committed capture rather than a
 * transcription, so it cannot be tidied into something the tool never printed.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Quickstart',
  description:
    'Scan a real Soroban contract on testnet with one command. No key, no account, no install.',
  heading: 'Quickstart',
  lead: 'One command against a real contract on testnet. It needs Node 24, and nothing else — no key, no account, and no install step.',
};

export function render(ctx) {
  const command = `npx ${ctx.cli.packageName}@${ctx.cli.version} scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`;
  return `
    <h2 id="run-it">Run it</h2>
    <p>
      The contract id below is guinea-pig A, one of three contracts this project runs against on
      testnet. It is a real deployment, so the numbers you get back will differ from the ones here —
      they move every five seconds.
    </p>
    <div class="terminal">${esc(command)}</div>
    <p class="note">
      <span class="mono">npx</span> fetches the package and runs it; there is no global install to
      undo afterwards. Node 24 is required — the package declares it, and npm will refuse on older
      runtimes rather than fail strangely later.
    </p>

    <h2 id="what-you-get">What comes back</h2>
    <p>
      A scan of the same contract, captured on 2026-09-12 and committed under
      <span class="mono">docs/evidence/</span>. Read the last two lines first: they are the ones
      that say what the scan could <em>not</em> establish.
    </p>
    <div class="terminal">${esc(ctx.capture.text)}</div>
    <p class="provenance">${ctx.capture.provenance}</p>

    <h2 id="reading-it">Reading it</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Line</th><th scope="col">What it is telling you</th></tr></thead>
      <tbody>
        <tr><td class="num">Coverage</td><td>Which entries were read, and that storage was not enumerated. A clean result covers only what was asked for.</td></tr>
        <tr><td class="num">remaining</td><td>Ledgers left on that entry. Ledgers are the truth; the date beside them is an estimate at five seconds each.</td></tr>
        <tr><td class="num">⚠ sharing</td><td>The code entry is shared by every contract built from the same Wasm. One scan saw one consumer and says so, rather than concluding it is unshared.</td></tr>
        <tr><td class="num">Scan is PARTIAL</td><td>The scan finished and is telling you its own limits. <strong>Absence is not health.</strong></td></tr>
      </tbody>
    </table></div>

    <h2 id="next">Then what</h2>
    <p>
      Pass several contracts to one scan and the sharing question resolves as far as it can —
      <span class="mono">scan A B C</span> reports the code entry’s consumers as a lower bound.
      To see what keeping an entry alive would cost, add <span class="mono">--cost</span>. To
      change anything, <span class="mono">extend</span> is a separate command with its own guards.
    </p>
  `;
}
