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

/** Route → nav. The active item is marked here, not by the client. */
export const NAV = [
  {
    section: 'Live reads',
    items: [
      { href: '/dashboard/', label: 'Overview' },
      { href: '/dashboard/scanner/', label: 'Contract scanner' },
      { href: '/dashboard/blast-radius/', label: 'Blast radius' },
      { href: '/dashboard/decay/', label: 'TTL decay' },
    ],
  },
  {
    section: 'Our own record',
    items: [
      { href: '/dashboard/contracts/', label: 'Our contracts' },
      { href: '/dashboard/engine/', label: 'Engine runs' },
      { href: '/dashboard/history/', label: 'Extension history' },
    ],
  },
  {
    section: 'Reference',
    items: [
      { href: '/docs/archival/', label: 'State archival' },
      { href: '/docs/', label: 'CLI reference' },
      { href: '/evidence/', label: 'Evidence' },
      { href: '/about/', label: 'About' },
    ],
  },
];

function navHtml(active) {
  return NAV.map(
    (group) => `<div class="nav-group">
        <p class="nav-section">${group.section}</p>
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
      <span class="status-item right dim">read-only · these pages never sign or submit</span>
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
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;500&family=Space+Mono:wght@400;700&display=swap" />
    <link rel="stylesheet" href="/assets/styles.css" />
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
          <p>Read-only. There is no extend, renew or broadcast control on any page here.</p>
        </div>
      </aside>
      <div class="content">
        ${statusBar(cadence)}
        <main id="main" class="main">
          <header class="page-head">
            <p class="eyebrow">${eyebrow}</p>
            <h1>${heading}</h1>
            ${lead ? `<p class="lead">${lead}</p>` : ''}
          </header>
          ${body}
        </main>
        <footer class="site">
          <div class="foot-row">
            <p>Built by Apex in the Stellar Ambassador Chapter Indonesia, under a Stellar Instawards grant. MIT.</p>
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
