/**
 * Layout defects are invisible to every other check this project has.
 *
 * Twelve routes returned 200 while the overview's stat strip nested a second
 * `.stat-strip` inside the one the shell provides — a three-column grid inside
 * one of its own columns, so every cell rendered at 91px of a 302px column and
 * guinea-pig B's figure clipped to "464". A status code cannot see that, no
 * test in the repository could, and the only detector was a person looking at
 * a screenshot.
 *
 * So: render every page in a real browser and assert that nothing overflows
 * the box it was given. That catches clipping, text spilling its container and
 * the nested-grid class without comparing images.
 *
 *   node apps/web/scripts/check-layout.mjs            # built output, two widths
 *   node apps/web/scripts/check-layout.mjs --commission
 *
 * NOT IN CI YET. `.github/workflows/` belongs to the CLI/engine track and a
 * browser job is #197. This is the scaffold that job needs: it exits non-zero
 * on a defect and takes no arguments.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { ROUTES } from '../../dashboard/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/** Two widths: the desktop the reviewer opens, and the phone the SOW says they might. */
const WIDTHS = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
];

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

/**
 * Horizontal overflow only, and only where the element did not ask for it.
 * A `.table-wrap` with `overflow-x: auto` is a deliberate scroller; a heading
 * wider than its column is a defect.
 */
const PROBE = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.overflowX !== 'visible') continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      bad.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 60),
        over: el.scrollWidth - el.clientWidth,
        width: el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  return JSON.stringify(bad.slice(0, 12));
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

  const server = spawn('node', [join(web, 'scripts/serve.mjs'), '4319'], { stdio: 'ignore' });
  // `stdio: 'ignore'`, not the default pipe. Chrome is noisy on stderr, and an
  // unread pipe fills and blocks the browser — the first run of this script
  // produced no output at all and had to be killed.
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9337',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = () => {
    chrome.kill();
    server.kill();
  };

  try {
    // Both processes need a moment; poll the debugger rather than guessing.
    let version;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        version = await (await globalThis.fetch('http://127.0.0.1:9337/json/version')).json();
        break;
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('Chrome did not open a debugging port');

    const offenders = [];
    for (const size of WIDTHS) {
      const target = await (
        await globalThis.fetch('http://127.0.0.1:9337/json/new?about:blank', { method: 'PUT' })
      ).json();
      const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve) => socket.addEventListener('open', resolve));
      let id = 0;
      await rpc(socket, (id += 1), 'Page.enable', {});
      await rpc(socket, (id += 1), 'Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: 1,
        mobile: size.width < 700,
      });

      for (const { route } of ROUTES) {
        await rpc(socket, (id += 1), 'Page.navigate', { url: `http://127.0.0.1:4319${route}` });
        // Wait for the CONTENT, not for a timer.
        //
        // The first version slept 2.5s and measured whatever was on screen. On
        // a live page that is still "Reading the chain…", so the stat strip had
        // no cells in it and the check could not see the defect it was written
        // for: restoring the nested-grid bug did not fail it. A check that
        // looks before the subject exists is decoration.
        const deadline = Date.now() + 20_000;
        for (;;) {
          const { result: ready } = await rpc(socket, (id += 1), 'Runtime.evaluate', {
            expression: `document.readyState === 'complete' &&
              !/Reading the chain|reading…/i.test(document.body.innerText)`,
            returnByValue: true,
          });
          if (ready.value === true || Date.now() > deadline) break;
          await sleep(300);
        }
        // One more frame so the last paint settles.
        await sleep(250);
        const { result } = await rpc(socket, (id += 1), 'Runtime.evaluate', {
          expression: PROBE,
          returnByValue: true,
        });
        const bad = JSON.parse(result.value);
        for (const item of bad) offenders.push({ route, size: size.label, ...item });
        process.stdout.write(bad.length === 0 ? '.' : 'x');
      }
      socket.close();
      process.stdout.write(` ${size.label}\n`);
    }

    if (offenders.length > 0) {
      console.error(`\n✗ ${offenders.length} element(s) overflow the box they were given:\n`);
      for (const o of offenders) {
        console.error(
          `  ${o.route} @${o.size}  <${o.tag}${o.cls ? ` class="${o.cls}"` : ''}> ` +
            `${o.width}px wide, ${o.over}px over — ${JSON.stringify(o.text)}`,
        );
      }
      process.exitCode = 1;
    } else {
      console.log(`✓ nothing overflows across ${ROUTES.length} routes × ${WIDTHS.length} widths`);
    }
  } finally {
    stop();
  }
}

await main();
