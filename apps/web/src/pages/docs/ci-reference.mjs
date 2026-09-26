/**
 * /docs/ci/reference/ — inputs and the one output, read from action.yml.
 *
 * The table is generated from the Action's own manifest, so it cannot list an
 * input the Action does not accept.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Action reference',
  description:
    'Every input of the evergreen-check GitHub Action, its exit-code output, and what the runner installs.',
  heading: 'Action reference',
  lead: 'Generated from the Action’s own manifest. Every input below is one the Action accepts today.',
};

export function render(ctx) {
  const rows = ctx.action.inputs
    .map(
      (input) =>
        `<tr><td class="num">${esc(input.name)}</td><td class="num">${input.required ? 'required' : esc(input.default || '—')}</td><td>${esc(input.description)}</td></tr>`,
    )
    .join('');
  return `
    <h2 id="inputs">Inputs</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Input</th><th scope="col">Default</th><th scope="col">Description</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="provenance">Read from <span class="mono">action.yml</span> at build time.</p>

    <h2 id="output">Output</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Output</th><th scope="col">Meaning</th></tr></thead>
      <tbody>
        <tr><td class="num">exit-code</td><td>${esc(ctx.action.output)}</td></tr>
      </tbody>
    </table></div>
    <p>
      The step fails the job on a non-zero code, and the output is there so a later step can tell
      the codes apart — for instance to comment on the pull request differently for
      <span class="mono">1</span> and <span class="mono">3</span>.
      <a class="site-more" href="/docs/cli/exit-codes/">Exit codes</a>
    </p>

    <h2 id="runner">What runs on the runner</h2>
    <p>
      Node 24 via <span class="mono">actions/setup-node</span>, then the published CLI via
      <span class="mono">npx --yes</span>. The Action reads no lockfile and installs nothing into
      your repository.
    </p>
    <p class="note">
      <strong>Package-manager caching is explicitly disabled</strong>, and that is not a
      preference. <span class="mono">setup-node@v5</span> turns it on by default, detects the
      caller’s lockfile, and shells out to that package manager — so in a repository with a
      <span class="mono">pnpm-lock.yaml</span> and no pnpm on the runner it fails with
      <span class="mono">Unable to locate executable file: pnpm</span> before this Action has run a
      line of its own. Measured on 2026-09-25, when both demo jobs died there and the scan step was
      skipped; it looked like the publish had not worked.
    </p>

    <h2 id="scope">Declaring scope in CI</h2>
    <p>
      <span class="mono">keys-file</span> and <span class="mono">no-data-keys</span> are mutually
      exclusive, and <span class="mono">require-declared-scope</span> turns the absence of both
      into a failure. On a contract you own that is the right setting: an undeclared scope in CI is
      a gap in the check, not a caveat on the result.
    </p>
  `;
}
