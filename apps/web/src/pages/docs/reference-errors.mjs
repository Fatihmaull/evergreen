/**
 * /docs/reference/errors/ — what a failure means and what to do about it.
 *
 * Every row is a condition this tool or the network actually produces. The
 * blueprint this documentation came from listed host errors we have never
 * raised; inventing a troubleshooting entry is worse than omitting one,
 * because a reader who matches the wrong row acts on the wrong advice.
 */
export const meta = {
  title: 'Errors and troubleshooting',
  description:
    'What each Evergreen failure means and what to do about it, including archived entries, missing scope and unconfirmed submissions.',
  heading: 'Errors and troubleshooting',
  lead: 'Grouped by what you should do, not by where the message came from. If a situation is not listed here, it is because we have not observed it.',
};

export function render() {
  return `
    <h2 id="scan">While scanning</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Symptom</th><th scope="col">What it means</th><th scope="col">Do</th></tr></thead>
      <tbody>
        <tr>
          <td>Exit 3, entry not found</td>
          <td>No entry came back. It may never have existed, or it may already be archived.</td>
          <td>Check whether it was archived. Restore before extending — an archived entry cannot be extended in place.</td>
        </tr>
        <tr>
          <td>Exit 3, TTL unavailable</td>
          <td>The entry exists but no TTL metadata came back.</td>
          <td>Retry. Treat it as unknown, not as healthy, until a reading succeeds.</td>
        </tr>
        <tr>
          <td>Exit 3 with --require-declared-scope</td>
          <td>Neither <span class="mono">--keys-file</span> nor <span class="mono">--no-data-keys</span> was given, so storage was not covered.</td>
          <td>Declare the scope. On a contract you own, this is a gap rather than a caveat.</td>
        </tr>
        <tr>
          <td>Exit 2, RPC failure</td>
          <td>The network refused or was unreachable. The check did not run.</td>
          <td>Retry, and check the <span class="mono">rpcUrl</span>. This is not a health result.</td>
        </tr>
        <tr>
          <td>Sharing reads UNDETERMINED</td>
          <td>Not an error. One contract cannot reveal the others that share its code entry.</td>
          <td>Pass the contracts together. The answer is still a lower bound.</td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="extend">While extending</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Symptom</th><th scope="col">What it means</th><th scope="col">Do</th></tr></thead>
      <tbody>
        <tr>
          <td>Simulation succeeded but nothing changed</td>
          <td>Expected. Simulation is the default and does not submit.</td>
          <td>Add <span class="mono">--submit</span> with a secret variable name and a fee cap when you mean it.</td>
        </tr>
        <tr>
          <td>“there is no fallback payer”</td>
          <td>No payer was supplied.</td>
          <td>Pass <span class="mono">--source-account</span> or set <span class="mono">EVERGREEN_SOURCE_ACCOUNT</span>. The tool will not pick one.</td>
        </tr>
        <tr>
          <td>“the secret does not match the expected source account”</td>
          <td>The key in the named variable does not control the payer you named.</td>
          <td>Reconfigure. This is distinguished from a malformed secret on purpose — they are different operator actions.</td>
        </tr>
        <tr>
          <td>Target was capped</td>
          <td>Your requested target exceeded <span class="mono">max_entry_ttl - 1</span>.</td>
          <td>Nothing. The cap is reported when it applies; the protocol will not accept a longer horizon in one operation.</td>
        </tr>
        <tr>
          <td>Exit 2, partial or unconfirmed</td>
          <td>The submission’s outcome is not established.</td>
          <td><strong>Do not resend.</strong> There is no replacement send after an uncertain result — check the chain for the transaction before doing anything else.</td>
        </tr>
        <tr>
          <td>REFUSED BY WRITE GUARD</td>
          <td>The subject is protected. This is the guard working.</td>
          <td>Nothing. The refusal is recorded and the run continues. <a class="site-more" href="/docs/engine/guards/">Guards</a></td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="ci">In CI</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Symptom</th><th scope="col">What it means</th><th scope="col">Do</th></tr></thead>
      <tbody>
        <tr>
          <td><span class="mono">Unable to locate executable file: pnpm</span></td>
          <td>Not this Action. <span class="mono">setup-node</span>’s package-manager cache detected your lockfile and shelled out to a package manager the runner does not have.</td>
          <td>It is disabled inside this Action. If you see it, the failing step is a different one in your workflow.</td>
        </tr>
        <tr>
          <td>The job passes but the contract is unhealthy</td>
          <td>The workflow is probably only failing on exit 1 and treating exit 3 as a pass.</td>
          <td>Fail on any non-zero code. An incomplete scan is not a healthy one. <a class="site-more" href="/docs/cli/exit-codes/">Exit codes</a></td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="not-listed">If it is not here</h2>
    <p>
      This table lists conditions we have actually produced. Rather than guess, open an issue with
      the command, the exit code and the output — and note that diagnostics never echo file
      contents or credentials, so the output is safe to paste.
    </p>
  `;
}
