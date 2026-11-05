import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, httpError } from './server/store.js';
import { createEvents } from './server/events.js';
import { scheduleBackups } from './server/backup.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 15 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

const store = createStore(DATA);
const uploadsDir = path.join(DATA, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const events = createEvents([store.itemsDir, DATA]);
scheduleBackups(DATA);

const routes = [
  ['GET', /^\/api\/state$/, () => ({ items: store.list(), layout: store.getLayout() })],
  ['GET', /^\/api\/items$/, () => store.list()],
  ['GET', /^\/api\/items\/([\w-]+)$/, (req, [id]) => store.get(id) || Promise.reject(httpError(404, `Item "${id}" bestaat niet`))],
  ['POST', /^\/api\/items$/, async req => {
    const body = await readJson(req);
    const { x, y, w, ...fields } = body;
    const item = store.create(fields);
    if (Number.isFinite(x) && Number.isFinite(y)) store.patchLayout({ positions: { [item.id]: { x, y, ...(Number.isFinite(w) && { w }) } } });
    return item;
  }],
  ['PATCH', /^\/api\/items\/([\w-]+)$/, async (req, [id]) => store.update(id, await readJson(req))],
  ['DELETE', /^\/api\/items\/([\w-]+)$/, (req, [id]) => { store.remove(id); return { ok: true }; }],
  ['GET', /^\/api\/layout$/, () => store.getLayout()],
  ['PATCH', /^\/api\/layout$/, async req => store.patchLayout(await readJson(req))],
  ['POST', /^\/api\/links$/, async req => {
    const { from, to } = await readJson(req);
    if (!store.get(String(from)) || !store.get(String(to))) throw httpError(400, 'from en to moeten bestaande item-ids zijn');
    if (from === to) throw httpError(400, 'Een item kan niet met zichzelf verbonden worden');
    const layout = store.getLayout();
    const existing = layout.links.find(l => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    if (existing) return existing;
    const link = { id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from, to };
    store.patchLayout({ links: [...layout.links, link] });
    return link;
  }],
  ['DELETE', /^\/api\/links\/([\w-]+)$/, (req, [id]) => {
    store.patchLayout({ links: store.getLayout().links.filter(l => l.id !== id) });
    return { ok: true };
  }],
  ['GET', /^\/api\/activity$/, () => store.getActivity()],
  ['PUT', /^\/api\/state$/, async req => { store.restore(await readJson(req)); return { ok: true }; }],
  ['POST', /^\/api\/uploads$/, async req => {
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[req.headers['content-type']];
    if (!ext) throw httpError(415, 'Alleen png, jpg, gif of webp');
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ext;
    fs.writeFileSync(path.join(uploadsDir, name), await readBody(req));
    return { url: '/uploads/' + name };
  }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/events') return events.handle(req, res);
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return sendJson(res, 200, await handler(req, m.slice(1)));
      }
      throw httpError(404, 'Onbekende API-route');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Niet toegestaan');
    if (url.pathname.startsWith('/uploads/')) return sendFile(res, uploadsDir, url.pathname.slice('/uploads/'.length));
    return sendFile(res, PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { error: err.message });
  }
});

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function sendFile(res, base, rel) {
  const file = path.resolve(base, decodeURIComponent(rel));
  if (!file.startsWith(base + path.sep)) throw httpError(403, 'Verboden pad');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw httpError(404, 'Niet gevonden');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(httpError(413, 'Bestand of verzoek is te groot (max 15 MB)')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const text = (await readBody(req)).toString('utf8');
  try {
    const data = JSON.parse(text || '{}');
    if (typeof data !== 'object' || data === null) throw new Error();
    return data;
  } catch { throw httpError(400, 'Body moet geldige JSON zijn'); }
}

server.listen(PORT, HOST, () => {
  console.log(`Doelen Canvas draait op http://localhost:${PORT}`);
  console.log(`Data: ${DATA}`);
});
