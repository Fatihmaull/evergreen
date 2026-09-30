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
 * Two lines under it. The read-only statement is the claim this site is
 * obliged to make on every page and it stays in full. The attribution was
 * shortened on 2026-09-26: the team, the chapter, the grant's size and dates
 * and the licence all live on `/about/`, which is the page whose job that is,
 * so repeating them in a footer on every page was length without information.
 */
const FOOTER_LINKS = [
  { href: '/dashboard/', label: 'Dashboard' },
  { href: '/dashboard/blast-radius/', label: 'Blast radius' },
  { href: '/dashboard/decay/', label: 'TTL decay' },
  { href: '/docs/', label: 'CLI reference' },
  { href: '/docs/archival/', label: 'State archival' },
  { href: '/docs/evidence/', label: 'Evidence' },
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
  /**
   * On a phone the three zones are 92 + 89 + 160 = 341px of content in a bar
   * 390px wide, and holding them there took 29px clawed back from padding and
   * gaps. That was a fit, not a layout. Below 760px they collapse behind a
   * button instead.
   *
   * `display: contents` on the wrapper keeps the desktop bar exactly as it
   * was — the links and the button stay direct grid items of the three-zone
   * grid — so one set of links serves both, and a screen reader is never
   * offered the same destination twice.
   */
  return `<header class="site-nav${tone === 'dark' ? ' on-dark' : ''}">
      <nav class="site-nav-inner" aria-label="Site">
        <a class="site-brand" href="/"><span class="site-mark" aria-hidden="true"></span>Evergreen</a>
        <button class="site-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-menu" hidden>
          <span class="site-bars" aria-hidden="true"></span>
        </button>
        <div class="site-links" id="site-menu">
          <div class="site-centre">${centre}</div>
          <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
        </div>
      </nav>
    </header>`;
}

function footer(tone) {
  const links = FOOTER_LINKS.map(
    (item) => `<a class="site-link" href="${item.href}">${item.label}</a>`,
  ).join('');
  return `<footer class="site-foot${tone === 'dark' ? ' on-dark' : ''}">
      <div class="site-wrap">
        <div class="site-foot-links">${links}</div>
        <p class="site-foot-note">Testnet only. Read-only: these pages never sign or submit anything.</p>
        <p class="site-foot-note">Built for Stellar, backed by Instawards.</p>
      </div>
    </footer>`;
}

/**
 * A reference section: a label column on the left, the substance on the right.
 *
 * `/docs` and `/about` are reference pages, and their sections are genuinely
 * parallel — usage, exit codes, JSON shape, how to run it. A consistent shape
 * for parallel content is structure; the template tell is the same shape
 * imposed on content that is not parallel, which is why the landing varies its
 * composition and these two do not.
 *
 * It also uses the width. Left-aligned prose at a 52ch measure inside a
 * 1300px container is a narrow column clinging to one edge of a wide empty
 * field, which reads as under-filled rather than as restraint. The label rail
 * gives the measure something to sit against.
 */
export function refSection({ label, heading, body, id }) {
  return `<section class="ref"${id ? ` id="${id}"` : ''}>
        <div class="site-wrap ref-grid">
          <div class="ref-label">
            ${label ? `<p class="eyebrow">${label}</p>` : ''}
            ${heading ? `<h2>${heading}</h2>` : ''}
          </div>
          <div class="ref-body">${body}</div>
        </div>
      </section>`;
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
    ? `<section class="page-intro-wrap"><div class="site-wrap ref-grid page-intro">
        <div class="ref-label">
          <p class="eyebrow">${eyebrow}</p>
          <h1>${heading}</h1>
        </div>
        <div class="ref-body">${lead ? `<p class="lead">${lead}</p>` : ''}</div>
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
    ${footer(navTone)}
    <script>
      (function () {
        var nav = document.querySelector('.site-nav');
        var button = nav && nav.querySelector('.site-burger');
        var panel = nav && nav.querySelector('.site-links');
        if (!button || !panel) return;
        // Only now does the CSS get permission to collapse the links: without
        // this script they stay in the bar, reachable, which is what shipped
        // before the button existed.
        button.hidden = false;
        nav.setAttribute('data-menu', 'closed');
        var set = function (open) {
          nav.setAttribute('data-menu', open ? 'open' : 'closed');
          button.setAttribute('aria-expanded', String(open));
        };
        button.addEventListener('click', function () {
          set(nav.getAttribute('data-menu') !== 'open');
        });
        panel.addEventListener('click', function (event) {
          if (event.target.closest('a')) set(false);
        });
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && nav.getAttribute('data-menu') === 'open') {
            set(false);
            button.focus();
          }
        });
        // The documentation rail collapses on a phone for the same reason the
        // navbar does, and by the same mechanism: the CSS only hides it once
        // this script has said the button works. Without JavaScript the whole
        // tree is simply there, above the page.
        var docs = document.querySelector('.docs-shell');
        var docsButton = docs && docs.querySelector('.docs-menu-button');
        if (docs && docsButton) {
          docsButton.hidden = false;
          docs.setAttribute('data-docs', 'closed');
          docsButton.addEventListener('click', function () {
            var open = docs.getAttribute('data-docs') !== 'open';
            docs.setAttribute('data-docs', open ? 'open' : 'closed');
            docsButton.setAttribute('aria-expanded', String(open));
          });
        }

        // The copy button only appears where the clipboard exists. Without it
        // the command is still there and still selectable, which is how it
        // shipped before the button.
        var copy = document.querySelector('[data-copy]');
        if (copy && navigator.clipboard) {
          copy.hidden = false;
          copy.addEventListener('click', function () {
            var reset = function () {
              setTimeout(function () {
                copy.textContent = 'Copy';
                copy.classList.remove('done');
              }, 1800);
            };
            navigator.clipboard.writeText(copy.getAttribute('data-copy')).then(
              function () {
                copy.textContent = 'Copied';
                copy.classList.add('done');
                reset();
              },
              function () {
                // writeText rejects when the document is not focused, and in
                // a few browsers it is simply refused. A button that does
                // nothing when clicked is worse than no button, so select the
                // command instead and say so: the keyboard shortcut still
                // works, and the visitor can see why.
                var code = document.querySelector('.command code');
                if (code && window.getSelection) {
                  var range = document.createRange();
                  range.selectNodeContents(code);
                  var selection = window.getSelection();
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
                copy.textContent = 'Selected';
                copy.classList.add('done');
                reset();
              },
            );
          });
        }
        // A menu left open behind a widened window would be a panel floating
        // over a bar that has room for its own links.
        if (window.matchMedia) {
          window.matchMedia('(min-width: 760px)').addEventListener('change', function (event) {
            if (event.matches) set(false);
          });
        }
      })();
    </script>
  </body>
</html>
`;
}
