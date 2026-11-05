import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from './frontmatter.js';

const FIELDS = ['titel', 'type', 'status', 'wanneer', 'afbeelding', 'door', 'aangemaakt', 'bijgewerkt', 'stijl'];
const TYPES = ['doel', 'idee', 'notitie', 'afbeelding'];
const STATUSES = ['idee', 'bezig', 'gehaald'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const EMPTY_LAYOUT = { positions: {}, links: [], zones: [], presets: [] };

export function slugify(text) {
  const slug = String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 50).replace(/-+$/, '');
  return slug || 'item';
}

export function countChecks(md = '') {
  const done = (md.match(/^\s*[-*] \[[xX]\]/gm) || []).length;
  const open = (md.match(/^\s*[-*] \[ \]/gm) || []).length;
  return { done, total: done + open };
}

export function createStore(dataDir) {
  const itemsDir = path.join(dataDir, 'items');
  const layoutFile = path.join(dataDir, 'canvas.json');
  const activityFile = path.join(dataDir, 'activity.json');
  fs.mkdirSync(itemsDir, { recursive: true });

  const fileOf = id => {
    if (!ID_RE.test(id)) throw httpError(400, `Ongeldige id: ${id}`);
    return path.join(itemsDir, id + '.md');
  };

  function read(id) {
    const file = fileOf(id);
    if (!fs.existsSync(file)) return null;
    const { data, body } = parse(fs.readFileSync(file, 'utf8'));
    return {
      id,
      titel: data.titel || id,
      type: TYPES.includes(data.type) ? data.type : 'doel',
      status: STATUSES.includes(data.status) ? data.status : 'idee',
      wanneer: data.wanneer || '',
      afbeelding: data.afbeelding || '',
      door: data.door || '',
      aangemaakt: data.aangemaakt || '',
      bijgewerkt: data.bijgewerkt || '',
      stijl: data.stijl || '',
      inhoud: body,
    };
  }

  function write(item) {
    const data = Object.fromEntries(FIELDS.map(k => [k, item[k]]));
    writeAtomic(fileOf(item.id), stringify(data, item.inhoud || ''));
  }

  function clean(fields) {
    const out = {};
    for (const k of [...FIELDS, 'inhoud']) {
      if (fields[k] === undefined) continue;
      if (typeof fields[k] !== 'string') throw httpError(400, `Veld "${k}" moet tekst zijn`);
      out[k] = fields[k];
    }
    if (out.type && !TYPES.includes(out.type)) throw httpError(400, `type moet een van ${TYPES.join(', ')} zijn`);
    if (out.status && !STATUSES.includes(out.status)) throw httpError(400, `status moet een van ${STATUSES.join(', ')} zijn`);
    return out;
  }

  function list() {
    return fs.readdirSync(itemsDir)
      .filter(f => f.endsWith('.md') && ID_RE.test(f.slice(0, -3)))
      .map(f => read(f.slice(0, -3)))
      .filter(Boolean);
  }

  function create(fields) {
    const f = clean(fields);
    let id = slugify(f.titel);
    for (let n = 2; fs.existsSync(fileOf(id)); n++) id = `${slugify(f.titel)}-${n}`;
    const now = new Date().toISOString();
    const item = { type: 'doel', status: 'idee', titel: 'Nieuw doel', inhoud: '', ...f, id, aangemaakt: now, bijgewerkt: now };
    write(item);
    log({ type: 'nieuw', id });
    return read(id);
  }

  function update(id, fields) {
    const old = read(id);
    if (!old) throw httpError(404, `Item "${id}" bestaat niet`);
    const f = clean(fields);
    const item = { ...old, ...f, id, bijgewerkt: new Date().toISOString() };
    write(item);
    const before = countChecks(old.inhoud).done, after = countChecks(item.inhoud).done;
    for (let i = before; i < after; i++) log({ type: 'stap', id });
    if (old.status !== 'gehaald' && item.status === 'gehaald') log({ type: 'gehaald', id });
    return read(id);
  }

  function remove(id) {
    const file = fileOf(id);
    if (!fs.existsSync(file)) throw httpError(404, `Item "${id}" bestaat niet`);
    fs.unlinkSync(file);
    const layout = getLayout();
    delete layout.positions[id];
    layout.links = layout.links.filter(l => l.from !== id && l.to !== id);
    saveLayout(layout);
  }

  function getLayout() {
    try { return { ...EMPTY_LAYOUT, ...JSON.parse(fs.readFileSync(layoutFile, 'utf8')) }; }
    catch (e) {
      if (e.code === 'ENOENT') return structuredClone(EMPTY_LAYOUT);
      throw e;
    }
  }

  function saveLayout(layout) { writeAtomic(layoutFile, JSON.stringify(layout, null, 2)); }

  function patchLayout(patch) {
    const layout = getLayout();
    for (const key of Object.keys(EMPTY_LAYOUT)) {
      if (patch[key] === undefined) continue;
      const isArr = Array.isArray(EMPTY_LAYOUT[key]);
      if (isArr !== Array.isArray(patch[key]) || typeof patch[key] !== 'object') throw httpError(400, `layout.${key} heeft een verkeerd formaat`);
      layout[key] = key === 'positions' ? { ...layout.positions, ...patch.positions } : patch[key];
    }
    saveLayout(layout);
    return layout;
  }

  function getActivity() {
    try { return JSON.parse(fs.readFileSync(activityFile, 'utf8')); }
    catch { return []; }
  }

  function log(entry) {
    const all = getActivity();
    all.push({ t: new Date().toISOString(), ...entry });
    writeAtomic(activityFile, JSON.stringify(all.slice(-5000)));
  }

  // Used by undo/redo: make the item files and layout match a snapshot.
  function restore({ items, layout }) {
    if (!Array.isArray(items) || typeof layout !== 'object') throw httpError(400, 'Ongeldige snapshot');
    const keep = new Set(items.map(i => i.id));
    for (const item of list()) if (!keep.has(item.id)) fs.unlinkSync(fileOf(item.id));
    for (const item of items) write({ ...read(item.id), ...clean(item), id: item.id });
    saveLayout({ ...EMPTY_LAYOUT, ...layout });
  }

  return { dataDir, itemsDir, list, get: read, create, update, remove, getLayout, patchLayout, getActivity, restore };
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
