/**
 * /docs/cli/extend/ — the write path, and every guard between a reader and a
 * submitted transaction.
 *
 * This page exists because hiding half the CLI from a developer is not the
 * same as being careful. The guards are the most convincing thing about this
 * command, so they are documented before the flags are.
 *
 * The help block is read from `packages/cli/src/extend.ts` at build time, and
 * the build refuses if `--submit`, `--secret-env`, `--max-fee-stroops` or
 * "Testnet only" ever stop appearing in it — a page that retypes a guard can
 * quietly lose one.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'evergreen extend',
  description:
    'The Evergreen write path: simulate by default, explicit submit, secrets by environment variable name, and a mandatory fee cap.',
  heading: 'evergreen extend',
  lead: 'Builds a TTL extension and simulates it. Submitting is a separate, explicit decision that needs a flag, a named secret variable and a fee cap — and it is testnet only.',
};

export function render(ctx) {
  return `
    <h2 id="default">It simulates unless you insist</h2>
    <p>
      Running <span class="mono">extend</span> with no submission flags builds the operation,
      simulates it against the network and tells you what would happen. Nothing is signed and
      nothing is sent. <span class="mono">--dry-run</span> exists so a script can state that
      intention rather than rely on the absence of a flag, and it is mutually exclusive with
      <span class="mono">--submit</span>.
    </p>
    <p class="note">
      <strong>Simulation success does not mean the TTL changed.</strong> It means the network
      accepted the shape of the operation. Until you submit, nothing on chain has moved.
    </p>

    <h2 id="guards">The guards</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Guard</th><th scope="col">What it prevents</th></tr></thead>
      <tbody>
        <tr><td class="num">simulate by default</td><td>A command that submits because a flag was forgotten.</td></tr>
        <tr><td class="num">--submit required</td><td>Submission as a side effect of any other option.</td></tr>
        <tr><td class="num">--secret-env NAME</td><td>A secret in shell history, in a process list, or in a committed script. The value is never an argument, and there is no <span class="mono">.env</span> auto-loading.</td></tr>
        <tr><td class="num">--max-fee-stroops N</td><td>An unbounded fee. The cap is an aggregate in integer stroops and it is mandatory with <span class="mono">--submit</span>.</td></tr>
        <tr><td class="num">explicit payer</td><td>Silent use of some default account. Supply <span class="mono">--source-account</span> or <span class="mono">EVERGREEN_SOURCE_ACCOUNT</span>; there is no fallback payer.</td></tr>
        <tr><td class="num">testnet passphrase check</td><td>A mainnet submission from a mislabelled config. The passphrase is compared, not a label trusted.</td></tr>
        <tr><td class="num">--include-code opt-in</td><td>Extending Wasm shared with contracts you cannot see, without meaning to.</td></tr>
        <tr><td class="num">no auto restore or funding</td><td>The tool quietly spending more than the operation you asked for.</td></tr>
        <tr><td class="num">no replacement send</td><td>A double submission after an uncertain result. An unconfirmed result is reported, not retried.</td></tr>
      </tbody>
    </table></div>

    <h2 id="usage">Usage</h2>
    <div class="terminal">${esc(ctx.cli.extendHelp)}</div>
    <p class="provenance">
      Printed by <span class="mono">evergreen extend --help</span>, read from
      <span class="mono">packages/cli/src/extend.ts</span> at build time.
    </p>

    <h2 id="selection">What gets extended</h2>
    <p>
      The instance entry by default. A keys file adds explicit data keys, in the same shape the
      scanner takes — <span class="mono">{ "dataKeys": ["base64 XDR LedgerKey", ...] }</span>.
      Storage is never enumerated, so what you do not name is not touched.
    </p>
    <p>
      <span class="mono">--ledgers N</span> adds N to each selected entry’s <em>current</em>
      remaining TTL. The protocol wants an absolute target, so the CLI computes it for you and caps
      it at <span class="mono">max_entry_ttl - 1</span>, saying so when it does.
    </p>

    <h2 id="exits">What the exit code means here</h2>
    <p>
      <span class="mono">0</span> is a complete simulation, a no-op, or a verified live result.
      <span class="mono">2</span> is an error, or a partial or unconfirmed result. There is no exit
      code that means “probably worked”.
      <a class="site-more" href="/docs/cli/exit-codes/">Exit codes</a>
    </p>
  `;
}
