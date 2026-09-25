/**
 * The marketing surface, counted rather than argued about.
 *
 * A reviewer said the site felt generated. That is a reaction, not a defect
 * report, so it cannot be fixed by discussion and it cannot be verified by
 * looking again. These four numbers are the diagnosis made mechanical:
 *
 *   distinct font sizes   a scale with eleven steps used eleven times has no
 *                         hierarchy — it is the absence of a point of view
 *                         expressed as a token list
 *   cards                 uniform rounded boxes, content forced into card
 *                         shape whether or not it is card-shaped
 *   decorative icons      a glyph that carries no information
 *   gradients             a section divider embarrassed to be a section
 *                         divider
 *
 * And one more that matters more than the four: ELEMENTS OVER 40px. A page
 * where five things shout at the same volume has no dominant element anywhere.
 * `/` is allowed exactly one, and it is the 98%.
 *
 *   node apps/web/scripts/check-design.mjs
 *   node apps/web/scripts/check-design.mjs --commission
 *
 * Measured at 1367px, the width the reference was measured at. Computed style,
 * never the stylesheet: a rule that loses a cascade is not a rule the visitor
 * sees, and counting source would have reported the intention instead of the
 * page.
 *
 * NOT IN CI YET, for the same reason as `check-layout.mjs`: `.github/workflows/`
 * belongs to the CLI/engine track and a browser job is #197. This exits
 * non-zero on a defect and takes no arguments.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * The budget, per page. These are ceilings that were met, not aspirations:
 * every number below is what the surface measured at when it was written, so
 * the check fails on the next regression rather than on the next release.
 */
const BUDGET = [
  { route: '/', fontSizes: 5, cards: 0, icons: 0, gradients: 0, over40: 1 },
  { route: '/docs/', fontSizes: 5, cards: 0, icons: 0, gradients: 0, over40: 0 },
  { route: '/about/', fontSizes: 5, cards: 0, icons: 0, gradients: 0, over40: 0 },
];

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

/**
 * A font size counts once per page, and only where an element renders its own
 * text — otherwise every wrapper inherits a size and the count measures the
 * DOM depth instead of the typography.
 *
 * A card is a box with a visible edge AND a radius AND content. That is the
 * shape the complaint was about: not a bordered table cell, and not a slab
 * with an artefact in it, but a rounded container holding text because
 * containers were what the page had.
 */
const PROBE = `(() => {
  const sizes = new Map();
  const over40 = [];
  const cards = [];
  const icons = [];
  const gradients = [];
  const borders = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const name = el.tagName.toLowerCase() +
      (el.className && typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).join('.')
        : '');

    const rendersOwnText = [...el.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    );
    if (rendersOwnText) {
      const px = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      sizes.set(px, (sizes.get(px) ?? 0) + 1);
      if (px > 40) over40.push({ px, name, text: el.textContent.trim().slice(0, 40) });
    }

    const border = parseFloat(cs.borderTopWidth) || 0;
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const edged = (border > 0 && cs.borderTopStyle !== 'none') || cs.boxShadow !== 'none';
    if (edged && radius >= 4 && el.clientHeight > 40 && el.children.length > 0) cards.push(name);
    if (border > 0 && cs.borderTopStyle !== 'none') borders.add(cs.borderTopColor);
    if (/gradient/.test(cs.backgroundImage)) gradients.push(name);
    // An <svg> with no role is decoration; one with role="img" is an artefact.
    if (el.tagName.toLowerCase() === 'svg' && !el.getAttribute('role')) icons.push(name);
    if (cs.content && /url\\(/.test(cs.content)) icons.push(name + '::before');
  }
  return JSON.stringify({
    fontSizes: [...sizes.entries()].sort((a, b) => b[0] - a[0]),
    over40: over40.sort((a, b) => b.px - a.px),
    cards, icons, gradients,
    // A border that is a grey hex rather than an alpha of the foreground is
    // the flat dead grey that reads as template. Both references agree here.
    opaqueBorders: [...borders].filter((c) => !/rgba/.test(c) && c !== 'rgb(0, 0, 0)'),
  });
})()`;

function rpc(socket, id, method, params) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  if (!CHROME) {
    console.error('no Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
    process.exitCode = 1;
    return;
  }
  const commission = process.argv.includes('--commission');
  const server = spawn('node', [join(web, 'scripts/serve.mjs'), '4321'], { stdio: 'ignore' });
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9341',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    let version;
    for (let attempt = 0; attempt < 40 && !version; attempt += 1) {
      try {
        version = await (await globalThis.fetch('http://127.0.0.1:9341/json/version')).json();
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('Chrome did not open a debugging port');

    const target = await (
      await globalThis.fetch('http://127.0.0.1:9341/json/new?about:blank', { method: 'PUT' })
    ).json();
    const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    let id = 0;
    await rpc(socket, (id += 1), 'Page.enable', {});
    await rpc(socket, (id += 1), 'Emulation.setDeviceMetricsOverride', {
      width: 1367,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const failures = [];
    for (const budget of BUDGET) {
      await rpc(socket, (id += 1), 'Page.navigate', {
        url: `http://127.0.0.1:4321${budget.route}`,
      });
      const deadline = Date.now() + 15_000;
      for (;;) {
        const { result: ready } = await rpc(socket, (id += 1), 'Runtime.evaluate', {
          expression: `document.readyState === 'complete'`,
          returnByValue: true,
        });
        if (ready.value === true || Date.now() > deadline) break;
        await sleep(200);
      }
      await sleep(300);
      if (commission) {
        // Plant each defect the check is supposed to see, one page at a time,
        // and prove it is seen. A gate nobody has watched fail is a decoration.
        await rpc(socket, (id += 1), 'Runtime.evaluate', {
          expression: `(() => {
            const el = document.createElement('div');
            el.style.cssText = 'border:1px solid #c1c8c3;border-radius:8px;height:80px;' +
              'background-image:linear-gradient(#fff,#eee);font-size:96px';
            el.innerHTML = '<span style="font-size:41px">planted</span>' +
              '<svg width="10" height="10"></svg>';
            document.body.append(el);
          })()`,
        });
      }
      const { result } = await rpc(socket, (id += 1), 'Runtime.evaluate', {
        expression: PROBE,
        returnByValue: true,
      });
      const seen = JSON.parse(result.value);

      console.log(`\n${budget.route}`);
      console.log(
        `  font sizes ${String(seen.fontSizes.length).padStart(2)}/${budget.fontSizes}   ` +
          `cards ${seen.cards.length}/${budget.cards}   ` +
          `icons ${seen.icons.length}/${budget.icons}   ` +
          `gradients ${seen.gradients.length}/${budget.gradients}   ` +
          `over 40px ${seen.over40.length}/${budget.over40}`,
      );
      console.log(`  ${seen.fontSizes.map(([px, n]) => `${px}px×${n}`).join('  ')}`);
      for (const one of seen.over40)
        console.log(`  dominant: ${one.px}px ${JSON.stringify(one.text)}`);

      const check = (label, actual, allowed, detail) => {
        if (actual > allowed) {
          failures.push(
            `${budget.route}: ${label} ${actual}, budget ${allowed}${detail ? ` — ${detail}` : ''}`,
          );
        }
      };
      check('distinct font sizes', seen.fontSizes.length, budget.fontSizes);
      check('cards', seen.cards.length, budget.cards, seen.cards.join(', '));
      check('decorative icons', seen.icons.length, budget.icons, seen.icons.join(', '));
      check('gradients', seen.gradients.length, budget.gradients, seen.gradients.join(', '));
      check(
        'elements over 40px',
        seen.over40.length,
        budget.over40,
        seen.over40.map((o) => `${o.px}px ${JSON.stringify(o.text)}`).join(', '),
      );
      if (seen.opaqueBorders.length > 0) {
        failures.push(
          `${budget.route}: borders that are an opaque colour rather than an alpha of the ` +
            `foreground: ${seen.opaqueBorders.join(', ')}`,
        );
      }
    }
    socket.close();

    if (commission) {
      if (failures.length === 0) {
        console.error('\n✗ every defect was planted and none was seen — this check guards nothing');
        process.exitCode = 1;
      } else {
        console.log(`\n✓ the planted defects were caught (${failures.length} finding(s)):`);
        for (const failure of failures) console.log(`   ${failure}`);
      }
      return;
    }
    if (failures.length > 0) {
      console.error(`\n✗ the marketing surface is over budget:\n`);
      for (const failure of failures) console.error(`  ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(`\n✓ ${BUDGET.length} marketing pages within budget`);
    }
  } finally {
    chrome.kill();
    server.kill();
  }
}

await main();
