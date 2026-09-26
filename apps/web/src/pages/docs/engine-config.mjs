/**
 * /docs/engine/config/ — the configuration both the CLI and the engine read.
 *
 * The example file is read at build time and printed verbatim, minus its
 * underscore-prefixed documentation fields, so this page cannot describe a
 * field the loader does not accept.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Configuration',
  description:
    'evergreen.config.json field by field: network, defaults, contracts, payers, notifications and mode.',
  heading: 'Configuration',
  lead: 'One file, shared by the CLI and the engine so their behaviour cannot drift. Three of its properties are enforced by the loader rather than described in a comment.',
};

export function render(ctx) {
  return `
    <h2 id="file">The file</h2>
    <p>
      Copy <span class="mono">evergreen.config.example.json</span> to
      <span class="mono">evergreen.config.json</span> and edit it. Fields beginning with an
      underscore are documentation and are ignored.
    </p>
    <div class="terminal">${esc(ctx.engineConfig)}</div>

    <h2 id="enforced">What the loader enforces</h2>
    <p>
      These are not conventions. The loader validates them at the input boundary, so a bad config
      fails when it is read rather than when a bump tries to sign.
    </p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Rule</th><th scope="col">Why</th></tr></thead>
      <tbody>
        <tr><td class="num">Omitted mode means dry-run</td><td>Live is an explicit opt-in. A config that forgot to say so does not submit.</td></tr>
        <tr><td class="num">Every contract’s payer must resolve</td><td>Checked when the file is read, not discovered mid-run with half the contracts already processed.</td></tr>
        <tr><td class="num">Only testnet</td><td>The passphrase is compared against the expected value. A label saying “testnet” proves nothing.</td></tr>
        <tr><td class="num">Secrets are named, never stored</td><td>A config carrying a secret key would be committed by someone, eventually. The loader rejects anything that looks like one.</td></tr>
      </tbody>
    </table></div>

    <h2 id="fields">The fields</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Field</th><th scope="col">Meaning</th></tr></thead>
      <tbody>
        <tr><td class="num">network.rpcUrl</td><td>The Soroban RPC endpoint every read goes through.</td></tr>
        <tr><td class="num">network.networkPassphrase</td><td>Compared, not trusted. This is the mainnet guard.</td></tr>
        <tr><td class="num">defaults.warnBelowLedgers</td><td>The warning tier. 120,960 ledgers, about seven days.</td></tr>
        <tr><td class="num">defaults.bumpWhenRemainingLedgersBelow</td><td>The act-now tier. 17,280 ledgers, about one day. Inclusive.</td></tr>
        <tr><td class="num">defaults.extendToLedgers</td><td>How far an extension reaches. 518,400 ledgers, about thirty days.</td></tr>
        <tr><td class="num">contracts[]</td><td>An id, a label used in logs and alerts, and which payer funds its extensions.</td></tr>
        <tr><td class="num">payers.&lt;name&gt;.signer</td><td>The signer kind. <span class="mono">ed25519</span> is the implemented one. <a class="site-more" href="/docs/reference/security/">Security</a></td></tr>
        <tr><td class="num">payers.&lt;name&gt;.secretEnvVar</td><td>The NAME of an environment variable. Never the secret.</td></tr>
        <tr><td class="num">notifications.channel</td><td>Email. <a class="site-more" href="/docs/engine/notifications/">Notifications</a></td></tr>
        <tr><td class="num">notifications.toEnvVar</td><td>The name of the variable holding the recipient.</td></tr>
        <tr><td class="num">mode</td><td><span class="mono">dry-run</span> or live. Omitted means dry-run.</td></tr>
      </tbody>
    </table></div>

    <h2 id="adding">Adding a contract safely</h2>
    <p>
      Adding an entry to <span class="mono">contracts</span> does not extend anything by itself —
      the engine correctly does nothing until a threshold is crossed. The danger is a
      <em>mismatched threshold</em>, not the entry. Add, dry-run, confirm no action, then go live.
    </p>
  `;
}
