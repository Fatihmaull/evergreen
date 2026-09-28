/**
 * The documentation shell: a sidebar of the whole tree, the page, and a table
 * of contents for it.
 *
 * Three columns at 1300px, measured from the reference Fatih named:
 *
 *   260px sidebar · 704px text · 240px contents
 *
 * The 704px text column is the one number worth keeping — it is a readable
 * measure, and every paragraph inside it still caps at the site's own 54ch so
 * no line runs past 80 characters.
 *
 * What is NOT taken from that reference is its type system. It renders
 * seventeen distinct size-and-weight combinations and uses 700 freely; this
 * site carries hierarchy by size and colour and nothing on it is bold. Copying
 * the type would split the site into two languages a visitor crosses at the
 * navbar.
 *
 * The sidebar is the docs' own, not the dashboard's. The dashboard sidebar is
 * an instrument with twelve live destinations in it; a reader who has arrived
 * to find out what `--require-declared-scope` does needs the manual, not the
 * control room.
 */
import { DOC_NAV, groupOf, nextOf } from './nav.mjs';

/** Headings the page actually rendered, so the contents cannot drift from it. */
export function tableOfContents(body) {
  return [...body.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map(([, id, inner]) => ({
    id,
    text: inner.replace(/<[^>]+>/g, '').trim(),
  }));
}

function sidebar(active) {
  const groups = DOC_NAV.map((group) => {
    const items = group.pages
      .map((page) => {
        const current = page.route === active;
        return `<a class="docs-link${current ? ' current' : ''}" href="${page.route}"${
          current ? ' aria-current="page"' : ''
        }>${page.title}${page.live ? '<span class="docs-tag">live</span>' : ''}</a>`;
      })
      .join('');
    return `<div class="docs-group"><p class="eyebrow">${group.label}</p>${items}</div>`;
  }).join('');
  return `<nav class="docs-nav" aria-label="Documentation">${groups}</nav>`;
}

function contents(toc) {
  if (toc.length === 0) return '';
  const items = toc
    .map((entry) => `<a class="docs-toc-link" href="#${entry.id}">${entry.text}</a>`)
    .join('');
  return `<nav class="docs-toc" aria-label="On this page">
          <p class="eyebrow">On this page</p>
          ${items}
        </nav>`;
}

/**
 * The page body, its heading, and the two navigations around it. `heading` and
 * `lead` come from the page's own meta so a page cannot render a title that
 * disagrees with the sidebar entry pointing at it — the build asserts they
 * match.
 */
export function docsLayout({ route, heading, lead, body }) {
  const group = groupOf(route);
  const next = nextOf(route);
  const toc = tableOfContents(body);
  return `<div class="docs-shell">
        <div class="site-wrap docs-grid">
          <button class="docs-menu-button" type="button" aria-expanded="false" aria-controls="docs-menu" hidden>
            All pages<span class="docs-menu-mark" aria-hidden="true"></span>
          </button>
          <div class="docs-aside" id="docs-menu">${sidebar(route)}</div>
          <main class="docs-main" id="main">
            <header class="docs-head">
              ${group ? `<p class="eyebrow">${group}</p>` : ''}
              <h1>${heading}</h1>
              ${lead ? `<p class="lead">${lead}</p>` : ''}
            </header>
            ${body}
            ${
              next
                ? `<a class="docs-next" href="${next.route}">
              <span class="eyebrow">Next</span>
              <span class="docs-next-title">${next.title}</span>
              <span class="docs-next-blurb">${next.blurb}</span>
            </a>`
                : ''
            }
          </main>
          ${contents(toc)}
        </div>
      </div>`;
}
