/**
 * /about/ — team, grant, chapter, method. Nothing ships that is not in the
 * repository, the PRD or the SOW. No peer review claimed, no chapter IDs, no
 * governance invented, no "gas".
 */
import {} from './_shared.mjs';

export const meta = {
  title: 'About — Evergreen',
  description: 'Who builds Evergreen, under which grant, and how the work is evidenced.',
  active: '/about/',
  layout: 'site',
  eyebrow: 'About · the team and the terms',
  heading: 'Built by Apex, evidenced like it matters',
  lead: 'Evergreen is built by Apex — Fatih Maulana and Rakha — in the Stellar Ambassador Chapter Indonesia, under a funded Stellar Instawards grant: $4,800, thirty days, 3 September to 2 October 2026. The chapter is where the team sits; it does not govern the code.',
  script: null,
};

export function render() {
  return `<section class="prose">
    <div class="site-wrap">
      <div class="people">
        <div>
          <p class="how-name">Fatih Maulana</p>
          <p>Product, coordination, evidence — and the SOW's primary contact. CLI, dashboard, docs, demo video, Ambassador liaison.</p>
        </div>
        <div>
          <p class="how-name">Rakha</p>
          <p>Engine, contracts, infrastructure. The auto-bump worker, threshold rules, the notification channel — and the signatures on the transactions.</p>
        </div>
        <div>
          <p class="how-name">The grant</p>
          <p>Stellar Instawards. A follow-on SCF Build Award application is the stated next step — it appears here as a possible follow-on, not as the program this is.</p>
        </div>
      </div>
    </div>
  </section>
  <section class="prose">
    <div class="site-wrap">
      <h2>Method: measured rather than assumed</h2>
      <p>
        The TTL floor per entry type was measured on a fresh deploy, not read from documentation. The permissionless
        property was confirmed by extending someone else's contract on testnet, not by quoting the docs. The rent
        model was validated against a real fee recorded a day earlier — and the first implementation failed that
        comparison, so it was replaced. Corrections stay in the record: the repository keeps its architecture
        decision records amended, never rewritten, because the reasoning at the time is the valuable part.
      </p>
      <p>
        The work is public at <a class="site-more" href="https://github.com/Fatihmaull/evergreen">github.com/Fatihmaull/evergreen</a>
        under MIT. Nothing on this page — no title, no ID, no privilege — exists outside that repository, the PRD
        or the statement of work.
      </p>
    </div>
  </section>`;
}
