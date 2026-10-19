/**
 * /docs/engine/guards/ — every layer between a scheduled run and a signature.
 */

export const meta = {
  title: 'Guards',
  description:
    'Dry-run by default, fee caps, the checks before anything is signed, and why a refusal is recorded rather than thrown.',
  heading: 'Guards',
  lead: 'The repository cron only scans and decides. A separate local operator path may sign and submit with explicit live opt-in; these guards constrain that path and record refusals.',
};

export function render() {
  return `
    <h2 id="layers">What keeps a contract out of reach</h2>
    <p>
      A contract the engine does not watch is a contract it never selects. That is the whole of it
      today, and it is worth saying plainly rather than implying a second layer that no longer
      exists.
    </p>
    <p class="note">
      There was a second one. A write guard held guinea-pigs B, C and their shared code entry by
      key and refused to write to them regardless of configuration, because they were
      natural-decay subjects whose ageing could not be recovered once an extension reset it. B
      expired on 21 September, C on 26 September, and the shared code entry was extended on
      14 October — every subject it held is spent, so the guard was retired rather than left
      holding an empty list. A guard that cannot fire and a guard that fires wrongly are the same
      defect seen from two sides.
    </p>
    <p class="note">
      The distinction it taught is the part worth keeping: <strong>the watched list is
      documentation, a guard is a mechanism.</strong> A pre-flight document once claimed that
      leaving a subject out of the watched list was enough, because “the engine still scans and
      decides, the guard still refuses”. It does not: the engine iterates the watched contracts,
      so an unwatched subject is never selected and the guard was never consulted. Measured
      against the real config, that produced two decisions and no refusal anywhere.
    </p>

    <h2 id="refusal">A refusal is recorded, not thrown</h2>
    <p>
      When a run declines a contract it records the reason with the subject named and continues to
      the next one. Two reasons, and both still hold for every check below:
    </p>
    <ul>
      <li>One declined subject must not abort a run, or a refusal on one contract would silence the engine for every other contract in the same pass.</li>
      <li><strong>The refusal is the evidence.</strong> A refusal leaves no transaction, no hash and no explorer trace, so the only proof it happened is the line in the run record.</li>
    </ul>

    <h2 id="before-signing">Before anything is signed</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Check</th><th scope="col">What it stops</th></tr></thead>
      <tbody>
        <tr><td class="num">mode</td><td>Omitted means dry-run. Live is explicit, never inferred.</td></tr>
        <tr><td class="num">network passphrase</td><td>Compared, not trusted. This is the mainnet guard.</td></tr>
        <tr><td class="num">payer resolution</td><td>Checked when the config is read. No fallback payer exists.</td></tr>
        <tr><td class="num">selected key / target</td><td>Only the entries named are touched; storage is never enumerated.</td></tr>
        <tr><td class="num">fee cap</td><td>A configured ceiling in stroops, applied per bump.</td></tr>
        <tr><td class="num">signed-envelope validation</td><td>The envelope is checked against what was planned before it goes out.</td></tr>
        <tr><td class="num">post-state check</td><td>The result is verified rather than assumed from a successful submission.</td></tr>
      </tbody>
    </table></div>
    <p class="provenance">
      These are the Stage 1 controls described in <span class="mono">docs/POLICY-SIGNER.md</span>.
      What is <em>not</em> implemented is described there too, and on
      <a class="site-more" href="/docs/reference/security/">Security and keys</a>.
    </p>

    <h2 id="idempotency">Overlapping runs</h2>
    <p>
      The local live path keeps an attempt journal and fails closed when a prior attempt is uncertain.
      An operator must retain that journal and reconcile its transaction hash against the chain
      before another attempt. Automatic cross-run reconciliation and an unattended live-submission
      scheduler are not shipped; the repository cron is decide-only. Do not use a lease timeout or a
      new journal path to bypass an uncertain attempt. See the
      <a class="site-more" href="https://github.com/Fatihmaull/evergreen/blob/main/docs/ENGINE-SETUP.md">engine setup guide</a>.
    </p>
  `;
}
