/**
 * The dashboard package: the routes this site publishes, and where they come
 * from.
 *
 * The application itself is not here. Its source is `apps/web/src/` and its
 * build is `apps/web/build.mjs`, which renders static HTML plus per-page
 * browser bundles into `apps/dashboard/public/` — the directory the Cloudflare
 * Pages project publishes from `main`. That split exists because the pages are
 * read-only and mostly static; a framework would add a runtime to a site whose
 * heaviest page is one scan form.
 *
 * This file is the route manifest, and it is load-bearing rather than
 * descriptive: `build.mjs` imports it and refuses to finish if the pages it
 * emitted and the routes listed here disagree in either direction. A route
 * added to the build without a line here fails, and so does a line here with
 * no page behind it.
 *
 * **No wallet, no signup, no accounts, and no write path.** Extending a TTL is
 * permissionless, so the site never needs authority over anyone's contract and
 * never asks for any. `W4-D24-04` cut wallet-connect deliberately; there are no
 * disabled controls standing in for it, because a disabled control is a promise
 * with a date on it.
 */

export interface DashboardRoute {
  /** Published path. Cloudflare Pages resolves `/x/` to `x/index.html`. */
  readonly route: string;
  /** What a visitor can do here, in one line. */
  readonly does: string;
  /** Whether the page reads the chain in the browser, or renders committed data at build time. */
  readonly reads: 'live' | 'committed';
}

export const ROUTES: readonly DashboardRoute[] = [
  { route: '/', does: 'The problem, the thesis, and a real scan capture.', reads: 'committed' },
  {
    route: '/dashboard/',
    does: 'Scan any contract, and the live state of the three this project runs against.',
    reads: 'live',
  },
  { route: '/dashboard/scanner/', does: 'The scan panel on its own page.', reads: 'live' },
  {
    route: '/dashboard/blast-radius/',
    does: 'Scan several contracts together to resolve what one scan cannot.',
    reads: 'live',
  },
  {
    route: '/dashboard/decay/',
    does: 'Recorded TTL observations for all three subjects, with the expiry that happened.',
    reads: 'committed',
  },
  {
    route: '/dashboard/contracts/',
    does: 'What each of A, B and C is for, and which entry binds it.',
    reads: 'committed',
  },
  {
    route: '/dashboard/engine/',
    does: 'What the engine did, and what its scheduler actually delivers.',
    reads: 'committed',
  },
  {
    route: '/dashboard/history/',
    does: 'Every extension that happened, with its transaction and fee.',
    reads: 'committed',
  },
  {
    route: '/docs/archival/',
    does: 'State archival, with the network parameters read live.',
    reads: 'live',
  },
  {
    route: '/docs/',
    does: 'What Evergreen is, what it refuses to do, and where to start.',
    reads: 'committed',
  },
  {
    route: '/docs/quickstart/',
    does: 'Scan a real testnet contract in one command, with no key and no account.',
    reads: 'committed',
  },
  {
    route: '/docs/mental-model/',
    does: 'The four kinds of ledger entry, and which endings can be undone.',
    reads: 'committed',
  },
  {
    route: '/docs/cli/',
    does: 'Install, the two commands, and the conventions they share.',
    reads: 'committed',
  },
  {
    route: '/docs/cli/scan/',
    does: "Every flag of `evergreen scan`, generated from the tool's own help text.",
    reads: 'committed',
  },
  {
    route: '/docs/cli/extend/',
    does: 'The write path and every guard between the reader and a submission.',
    reads: 'committed',
  },
  {
    route: '/docs/cli/output/',
    does: 'The human report, and --json for machines.',
    reads: 'committed',
  },
  {
    route: '/docs/cli/exit-codes/',
    does: 'Exit codes 0/1/2/3 and why precedence is 2 > 3 > 1 > 0.',
    reads: 'committed',
  },
  {
    route: '/evidence/',
    does: 'Every committed evidence bundle, counted at build time.',
    reads: 'committed',
  },
  {
    route: '/about/',
    does: 'Who builds this, under which grant, and the method.',
    reads: 'committed',
  },
];

/** `/x/` → `x/index.html`, the file the build writes and Pages serves. */
export function pageFor(route: string): string {
  return `${route.replace(/^\/|\/$/g, '')}/index.html`.replace(/^\//, '');
}
