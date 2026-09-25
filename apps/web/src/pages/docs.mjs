/**
 * /docs/ — CLI reference, generated from the tool at build time. Usage and
 * flags from the CLI's own help text, exit codes from its exported constants.
 * The build fails when a source moves, because a docs page that disagrees
 * with the tool is worse than none.
 *
 * Four parallel reference sections, each a label on the left and its substance
 * on the right. The help capture is 68 lines and runs past one screen — that
 * is the tool's length, not a layout fault, and it sits in the content column
 * where a long definition belongs rather than floating beside a short note.
 */
import { esc } from './_shared.mjs';
import { refSection } from '../site.mjs';

export const meta = {
  title: 'CLI reference — Evergreen',
  description:
    'The evergreen scan command: flags, exit codes and JSON shape, generated from the tool itself.',
  active: '/docs/',
  layout: 'site',
  eyebrow: 'Reference · generated from the tool at build time',
  heading: 'The CLI does one thing on the page',
  lead: 'Scan. Everything below is the tool describing itself — usage and flags from its own help text, exit codes from its exported constants. Until the package is published, run it from a clone: the install line appears here the day npx resolves from a clean machine.',
  script: null,
};

export function render(ctx) {
  const exitRows = [
    ['0', 'everything scanned is healthy'],
    ['1', 'observed low TTL'],
    ['2', 'error — invalid input, RPC failure, or the network refused'],
    [
      '3',
      'incomplete — entry missing, TTL unavailable, executable not followable, or nothing observed',
    ],
  ]
    .map(([code, meaning]) => `<tr><td class="num">${code}</td><td>${esc(meaning)}</td></tr>`)
    .join('');

  return [
    refSection({
      label: 'Usage and flags',
      heading: 'The tool describing itself',
      body: `<p>Printed by <span class="mono">evergreen scan --help</span>, not transcribed from it.</p>
        <div class="terminal">${esc(ctx.cli.help)}</div>
        <p class="provenance">Source: <span class="mono">packages/cli/src/command.ts</span> — this page fails to build when that help text moves.</p>`,
    }),
    refSection({
      label: 'Exit codes',
      heading: 'Four outcomes, in precedence order',
      body: `<div class="table-wrap"><table>
          <thead><tr><th scope="col">Exit</th><th scope="col">Meaning</th></tr></thead>
          <tbody>${exitRows}</tbody>
        </table></div>
        <p class="note">Precedence 2 &gt; 3 &gt; 1 &gt; 0, from <span class="mono">packages/cli/src/scan.ts</span>. A degraded read still exits 3; blast radius changes severity, not the exit category. Exit status never authorizes a transaction.</p>`,
    }),
    refSection({
      label: 'Machine output',
      heading: 'JSON shape',
      body: `<p>
          <span class="mono">--json</span> prints the <span class="mono">ScanResult</span> — entries keyed by ledger
          key, each carrying the contracts it serves — plus <span class="mono">health</span>,
          <span class="mono">cost</span> and <span class="mono">optimization</span> blocks. The shape is declared in
          <span class="mono">packages/shared-types/src/index.ts</span>; that declaration is authoritative and is not
          copied here, because a copy drifts. Every page with a JSON panel on this site prints the same shape the CLI
          prints.
        </p>`,
    }),
    refSection({
      label: 'Getting it',
      heading: 'Run it before it is published',
      body: `<p>
          Clone the repository, install, build, and scan the public test contract — no key and no account. Needs
          Node 24 and pnpm (<span class="mono">.nvmrc</span> pins the major). The exact
          commands are the README quickstart, which was executed before it was written. No install line is shown here
          until publishing is verified from a clean machine.
        </p>`,
    }),
  ].join('\n');
}
