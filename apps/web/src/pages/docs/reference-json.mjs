/**
 * /docs/reference/json/ — the machine record, printed from its declaration.
 *
 * The declaration in `packages/shared-types` is authoritative. This page shows
 * it rather than paraphrasing it, because a paraphrase of a type is a second
 * type that nothing checks.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'JSON shape',
  description:
    'The ScanResult printed by evergreen scan --json, shown from the TypeScript declaration that defines it.',
  heading: 'JSON shape',
  lead: '--json prints a ScanResult. The declaration below is the authoritative one, read from the package that defines it rather than retyped here.',
};

export function render(ctx) {
  return `
    <h2 id="declaration">The declaration</h2>
    <div class="terminal">${esc(ctx.scanResultType)}</div>
    <p class="provenance">
      Read from <span class="mono">packages/shared-types/src/index.ts</span> at build time. Every
      JSON panel on this site prints the same shape the CLI prints.
    </p>

    <h2 id="entries">Entries are keyed by ledger key</h2>
    <p>
      Not by contract. A ledger key identifies the entry itself, and the same key can serve several
      contracts — that is exactly what a shared code entry is. Each entry carries the contracts it
      serves, so the relationship is readable in the direction the chain can actually answer.
    </p>

    <h2 id="issues">Read the issues, not just the grade</h2>
    <p>
      The human report compresses issues into a count. The JSON carries each one with its code and
      the contracts it applies to, and a consumer that reads only the health grade will treat a
      partial scan as a complete one.
      <a class="site-more" href="/docs/reference/states/">Undetermined, unread, not found</a>
    </p>

    <h2 id="stability">What you can rely on</h2>
    <p>
      The shape is versioned with the package. Ledgers are integers and are the authoritative
      values; any date in the output is derived at five seconds per ledger and is an estimate. If
      you are building on this, compare ledgers and render dates.
    </p>
  `;
}
