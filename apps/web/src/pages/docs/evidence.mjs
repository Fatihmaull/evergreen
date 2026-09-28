/**
 * /docs/evidence/ — evidence bundles.
 *
 * Moved out of the dashboard on 2026-09-26. The dashboard is an instrument for
 * reading the chain; the record of what this project proved is reference
 * material, and it was the fourth item in a sidebar "Reference" group that
 * duplicated the documentation wholesale. The real bundles in docs/evidence with their
 * real count, the one verification claim that can be made true, and milestones
 * stated as they stand. Nothing here is delivered that is not done.
 */
import { fmt } from '../_shared.mjs';

export const meta = {
  title: 'Evidence — Evergreen',
  description:
    'The committed evidence behind this project: testnet transactions, scans, scheduler runs, and how to verify them.',
  heading: 'The record',
  lead: 'Every claim on this site ends here: committed bundles of unedited RPC responses, explorer screenshots and verification scripts. Testnet is periodically reset — a hash pointing at a chain that no longer exists proves nothing, so the JSON and the screenshots travel with it.',
  script: null,
};

export function render(ctx) {
  return `<section class="stat-strip">
    <div class="stat">
      <p class="stat-label">committed bundles</p>
      <p class="stat-figure">${fmt(ctx.evidence.count)}</p>
      <p class="stat-caption">in docs/evidence/, counted at build time — not a remembered number</p>
    </div>
    <div class="stat">
      <p class="stat-label">extensions with hashes</p>
      <p class="stat-figure">5</p>
      <p class="stat-caption">9 Sep rescue ×3, 12 Sep manual save, 14 Sep engine save — each with its hash on the history page, plus the disclosed 5 Sep calibration round in the W1 inventory</p>
    </div>
    <div class="stat">
      <p class="stat-label">invented figures</p>
      <p class="stat-figure">0</p>
      <p class="stat-caption">a panel with no real number shows no number; an empty cell labelled “not measured” is fine</p>
    </div>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">Verify a bundle yourself</h2>
    <p class="muted">
      The manual-save proof ships an offline verifier. It checks semantic consistency anchored to the signed
      envelope — fee, sequence, payer, key and target bound to the transaction, signature and receipt verified,
      the receipt's own TTL state checked — with integrity via <span class="mono">SHA256SUMS</span> first.
      That is honestly what it checks: consistency with the envelope, not an independent re-observation of history.
    </p>
    <div class="terminal">node docs/evidence/2026-09-12-manual-extend-proof/verify-proof.mjs</div>
    <p class="small muted">Read-only and offline. Corrupt copies fail it; the original passes — six corruptions are rehearsed in the bundle's own review record.</p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">Verify the current manifests</h2>
    <p class="muted">
      Run <span class="mono">pnpm check:evidence-integrity</span> from the repository root. It checks
      every committed <span class="mono">SHA256SUMS</span> entry and is part of the full CI gate;
      the command reports the current bundle and file counts. A past count is not a current
      integrity verdict. The dated review records retain the two manifest defects found earlier,
      without rewriting or resealing their original evidence.
    </p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">Where the deliverables stand</h2>
    <p class="small muted">Snapshot: 28 September 2026. The repository's STATUS and evidence index carry later changes.</p>
    <p class="muted"><strong>CLI.</strong> Version 0.1.1 is public on npm; scanning, rent estimates and manual Testnet extension have recorded evidence.</p>
    <p class="muted"><strong>Auto-bump engine.</strong> A local OS timer triggered one unattended Testnet save. The repository cron is decide-only, not a live submission service; policy-signer Stage 2 remains Partial.</p>
    <p class="muted"><strong>Dashboard and Action.</strong> The dashboard is public and the Action is tagged v1 with an external green/red run. The 3–5 minute grant demo video is still pending in this snapshot.</p>
  </section>`;
}
