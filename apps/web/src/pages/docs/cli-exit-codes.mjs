/**
 * /docs/cli/exit-codes/ — the four outcomes and why precedence matters.
 *
 * The codes are read from `packages/cli/src/scan.ts`'s exported constants at
 * build time; the build already refuses if they stop being 0/1/2/3.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Exit codes',
  description:
    'Evergreen exit codes 0, 1, 2 and 3, their precedence, and why an incomplete scan is not a healthy one.',
  heading: 'Exit codes',
  lead: 'Four outcomes, and a precedence order that exists so a scan can never report health it did not observe.',
};

export function render(ctx) {
  const rows = [
    [ctx.cli.exits.ok, 'everything scanned is healthy', 'Everything the scan was asked to check is above the threshold. It says nothing about entries it was not given keys for.'],
    [ctx.cli.exits.below, 'observed low TTL', 'An entry the scan read is at or below the act-now threshold. The boundary is inclusive.'],
    [ctx.cli.exits.error, 'error', 'Invalid input, an RPC failure, or the network refused. The check did not run.'],
    [ctx.cli.exits.incomplete, 'incomplete', 'Entry missing, TTL unavailable, executable not followable, or nothing observed. The check ran and could not conclude.'],
  ]
    .map(
      ([code, label, meaning]) =>
        `<tr><td class="num">${esc(code)}</td><td class="num">${esc(label)}</td><td>${esc(meaning)}</td></tr>`,
    )
    .join('');
  return `
    <h2 id="codes">The four codes</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Exit</th><th scope="col">Name</th><th scope="col">Meaning</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="provenance">
      Read from <span class="mono">packages/cli/src/scan.ts</span>’s exported constants; the build
      refuses if they stop being 0, 1, 2 and 3.
    </p>

    <h2 id="precedence">Precedence: 2 &gt; 3 &gt; 1 &gt; 0</h2>
    <p>
      When a scan produces more than one outcome, the highest-precedence one wins. Read the order
      backwards and it explains itself:
    </p>
    <ul>
      <li><strong>0 loses to everything.</strong> Health is the weakest claim a scan can make, so any other observation displaces it.</li>
      <li><strong>1 loses to 3.</strong> A low reading you took is less important than an entry you could not read at all — the unread one might be lower.</li>
      <li><strong>3 loses to 2.</strong> If the tool itself failed, its partial findings are not trustworthy enough to report as findings.</li>
    </ul>

    <h2 id="not-healthy">An incomplete scan is not a healthy one</h2>
    <p>
      This is the distinction the codes exist to protect. Exit 3 means the scan ran and declined to
      conclude; it is <em>not</em> a softer version of exit 0.
    </p>
    <p>
      A degraded read still exits 3. Blast radius changes severity, not the exit category. And
      exit status never authorizes a transaction — the code a scan returns has no bearing on what
      <span class="mono">extend</span> will do.
    </p>

    <h2 id="ci">In CI</h2>
    <p>
      The GitHub Action surfaces the same code as its <span class="mono">exit-code</span> output,
      so a workflow can distinguish “too close to expiry” from “we could not tell”. Treating 3 as a
      pass is the most common way to build a check that cannot fail.
    </p>
  `;
}
