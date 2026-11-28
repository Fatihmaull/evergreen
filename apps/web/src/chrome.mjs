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
 * Dashboard IA, second pass (hi-fi, 2026-11-28): Overview, Contracts,
 * Activity, Autopilot. Tools stay visible: Scanner, Shared code, Time left.
 * Account, Alerts and Docs sit at the bottom. Our own contracts stay out.
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
      { href: '/dashboard/allowance/', label: 'Autopilot' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { href: '/dashboard/scanner/', label: 'Scanner' },
      { href: '/dashboard/blast-radius/', label: 'Shared code' },
      { href: '/dashboard/decay/', label: 'Time left' },
    ],
  },
];

/** Bottom of the sidebar. chrome.js relabels Sign in to Account when /me has a session. */
export const ACCOUNT_NAV = [
  { href: '/login/', label: 'Sign in' },
  { href: '/dashboard/alerts/', label: 'Alerts' },
  { href: '/docs/', label: 'Docs' },
];

function itemHtml(item, active) {
  return `<a class="nav-item${item.href === active ? ' active' : ''}" href="${item.href}"${
    item.href === active ? ' aria-current="page"' : ''
  }>${item.label}</a>`;
}

function navHtml(active) {
  return NAV.map((group) => {
    const links = group.items.map((item) => itemHtml(item, active)).join('');
    if (group.collapsed) {
      const open = group.items.some((item) => item.href === active);
      return `<div class="nav-group"><details class="nav-tools"${open ? ' open' : ''}>
        <summary class="nav-section">${group.section}</summary>
        ${links}
      </details></div>`;
    }
    return `<div class="nav-group">${links}</div>`;
  }).join('');
}

/**
 * The status bar carries two things only: which network, and which ledger we are
 * reading. The ledger is filled in by a live read and says so if it fails; it is
 * never a number baked into the page.
 */
function statusBar(cadence) {
  return `<div class="statusbar">
      <span class="status-item"><span class="dot"></span>Testnet</span>
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
        <div class="sidebar-end">
          <div class="nav-group account-links">${ACCOUNT_NAV.map((item) => itemHtml(item, active)).join('')}</div>
          <p class="sidebar-foot mono">testnet only</p>
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
