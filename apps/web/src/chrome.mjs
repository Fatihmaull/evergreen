/**
 * The shell every dashboard and reference page sits inside: sidebar, status bar,
 * footer. It is a build-time template rather than a component, so the pages that
 * need no JavaScript ship none.
 *
 * What the export set had here and this does not: a protocol version number, an
 * RPC latency readout, a ticking UTC clock, a per-byte base rent, and a
 * "Zero-Privilege Node · No Keys" panel. The first three change or are not
 * measured, the fourth is not how rent works, and the last is false — the engine
 * holds a funded testnet fee key.
 */

/**
 * Route → nav. The active item is marked here, not by the client.
 *
 * Dashboard revamp (components.md § "Dashboard revamp: overview", Fatih
 * 2026-11-24): the person's own pages first with no section label, then
 * Tools, then Settings. Our own contracts, engine runs and extension history
 * left the dashboard nav: they are public evidence, not the person's data,
 * and their pages stay reachable from the docs and /about/.
 *
 * Activity lists the engine's jobs. Until the API serves them its page says
 * so in one line (components.md § "Where the data comes from today").
 */
export const NAV = [
  {
    section: '',
    items: [
      { href: '/dashboard/', label: 'Overview' },
      // The watchlist, renamed. The route stays so old links keep working.
      { href: '/dashboard/watchlist/', label: 'Contracts' },
      { href: '/dashboard/activity/', label: 'Activity' },
      { href: '/allowance/', label: 'Allowance' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { href: '/dashboard/scanner/', label: 'Scanner' },
      { href: '/dashboard/blast-radius/', label: 'Blast radius' },
      { href: '/dashboard/decay/', label: 'TTL decay' },
    ],
  },
  {
    section: 'Settings',
    items: [
      { href: '/dashboard/alerts/', label: 'Alerts' },
      // chrome.js relabels this "Account" when /me answers with a session.
      { href: '/login/', label: 'Sign in' },
      { href: '/docs/', label: 'Documentation' },
    ],
  },
];

function navHtml(active) {
  return NAV.map(
    (group) => `<div class="nav-group">
        ${group.section ? `<p class="nav-section">${group.section}</p>` : ''}
        ${group.items
          .map(
            (item) =>
              `<a class="nav-item${item.href === active ? ' active' : ''}" href="${item.href}"${
                item.href === active ? ' aria-current="page"' : ''
              }>${item.label}</a>`,
          )
          .join('')}
      </div>`,
  ).join('');
}

/**
 * The status bar carries two things only: which network, and which ledger we are
 * reading. The ledger is filled in by a live read and says so if it fails; it is
 * never a number baked into the page.
 */
function statusBar(cadence) {
  return `<div class="statusbar">
      <span class="status-item"><span class="dot"></span>Soroban testnet</span>
      <span class="status-item">ledger <span class="mono" id="live-ledger" data-live-ledger>reading…</span></span>
      <span class="status-item dim">ledger close ${cadence.value} <span class="dim">· measured, not assumed</span></span>
    </div>`;
}

export function shell({
  title,
  description,
  active,
  eyebrow,
  heading,
  lead,
  body,
  script,
  cadence,
  bare,
  panel,
}) {
  // `bare`: the page draws its own head (the revamp's `.ov-head`, with up to
  // two buttons beside the heading). `panel`: the side panel's slot, beside
  // main; the page fills it and sets `body.panel-open`.
  const head = bare
    ? ''
    : `<header class="page-head">
            <p class="eyebrow">${eyebrow}</p>
            <h1>${heading}</h1>
            ${lead ? `<p class="lead">${lead}</p>` : ''}
          </header>`;
  const main = `<main id="main" class="main${bare ? ' overview' : ''}">
          ${head}
          ${body}
        </main>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Newsreader:opsz,wght@6..72,400&family=Space+Mono&display=swap" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
  </head>
  <body class="app">
    <a class="skip" href="#main">Skip to content</a>
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true"></span>
          <span><span class="brand-name">Evergreen</span><span class="brand-sub">Soroban state</span></span>
        </a>
        <nav aria-label="Sections">${navHtml(active)}</nav>
        <div class="sidebar-foot">
          <p class="mono">testnet only</p>
        </div>
      </aside>
      <div class="content">
        ${statusBar(cadence)}
        <div class="with-panel">${main}${panel ? `<aside class="panel-side" id="side-panel" aria-label="Details" hidden></aside>` : ''}</div>
        <footer class="site">
          <div class="foot-row">
            <p>Built for Stellar, backed by Instawards.</p>
            <p><a href="https://github.com/Fatihmaull/evergreen">github.com/Fatihmaull/evergreen</a></p>
          </div>
        </footer>
      </div>
    </div>
    <script src="/assets/chrome.js"></script>
    ${script ? `<script src="${script}"></script>` : ''}
  </body>
</html>
`;
}
