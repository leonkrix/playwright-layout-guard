// A tiny static server for the test pages (no dependencies, so the tests need nothing else).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./fixtures/', import.meta.url)));
const port = Number(process.env.PORT ?? 4410);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/'));
  const file = resolve(join(root, path === '/' ? 'index.html' : path));
  // Nothing outside the folder of the test pages is served
  if (!file.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  // The page that answers slowly keeps the load event of a page waiting
  if ((request.url ?? '').split('?')[0] === '/slow.js') {
    await new Promise((done) => setTimeout(done, 700));
    response.writeHead(200, { 'content-type': 'text/javascript' }).end('');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Test pages on http://127.0.0.1:${String(port)}`);
});
