/**
 * /dashboard/engine/ — engine runs. Not a daemon console: the engine is a
 * scheduled job, so this page shows what it decided, what it refused and why,
 * plus the one honest number about the scheduler itself.
 */
import { esc } from './_shared.mjs';

export const meta = {
  title: 'Engine runs — Evergreen',
  description:
    'What the scheduled auto-bump engine decided, refused, and actually did — including what its scheduler really delivers.',
  active: '/dashboard/engine/',
  eyebrow: 'Engine runs · a scheduled job, not a daemon',
  heading: 'What the engine did, and what its scheduler delivers',
  lead: 'There is no daemon, no uptime, no CPU telemetry: ADR-001 made the engine a cron-scheduled job. Its runs are visible as workflow runs in the repository. What follows is what the record actually supports — including the part that flatters nobody.',
  script: null,
};

export function render() {
  return `<section class="card card-pad stack">
    <h2 class="section">The scheduler delivers about 7% of its declared cadence</h2>
    <p class="muted">
      Declared: every 15 minutes. Observed across 18 consecutive cron starts: median gap 174 minutes,
      worst 368 minutes — roughly three hours typical, six at worst, about 7.5% of declared slots.
      Sources: <span class="mono">docs/evidence/2026-09-14-scheduler-cadence/</span> and the operations
      check of 16 September.
    </p>
    <p class="muted">
      This is survivable because the action threshold is a full day of warning — 17,280 ledgers at five
      seconds each. Even the worst observed gap fires at least four times inside a 24-hour window, seven
      to ten at the median. The margin comes from the threshold, not from the scheduler.
    </p>
    <p class="small muted">Last run: see the workflow runs in the repository — a static page cannot know it. No countdown is shown anywhere here, because there is no honest number for one.</p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">What it decided</h2>
    <p class="muted">
      Decide-only runs read the watched entries, resolve one target per key, refuse expired candidates and
      protected subjects, and record skips with reasons. The correction history is committed:
      <span class="mono">docs/evidence/2026-09-12-engine-decision-correction/</span> (targets, expiry refusal,
      shared-payer agreement) and <span class="mono">docs/evidence/2026-09-13-engine-thresholds/</span>
      (warning tier visible without becoming action).
    </p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">What it actually extended</h2>
    <p class="muted">
      One unattended extension is on the record: guinea-pig A's instance on 14 September, decided and
      submitted from a local timer at ledger 4,670,261, fee charged 44,725 stroops — with the threshold
      deliberately raised to 1,500,000 so it would act. As far as the record goes, the production cron has
      never extended anything; no row on this site claims otherwise.
      Every extension, whoever triggered it, is on <a href="/dashboard/history/">the extension history</a>.
    </p>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">What it refused</h2>
    <p class="muted">
      Guinea-pigs B and C sit outside the watched config until their crossings, and the write guard refuses
      them — and the shared code entry — by default, naming the date an override would spend. If the engine
      saw them early it would dutifully bump them and destroy weeks of ageing with no error anywhere. The
      refusal is the feature.
    </p>
  </section>`;
}
