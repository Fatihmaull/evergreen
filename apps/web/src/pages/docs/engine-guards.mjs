/**
 * /docs/engine/guards/ — every layer between a scheduled run and a signature.
 */
import { esc } from '../_shared.mjs';

export const meta = {
  title: 'Guards',
  description:
    'Dry-run by default, the write guard and its protected subjects, fee caps, and why a refusal is recorded rather than thrown.',
  heading: 'Guards',
  lead: 'The engine is allowed to sign. Everything on this page exists so that it only does so when you meant it to, and so that a refusal leaves a record.',
};

export function render(ctx) {
  const subjects = ctx.guard.subjects
    .map(
      (s) =>
        `<tr><td class="num">${esc(s.label)}</td><td class="num">${esc(s.id.slice(0, 10))}…</td><td>Crosses ${esc(s.alert)}, expires ${esc(s.expires)}</td></tr>`,
    )
    .join('');
  return `
    <h2 id="layers">Two independent layers</h2>
    <p>
      A contract can be kept out of the engine’s reach two ways: by not being in the watched list,
      and by the write guard refusing it. These are deliberately separate, so that
      <strong>a misconfiguration and a code path have to fail together</strong> for a protected
      contract to be touched.
    </p>
    <p class="note">
      The list is documentation; the guard is a mechanism. That distinction was learned the hard
      way — a pre-flight document once claimed that leaving a subject out of the watched list was
      enough, because “the engine still scans and decides, the guard still refuses”. It does not:
      the engine iterates the watched contracts, so an unwatched subject is never selected and the
      guard is never consulted. Measured against the real config, that produced two decisions and
      no refusal anywhere.
    </p>

    <h2 id="protected">Protected subjects</h2>
    <p>
      The guard refuses to write to these regardless of configuration, because they are
      natural-decay subjects whose ageing cannot be recovered once an extension resets it.
    </p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Subject</th><th scope="col">Contract</th><th scope="col">Schedule</th></tr></thead>
      <tbody>${subjects}</tbody>
    </table></div>

    <h2 id="refusal">A refusal is recorded, not thrown</h2>
    <p>
      When the guard declines, the run records <span class="mono">REFUSED BY WRITE GUARD</span>
      with the subject named, and continues to the next contract. Two reasons, and both matter:
    </p>
    <ul>
      <li>One protected subject must not abort a run, or a guard on one contract would silence the engine for every other contract in the same pass.</li>
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
      A scheduled job can overlap itself if a run is slow, so the engine has to survive seeing the
      same work twice. Recovery for a process that died mid-flight is reconciliation against the
      recorded transaction hash — not a lease timer, which would reintroduce exactly the double
      send the current design prevents.
    </p>
  `;
}
