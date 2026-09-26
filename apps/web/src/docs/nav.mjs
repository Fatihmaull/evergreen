/**
 * The documentation sitemap — one source of truth for the sidebar, the route
 * manifest check, and the "next page" links at the foot of every page.
 *
 * EVERY PAGE HERE DOCUMENTS SOMETHING THAT EXISTS. That is the whole editorial
 * rule, and it is the reason this tree is not the one the blueprint proposed.
 * Dropped, with the receipt for each:
 *
 *   daemon deployment      ADR-001 chose a scheduled job and rejected a
 *                          long-running service by name.
 *   policy-signer          `docs/POLICY-SIGNER.md`: "Stage2 policy signer is
 *                          not available"; the engine rejects that payer kind.
 *                          Deferred to SOW 2 in #183, recorded in ADR-002.
 *   AWS KMS                nothing in the repository.
 *   Discord/Telegram/Slack `NotificationChannel` resolves to email.
 *   mainnet pipelines      no mainnet path exists, and none may be implied.
 *
 * Added, because the blueprint missed it: the CODE entry. It lists three
 * storage kinds; Soroban has four, and the fourth is this project's thesis —
 * one entry shared by every contract built from the same Wasm, 98% of the
 * bill, and they stop together.
 */

/** @typedef {{ route: string, title: string, blurb: string, live?: boolean }} DocPage */
/** @typedef {{ label: string, pages: DocPage[] }} DocGroup */

/**
 * GROUPS APPEAR HERE ONLY WHEN THEIR PAGES EXIST. A sidebar entry is a
 * promise that a page is one click away, and a tree listing pages that are
 * not written yet is a list of 404s wearing a table of contents. Engine,
 * continuous integration and reference follow as they are written.
 */

/** @type {DocGroup[]} */
export const DOC_NAV = [
  {
    label: 'Getting started',
    pages: [
      {
        route: '/docs/',
        title: 'Overview',
        blurb: 'What Evergreen is, what it refuses to do, and where to start.',
      },
      {
        route: '/docs/quickstart/',
        title: 'Quickstart',
        blurb: 'Scan a real contract on testnet in one command, with no key and no account.',
      },
      {
        route: '/docs/mental-model/',
        title: 'How state archival works',
        blurb: 'Four kinds of ledger entry, two ways of ending, and the one that cannot be undone.',
      },
      {
        route: '/docs/archival/',
        title: 'What the network says about archival',
        blurb: 'The archival settings this network is running, read live when the page loads.',
        live: true,
      },
    ],
  },
  {
    label: 'Command line',
    pages: [
      {
        route: '/docs/cli/',
        title: 'Install and conventions',
        blurb: 'Two commands, the arguments they share, and what the tool will never do.',
      },
      {
        route: '/docs/cli/scan/',
        title: 'evergreen scan',
        blurb: 'Read a contract’s entries: every flag, and what each one changes.',
      },
      {
        route: '/docs/cli/extend/',
        title: 'evergreen extend',
        blurb:
          'The write path — simulate by default, and every guard between you and a submission.',
      },
      {
        route: '/docs/cli/output/',
        title: 'Output',
        blurb: 'The human report, and --json for machines.',
      },
      {
        route: '/docs/cli/exit-codes/',
        title: 'Exit codes',
        blurb: '0, 1, 2, 3 — and why precedence is 2 > 3 > 1 > 0.',
      },
    ],
  },
  {
    label: 'Engine',
    pages: [
      {
        route: '/docs/engine/',
        title: 'What the engine is',
        blurb: 'A scheduled job that decides. Not a daemon, and the difference is deliberate.',
      },
      {
        route: '/docs/engine/config/',
        title: 'Configuration',
        blurb: 'evergreen.config.json, field by field, shared by the CLI and the engine.',
      },
      {
        route: '/docs/engine/thresholds/',
        title: 'Thresholds and cadence',
        blurb: 'Two tiers in ledgers, an inclusive boundary, and why the schedule sets the floor.',
      },
      {
        route: '/docs/engine/guards/',
        title: 'Guards',
        blurb: 'Dry-run by default, the write guard, protected subjects and fee caps.',
      },
      {
        route: '/docs/engine/notifications/',
        title: 'Notifications',
        blurb: 'Three events, one channel, and the channels that do not exist.',
      },
    ],
  },
  {
    label: 'Continuous integration',
    pages: [
      {
        route: '/docs/ci/',
        title: 'The GitHub Action',
        blurb: 'Fail a pull request when a contract is closer to expiry than you allow.',
      },
      {
        route: '/docs/ci/reference/',
        title: 'Action reference',
        blurb: 'Every input, the one output, and what the runner installs.',
      },
    ],
  },
  {
    label: 'Reference',
    pages: [
      {
        route: '/docs/reference/json/',
        title: 'JSON shape',
        blurb: 'ScanResult, shown from the declaration that defines it.',
      },
      {
        route: '/docs/reference/states/',
        title: 'Undetermined, unread, not found',
        blurb: 'Three ways a scan declines to conclude. Absence is not health.',
      },
      {
        route: '/docs/reference/rent/',
        title: 'Rent and cost',
        blurb: 'How rent is priced, what we measured paying, and why batching is cheaper.',
      },
      {
        route: '/docs/reference/errors/',
        title: 'Errors and troubleshooting',
        blurb: 'What each failure means and what to do about it.',
      },
      {
        route: '/docs/evidence/',
        title: 'The record',
        blurb: 'Every committed evidence bundle, counted at build time.',
      },
      {
        route: '/docs/reference/security/',
        title: 'Security and keys',
        blurb: 'Where a secret may live, what is enforced, and what is honestly not built.',
      },
    ],
  },
];

/** Flat, in reading order — for the next/previous links and the build's checks. */
export const DOC_PAGES = DOC_NAV.flatMap((group) =>
  group.pages.map((page) => ({ ...page, group: group.label })),
);

/** The group a route belongs to, which is the eyebrow above its heading. */
export function groupOf(route) {
  return DOC_PAGES.find((page) => page.route === route)?.group ?? null;
}

/** The page after this one in reading order, or null at the end. */
export function nextOf(route) {
  const index = DOC_PAGES.findIndex((page) => page.route === route);
  return index >= 0 && index + 1 < DOC_PAGES.length ? DOC_PAGES[index + 1] : null;
}
