/**
 * /docs/cli/scan/ — every flag, with the help text printed from the tool.
 *
 * The help block is read from `packages/cli/src/command.ts` at build time, so
 * this page cannot describe a flag the binary does not have. The table beside
 * it is the part a person writes: what each flag is FOR.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'evergreen scan',
  description:
    'Every flag of evergreen scan: thresholds, declared scope, JSON output, cost estimates and storage advice.',
  heading: 'evergreen scan',
  lead: 'Reads a contract’s ledger entries through Soroban RPC and reports what remains, what expires first, what it would cost to keep alive, and what it could not determine.',
};

export function render(ctx) {
  return `
    <h2 id="usage">Usage</h2>
    <div class="terminal">${esc(ctx.cli.help)}</div>
    <p class="provenance">
      Printed by <span class="mono">evergreen scan --help</span>. This page is generated from
      <span class="mono">packages/cli/src/command.ts</span> and fails to build when that help text
      moves.
    </p>

    <h2 id="flags">What each flag is for</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Flag</th><th scope="col">Why you would use it</th></tr></thead>
      <tbody>
        <tr>
          <td class="num">--threshold N</td>
          <td>Moves the act-now boundary, in ledgers, default 17,280 (~1 day). The boundary is <strong>inclusive</strong>: exactly N fails, because remaining exactly N is already the margin you set out to keep. Both health tiers move with it, so raising it never silently narrows the earlier warning.</td>
        </tr>
        <tr>
          <td class="num">--keys-file &lt;path&gt;</td>
          <td>A JSON file <span class="mono">{ "dataKeys": [...] }</span> of base64 XDR ledger keys, so the scan can see persistent and temporary entries. Exactly one contract when set — data keys belong to a specific contract and the file does not say which.</td>
        </tr>
        <tr>
          <td class="num">--no-data-keys</td>
          <td>A caller declaration that the contract has no data beyond its instance. Only the contract’s author can know this, and it is never independently verified. Mutually exclusive with <span class="mono">--keys-file</span>.</td>
        </tr>
        <tr>
          <td class="num">--require-declared-scope</td>
          <td>Exit 3 when neither of the two above was given. Intended for CI on a contract you own, where an undeclared scope is a gap rather than a caveat.</td>
        </tr>
        <tr>
          <td class="num">--json</td>
          <td>The complete record, including every issue. The human view is a summary. <a class="site-more" href="/docs/cli/output/">Output</a></td>
        </tr>
        <tr>
          <td class="num">--cost [--ledgers N]</td>
          <td>Estimates what extending every entry by N more ledgers would cost, priced by simulating against the network. Default N is 518,400 (~30 days). Nothing is submitted.</td>
        </tr>
        <tr>
          <td class="num">--optimize</td>
          <td>Conditional storage advice with its evidence and scope limits. Reads network minimum lifetimes; no payer needed, no storage changed.</td>
        </tr>
      </tbody>
    </table></div>

    <h2 id="several-contracts">Scanning several contracts together</h2>
    <p>
      Passing more than one contract is not a convenience — it changes what the scan can conclude.
      A code entry is shared by every contract built from the same Wasm, and the chain does not
      index reverse dependencies, so one contract cannot reveal the others.
    </p>
    <div class="terminal">evergreen scan &lt;A&gt;              code entry: 1 consumer, sharing UNDETERMINED
evergreen scan &lt;A&gt; &lt;B&gt; &lt;C&gt;      code entry: 3 consumers, SHARED, they fail together</div>
    <p>
      The result is still a lower bound. Contracts you did not name may also depend on that entry.
    </p>

    <h2 id="costs">What the cost estimate is, and is not</h2>
    <p>
      <span class="mono">--cost</span> prices an extension by simulating it against the network, so
      it reflects current pricing rather than a formula in this tool. Rent pricing varies with
      network state — we have measured it differ by about 18% between days — so treat the figure
      as an estimate with a timestamp, not a quote.
      <a class="site-more" href="/docs/reference/rent/">Rent and cost</a>
    </p>
  `;
}
