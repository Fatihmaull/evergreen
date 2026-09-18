/**
 * /evidence/ — evidence bundles. The real bundles in docs/evidence with their
 * real count, the one verification claim that can be made true, and milestones
 * stated as they stand. Nothing here is delivered that is not done.
 */
import { esc, fmt } from './_shared.mjs';

export const meta = {
  title: 'Evidence — Evergreen',
  description:
    'The committed evidence behind this project: testnet transactions, scans, scheduler runs, and how to verify them.',
  active: '/evidence/',
  eyebrow: 'Evidence · Stellar Instawards, not the Community Fund',
  heading: 'The record, not the brochure',
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
    <h2 class="section">Where the deliverables stand</h2>
    <p class="muted"><strong>CLI.</strong> Scanning, rent estimates, manual extension proven on testnet with hashes. Evidence present.</p>
    <p class="muted"><strong>Auto-bump engine.</strong> Decide-only runs, one engine-triggered save from a local timer, alert templates delivered. The production cron running unattended against a crossing is the September gate — open until B crosses.</p>
    <p class="muted"><strong>Dashboard, Action, docs.</strong> This preview is the dashboard taking shape; the Action and the published package are Week 4 work. Not done, not claimed.</p>
  </section>`;
}
