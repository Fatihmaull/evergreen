/**
 * Serve the built prototype locally, the way Cloudflare Pages serves it:
 * `/dashboard/` resolves to `dashboard/index.html`. No dependencies.
 *
 *   node apps/web/scripts/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../dashboard/public');
const port = Number(process.argv[2] ?? 4317);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!path.startsWith(root) || !existsSync(path)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`serving apps/dashboard/public on http://127.0.0.1:${port}`));
