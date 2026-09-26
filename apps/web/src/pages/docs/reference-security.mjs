/**
 * /docs/reference/security/ — what is enforced, and what is honestly not built.
 *
 * The second half of this page is the reason it exists. This project has
 * already had to delete a "Zero-Privilege Node · No Keys" claim from a design
 * export because it was false: the engine holds a funded testnet key. Saying
 * so plainly costs nothing and is the only version that survives scrutiny.
 */
export const meta = {
  title: 'Security and keys',
  description:
    'Where a secret may live, what the engine enforces before signing, and what is deliberately not implemented.',
  heading: 'Security and keys',
  lead: 'Evergreen signs transactions, so it holds a key. This page says where that key may live, what constrains it, and what protection is not implemented.',
};

export function render() {
  return `
    <h2 id="custody">It holds a key</h2>
    <p>
      The engine’s implemented execution path uses a <strong>plain funded Ed25519 account</strong>
      that you supply. It is a testnet payer, and it pays the fee for the TTL extension. There is
      no arrangement in which the tool extends a TTL without a key that can sign.
    </p>
    <p class="note">
      This is worth stating plainly because the opposite is easy to imply. A design export for
      this project once carried a “Zero-Privilege Node · No Keys” panel; it was removed because it
      was not true.
    </p>

    <h2 id="where">Where a secret may live</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Rule</th><th scope="col">Why</th></tr></thead>
      <tbody>
        <tr><td class="num">Environment variable, named in config</td><td>The config stores the variable’s NAME. A config carrying a key would be committed by someone, eventually, so the loader rejects anything that looks like one.</td></tr>
        <tr><td class="num">Never an argument</td><td>Arguments appear in shell history and in process lists. <span class="mono">--secret-env</span> takes a name.</td></tr>
        <tr><td class="num">No .env auto-loading</td><td>A tool that silently reads a file from the working directory will one day read the wrong one.</td></tr>
        <tr><td class="num">Diagnostics never echo it</td><td>Error messages report shapes and outcomes, never file contents or credentials — so output is safe to paste into an issue.</td></tr>
      </tbody>
    </table></div>

    <h2 id="enforced">What constrains the key</h2>
    <p>
      These controls apply on the normal execution path and are what stands between a
      misconfiguration and an unintended submission.
    </p>
    <ul>
      <li>Explicit-submit gating — nothing is sent without <span class="mono">--submit</span> or an explicit live <span class="mono">mode</span>.</li>
      <li>Selected-key and target checks — only the entries named are touched.</li>
      <li>Network validation by passphrase comparison, not by label.</li>
      <li>Configured fee caps, applied per bump.</li>
      <li>Protected-subject guards, which refuse regardless of configuration.</li>
      <li>Signed-envelope validation before submission.</li>
      <li>Post-state checks, so a result is verified rather than assumed.</li>
    </ul>

    <h2 id="not-built">What is not built</h2>
    <p>
      <strong>There is no policy signer.</strong> A policy signer is represented in the config and
      type seam for future adapters, and the current engine <em>rejects</em> that payer kind. It is
      not an activation switch for an implemented provider.
    </p>
    <p>
      The planned direct adapter was investigated and found not to deliver the protection it
      promised: Evergreen signs a native <span class="mono">ExtendFootprintTTL</span> transaction
      whose fee payer is a Stellar G-address, while passkey-style wallet policies authorize
      contract invocations through a wallet’s <span class="mono">__check_auth</span>. Those are
      different authorization paths, so installing that wallet does not constrain the separate
      transaction key that pays the native fee.
    </p>
    <p>
      The recorded disposition is no-go for the direct adapter, no automatic pivot to another
      framework, and full scoping deferred to the next scope of work. No alternative signing
      architecture becomes approved merely because the original path failed.
    </p>

    <h2 id="blast">What this means for you</h2>
    <p>
      Fund the payer with what you are willing to spend on rent and nothing more. The fee caps
      bound a single bump; the account balance is what bounds the total. Everything above
      constrains <em>correct</em> operation — none of it is a substitute for a payer that cannot
      afford a mistake.
    </p>
    <p class="provenance">
      The full record, including the feasibility report and the decision that closed it, is in
      <span class="mono">docs/POLICY-SIGNER.md</span> and ADR-002.
    </p>
  `;
}
