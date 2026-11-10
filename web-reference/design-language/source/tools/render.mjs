/**
 * Render every canvas template to the file a person would post or print.
 *
 *   node web-reference/design-language/source/tools/render.mjs
 *   node web-reference/design-language/source/tools/render.mjs --commission
 *   node web-reference/design-language/source/tools/render.mjs --only=name,name
 *
 * Two jobs, in this order:
 *
 *   1. Refuse to render a template whose tokens have drifted from the site.
 *      `templates/base.css` carries its own copy of the values so a template
 *      survives a refactor of the site's stylesheet, and a copy is exactly the
 *      thing that goes quietly wrong. Every token it shares with
 *      `apps/web/src/styles.css` must match; the few it owns are listed below
 *      and must also be stated in `tokens.md`.
 *   2. Render each template at its canvas size, clean and with its safe area
 *      drawn, into `renders/`. The poster and each slide also go to PDF.
 *
 * `--commission` alters one value in memory and proves step 1 notices. A gate
 * nobody has watched fail is a decoration.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..');
const language = join(source, '..');
const repo = join(language, '../..');

/** Tokens the templates own. Each is stated in tokens.md with its reason. */
const OWN = new Set(['--k', '--t-display', '--crit-on-dark', '--und-on-dark']);

/** [file, width, height, pdf] in CSS px. The poster is A3 plus 3mm bleed.
 *  Slides are the landscape frame; each is also one PDF page. */
const TEMPLATES = [
  ['square', 1080, 1080, false],
  ['square-dark', 1080, 1080, false],
  ['portrait', 1080, 1350, false],
  ['landscape', 1920, 1080, false],
  ['story', 1080, 1920, false],
  ['og', 1200, 630, false],
  ['poster-a3', 1146, 1611, true],
  ['slide-online-cover', 1920, 1080, true],
  ['slide-online-section', 1920, 1080, true],
  ['slide-online-text', 1920, 1080, true],
  ['slide-online-number', 1920, 1080, true],
  ['slide-online-code', 1920, 1080, true],
  ['slide-online-diagram', 1920, 1080, true],
  ['slide-online-close', 1920, 1080, true],
  ['slide-offline-cover', 1920, 1080, true],
  ['slide-offline-section', 1920, 1080, true],
  ['slide-offline-text', 1920, 1080, true],
  ['slide-offline-number', 1920, 1080, true],
  ['slide-offline-code', 1920, 1080, true],
  ['slide-offline-diagram', 1920, 1080, true],
  ['slide-offline-close', 1920, 1080, true],
  ['event-announce-square', 1080, 1080, false],
  ['event-announce-story', 1080, 1920, false],
  ['event-announce-landscape', 1920, 1080, false],
  ['event-announce-og', 1200, 630, false],
  ['event-reminder-square', 1080, 1080, false],
  ['event-reminder-story', 1080, 1920, false],
  ['event-reminder-landscape', 1920, 1080, false],
  ['event-reminder-og', 1200, 630, false],
  ['event-recap-square', 1080, 1080, false],
  ['event-recap-story', 1080, 1920, false],
  ['event-recap-landscape', 1920, 1080, false],
  ['event-recap-og', 1200, 630, false],
];

function declarations(css) {
  return [...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, token, value]) => ({
    token,
    value: value.trim(),
  }));
}

function normalise(value) {
  return value
    .replace(/\s+/g, '')
    .replace(/([(,])\./g, '$10.')
    .toLowerCase();
}

function drift(templateCss, siteCss, tokensDoc) {
  const wrong = [];
  for (const { token, value } of declarations(templateCss)) {
    if (OWN.has(token)) {
      if (token !== '--k' && !tokensDoc.includes(token)) {
        wrong.push(`${token} is owned by the templates but tokens.md does not state it`);
      }
      continue;
    }
    const match = siteCss.match(new RegExp(`${token}:\\s*([^;]+);`));
    if (!match) wrong.push(`${token} is in the templates but not declared in styles.css`);
    else if (normalise(match[1]) !== normalise(value)) {
      wrong.push(`${token}: templates say ${value}, styles.css says ${match[1].trim()}`);
    }
  }
  return wrong;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(language, path);
      if (!file.startsWith(language) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));

/**
 * Its own profile, always. Without one, headless Chrome on a machine where
 * Chrome is already open hands the command to the running browser, exits 0,
 * and writes nothing — observed 2026-10-15, five "rendered" files that did not
 * exist.
 */
const profile = mkdtempSync(join(tmpdir(), 'evergreen-render-'));

/**
 * Asynchronous on purpose. The pages come from a server in this same process,
 * and a synchronous spawn blocks the event loop that server answers on: Chrome
 * waits for a page that can never arrive, gives up, and exits 0.
 */
function chrome(args) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(CHROME, [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // Fonts arrive over the network; give them time before the capture.
      '--virtual-time-budget=10000',
      ...args,
    ]);
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || `chrome exited ${code}`));
      // Exit 0 is not proof of a file. Check the thing that was asked for.
      const target = args.find(
        (x) => x.startsWith('--screenshot=') || x.startsWith('--print-to-pdf='),
      );
      if (target && !existsSync(target.split('=')[1])) {
        return reject(new Error(`chrome exited 0 but wrote no ${target}`));
      }
      resolve();
    });
  });
}

async function main() {
  const commission = process.argv.includes('--commission');
  const siteCss = readFileSync(join(repo, 'apps/web/src/styles.css'), 'utf8');
  const tokensDoc = readFileSync(join(language, 'tokens.md'), 'utf8');
  let templateCss = readFileSync(join(source, 'templates/base.css'), 'utf8');
  if (commission)
    templateCss = templateCss.replace(
      '--ink-3: rgba(15, 15, 15, 0.62)',
      '--ink-3: rgba(15, 15, 15, 0.56)',
    );

  const wrong = drift(templateCss, siteCss, tokensDoc);
  if (commission) {
    if (wrong.length === 0) {
      console.error('✗ a template token was altered and the drift check did not notice');
      process.exitCode = 1;
    } else {
      console.log('✓ the drift check refuses a template that disagrees with the site:');
      for (const one of wrong) console.log(`   ${one}`);
    }
    return;
  }
  if (wrong.length > 0) {
    console.error('✖ templates/base.css no longer matches the site; nothing rendered:\n');
    for (const one of wrong) console.error(`  ${one}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ template tokens match styles.css (${declarations(templateCss).length} declared)`);

  if (!CHROME) {
    console.error('no Chrome found; set CHROME_PATH');
    process.exitCode = 1;
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/source/templates`;
  const out = join(source, 'renders');
  mkdirSync(join(out, 'guides'), { recursive: true });
  try {
    const only = process.argv.find((arg) => arg.startsWith('--only='));
    const wanted = only ? only.slice('--only='.length).split(',') : null;
    for (const [name, width, height, pdf] of TEMPLATES) {
      if (wanted && !wanted.includes(name)) continue;
      for (const [suffix, dir] of [
        ['', out],
        ['?guides', join(out, 'guides')],
      ]) {
        await chrome([
          `--window-size=${width},${height}`,
          `--screenshot=${join(dir, `${name}.png`)}`,
          `${base}/${name}.html${suffix}`,
        ]);
      }
      console.log(`  ${name}.png  ${width}×${height}`);
      if (pdf) {
        await chrome([
          '--no-pdf-header-footer',
          `--print-to-pdf=${join(out, `${name}.pdf`)}`,
          `${base}/${name}.html`,
        ]);
        console.log(
          name === 'poster-a3'
            ? '  poster-a3.pdf  303×426mm (A3 + 3mm bleed)'
            : `  ${name}.pdf  ${width}×${height}`,
        );
      }
    }
  } finally {
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
