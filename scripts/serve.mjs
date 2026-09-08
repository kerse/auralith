import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(root, relative);
    const inside = path.relative(root, target);
    if (inside.startsWith('..') || path.isAbsolute(inside) || inside.split(/[\\/]/).some(part => part.startsWith('.'))) { res.writeHead(403).end(); return; }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}`, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) { res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end('File unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Auralith: http://127.0.0.1:${port}`));
