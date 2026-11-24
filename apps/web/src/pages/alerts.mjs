/** /dashboard/alerts/ — optional alert preferences for a signed-in account (PH2-E2-06). */
export const meta = {
  title: 'Alerts — Evergreen',
  description:
    'Turn optional testnet alert emails off or leave them on. Required alerts stay on. This page stores the choice and does not send mail.',
  active: '/dashboard/alerts/',
  eyebrow: 'Account · Stellar testnet',
  heading: 'Alerts',
  lead: 'Optional emails can be turned off. Required ones cannot. Signing in with email cannot move XLM.',
  script: '/assets/alerts.js',
};

export function render() {
  return `<section class="alerts" id="alerts" aria-live="polite"><p class="fine">reading…</p><noscript><p class="muted">This page needs JavaScript to ask the Evergreen API.</p></noscript></section>`;
}
