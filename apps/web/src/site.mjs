/**
 * The marketing shell: `/`, `/docs/` and `/about/`.
 *
 * These three sit outside the dashboard's sidebar chrome. The sidebar is a
 * working instrument with twelve destinations in it; a visitor who has not yet
 * been told what the product is does not need a table of contents, and the
 * pages that explain the product should not open with one.
 *
 * Everything here is governed by one idea: hierarchy is carried by size and
 * colour, never by weight. Nothing in this shell is bold. That is measured from
 * the reference the rework was asked to take its feel from, where every element
 * in the site's own typeface is weight 400 and the only bold in the DOM belongs
 * to simulated app UI inside product screenshots.
 */

/** Exactly two centre links. No dropdowns, no chevrons, no icons — see §7. */
const CENTRE = [
  { href: '/about/', label: 'About' },
  { href: '/docs/', label: 'Docs' },
];

/**
 * Plain link list. No logo lockup, no newsletter box, no social row.
 *
 * The two sentences under it are not decoration: the read-only statement and
 * the grant attribution are the two claims this site is obliged to make on
 * every page, and they move with the footer rather than living in it by habit.
 */
const FOOTER_LINKS = [
  { href: '/dashboard/', label: 'Dashboard' },
  { href: '/dashboard/blast-radius/', label: 'Blast radius' },
  { href: '/dashboard/decay/', label: 'TTL decay' },
  { href: '/docs/', label: 'CLI reference' },
  { href: '/docs/archival/', label: 'State archival' },
  { href: '/evidence/', label: 'Evidence' },
  { href: '/about/', label: 'About' },
  { href: 'https://github.com/Fatihmaull/evergreen', label: 'GitHub' },
];

/**
 * The header is not fixed and does not react to scroll.
 *
 * It was fixed, solid and permanently visible, which is free on a site that is
 * one colour from top to bottom. Ours is not: the landing's hero is dark green
 * and everything below it is the warm surface, so a fixed light bar would sit
 * on the green with its pill dissolved into it. The two ways out are a header
 * that changes colour as you scroll — which is the scroll-reactive navbar this
 * rework removed, in a different costume — or a header that scrolls away. On a
 * 3,783px page nobody needs a permanently available nav, so it scrolls away.
 *
 * `tone` is the page's own background behind the bar, not a state: 'dark' on
 * the landing, where the bar is part of the hero's green field.
 */
function nav(active, tone) {
  const centre = CENTRE.map(
    (item) =>
      `<a class="site-link${item.href === active ? ' current' : ''}" href="${item.href}"${
        item.href === active ? ' aria-current="page"' : ''
      }>${item.label}</a>`,
  ).join('');
  return `<header class="site-nav${tone === 'dark' ? ' on-dark' : ''}">
      <nav class="site-nav-inner" aria-label="Site">
        <a class="site-brand" href="/"><span class="site-mark" aria-hidden="true"></span>Evergreen</a>
        <div class="site-centre">${centre}</div>
        <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
      </nav>
    </header>`;
}

function footer() {
  const links = FOOTER_LINKS.map(
    (item) => `<a class="site-link" href="${item.href}">${item.label}</a>`,
  ).join('');
  return `<footer class="site-foot">
      <div class="site-wrap">
        <div class="site-foot-links">${links}</div>
        <p class="site-foot-note">Testnet only. Read-only: these pages never sign or submit anything.</p>
        <p class="site-foot-note">Built by Apex in the Stellar Ambassador Chapter Indonesia, under a Stellar Instawards grant. MIT.</p>
      </div>
    </footer>`;
}

/**
 * `head` is shared with the dashboard shell on purpose — one place that knows
 * which weights are fetched. Only 400 is loaded for Newsreader here; a weight
 * that is not downloaded cannot be reached for by accident.
 */
export function siteShell({ title, description, active, eyebrow, heading, lead, body, navTone }) {
  /**
   * The landing supplies its own opening section and passes no heading. The
   * reference pages get this one: eyebrow, heading, lead, and nothing else —
   * the same three elements a feature column is allowed.
   */
  const intro = heading
    ? `<section class="page-intro-wrap"><div class="site-wrap page-intro">
        <p class="eyebrow">${eyebrow}</p>
        <h1>${heading}</h1>
        ${lead ? `<p class="lead">${lead}</p>` : ''}
      </div></section>`
    : '';
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
  </head>
  <body class="site">
    <a class="skip" href="#main">Skip to content</a>
    ${nav(active, navTone)}
    <main id="main">
    ${intro}
${body}
    </main>
    ${footer()}
  </body>
</html>
`;
}
