import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRestService } from './rest-service.mjs';
import { createRestHandler } from './rest-http.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist'),
  port = 4173;
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('Build missing: run scripts/build.ps1 first.');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
const rest = createRestService({ root });
const restHandler = createRestHandler(rest);
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== '127.0.0.1:4173') {
    res.writeHead(403).end('Invalid host');
    return;
  }
  if (await restHandler(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1:4173');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({ app: 'todo-desktop-v2', version: 2, restApi: 4, root, pid: process.pid }),
    );
    return;
  }
  let requested;
  try {
    requested = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const target = path.resolve(dist, '.' + (requested === '/' ? '/index.html' : requested));
  if (!target.startsWith(dist + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': target.endsWith('.html') ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
});
server.on('error', (e) => {
  console.error('Cannot start To-Do on 127.0.0.1:4173: ' + e.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      app: 'todo-desktop-v2',
      url: 'http://127.0.0.1:4173',
      root,
      pid: process.pid,
    }),
  ),
);
