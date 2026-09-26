/**
 * /docs/cli/ — install, the two commands, and the conventions they share.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Install and conventions',
  description:
    'Install the Evergreen CLI, and the conventions its two commands share: ledgers over dates, declared scope, and no secret in an argument.',
  heading: 'Install and conventions',
  lead: 'Two commands. One reads, one writes, and the one that writes does nothing until you say so twice.',
};

export function render(ctx) {
  return `
    <h2 id="install">Install</h2>
    <p>
      There is nothing to install for a one-off scan — <span class="mono">npx</span> fetches and
      runs it:
    </p>
    <div class="terminal">npx ${esc(ctx.cli.packageName)}@${esc(ctx.cli.version)} scan &lt;contract-id&gt;</div>
    <p>For repeated use, or in a script where you want the version pinned in one place:</p>
    <div class="terminal">npm install -D ${esc(ctx.cli.packageName)}@${esc(ctx.cli.version)}</div>
    <p class="note">
      Node 24 is required and declared in the package. The binary is named
      <span class="mono">evergreen</span>.
    </p>

    <h2 id="two-commands">Two commands</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Command</th><th scope="col">What it does</th></tr></thead>
      <tbody>
        <tr>
          <td class="num">scan</td>
          <td>Reads a contract’s entries and reports what expires first, what it would cost, and what it could not determine. Never writes. <a class="site-more" href="/docs/cli/scan/">Reference</a></td>
        </tr>
        <tr>
          <td class="num">extend</td>
          <td>Builds and simulates a TTL extension. Submits only with an explicit flag, a named secret variable and a fee cap. <a class="site-more" href="/docs/cli/extend/">Reference</a></td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="conventions">Conventions both commands keep</h2>
    <h3>Ledgers are the truth</h3>
    <p>
      Every remaining lifetime is reported in ledgers. Dates appear beside them as estimates at
      five seconds per ledger and always carry a <span class="mono">~</span>.
    </p>
    <h3>Scope is declared, never guessed</h3>
    <p>
      Scanning reads the keys it is given; it cannot enumerate a contract’s storage. So a clean
      exit means “everything I was asked to check is healthy”, never “this contract is fully
      healthy”. Coverage is printed with every scan, and
      <span class="mono">--require-declared-scope</span> turns an undeclared scope into a failure
      rather than a footnote.
    </p>
    <h3>A secret is never an argument</h3>
    <p>
      <span class="mono">extend --submit</span> takes the <em>name</em> of an exported environment
      variable, not its value. There is no <span class="mono">.env</span> auto-loading, and
      diagnostics never echo file contents or credentials.
    </p>
    <h3>Testnet only</h3>
    <p>
      The network passphrase is compared rather than a label trusted. There is no mainnet path in
      this tool, and adding one is not a configuration change.
    </p>
  `;
}
