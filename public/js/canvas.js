import { state, subscribe, emit, select, setPosition, createItem, addLink, setZones, saveView, checkpoint, flushLayout } from './state.js';
import { renderMarkdown, progress, summary, esc } from './markdown.js';
import { parsePeriod } from './period.js';

const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const cardsEl = document.getElementById('cards');
const zonesEl = document.getElementById('zones');
const linksEl = document.getElementById('links');
const emptyHint = document.getElementById('empty-hint');

const MIN_SCALE = 0.2, MAX_SCALE = 2.5;
const DEFAULT_W = { doel: 200, idee: 160, notitie: 230, afbeelding: 200 };
const STATUS_LABEL = { idee: 'Idee', bezig: 'Bezig', gehaald: 'Gehaald' };

/** Filled in by main.js so this module does not depend on the panels. */
export const hooks = { openRead() {}, openEdit() {}, closePanel() {}, pickImage() {}, onView() {} };

let linkFrom = null;
let spaceDown = false;

// ---------- view ----------
export function toWorld(clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  const { x, y, scale } = state.view;
  return { x: (clientX - r.left - x) / scale, y: (clientY - r.top - y) / scale };
}

export function applyView() {
  const { x, y, scale } = state.view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  viewport.style.backgroundSize = `${24 * scale}px ${24 * scale}px`;
  viewport.style.backgroundPosition = `${x}px ${y}px`;
  hooks.onView();
  saveView();
}

export function zoomAt(factor, clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  const cx = clientX ?? r.left + r.width / 2, cy = clientY ?? r.top + r.height / 2;
  const before = toWorld(cx, cy);
  state.view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.view.scale * factor));
  state.view.x = cx - r.left - before.x * state.view.scale;
  state.view.y = cy - r.top - before.y * state.view.scale;
  applyView();
}

export function centerOn(wx, wy) {
  const r = viewport.getBoundingClientRect();
  state.view.x = r.width / 2 - wx * state.view.scale;
  state.view.y = r.height / 2 - wy * state.view.scale;
  applyView();
}

export function viewportCenter() {
  const r = viewport.getBoundingClientRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}

export function contentBounds() {
  const boxes = [...cardsEl.children].map(el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }))
    .concat(state.layout.zones.map(z => ({ x: z.x, y: z.y, w: z.w, h: z.h })));
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map(b => b.x)), y1 = Math.min(...boxes.map(b => b.y));
  const x2 = Math.max(...boxes.map(b => b.x + b.w)), y2 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function fitAll() {
  const b = contentBounds();
  if (!b) return;
  const r = viewport.getBoundingClientRect();
  const pad = 80;
  state.view.scale = Math.min(1.2, Math.max(MIN_SCALE, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h)));
  centerOn(b.x + b.w / 2, b.y + b.h / 2);
}

export function focusItem(id) {
  const el = cardsEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  centerOn(el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2);
  select({ kind: 'item', id });
}

// ---------- rendering ----------
function cardHtml(item) {
  const by = item.door === 'claude' ? '<span class="card__by">door Claude</span>' : '';
  const resize = '<i class="card__resize" data-resize></i>';
  const title = `<h3 class="card__title">${esc(item.titel)}</h3>`;
  if (item.type === 'idee') {
    const text = summary(item.inhoud, 70);
    return `${title}${text && text !== item.titel ? `<p class="card__text">${esc(text)}</p>` : ''}${by}${resize}`;
  }
  if (item.type === 'notitie') return `${title}<div class="md">${renderMarkdown(item.inhoud)}</div>${by}${resize}`;
  if (item.type === 'afbeelding') {
    const src = /^\/uploads\/[\w.-]+$|^https?:\/\//.test(item.afbeelding) ? item.afbeelding : '';
    return `${src ? `<img src="${esc(src)}" alt="${esc(item.titel)}" draggable="false">` : ''}${title}${by}${resize}`;
  }
  const { done, total } = progress(item.inhoud);
  const meta = [item.wanneer ? esc(item.wanneer) : 'geen periode', total ? `${done}/${total}` : ''];
  const pct = total ? Math.round((done / total) * 100) : item.status === 'gehaald' ? 100 : 0;
  return `<span class="chip chip--${item.status}">${STATUS_LABEL[item.status]}</span>${title}`
    + `<div class="card__meta"><span>${meta[0]}</span><span>${meta[1]}</span></div>`
    + `${total || item.status === 'gehaald' ? `<div class="card__bar"><i style="width:${pct}%"></i></div>` : ''}${by}${resize}`;
}

function ensurePositions() {
  const missing = [...state.items.keys()].filter(id => !state.layout.positions[id]);
  if (!missing.length) return;
  const c = viewportCenter();
  // New items from the API or a dropped file get a free spot in a small grid around the view center.
  missing.forEach((id, i) => setPosition(id, { x: Math.round(c.x - 340 + (i % 3) * 240), y: Math.round(c.y - 80 + Math.floor(i / 3) * 160) }));
}

export function render() {
  ensurePositions();
  const sel = state.selected;

  zonesEl.innerHTML = state.layout.zones.map(z =>
    `<div class="zone${sel?.kind === 'zone' && sel.id === z.id ? ' is-selected' : ''}" data-zone="${esc(z.id)}" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px">`
    + `<span class="zone__label" data-zone-label>${esc(z.label)}</span><i class="zone__resize" data-zone-resize></i></div>`).join('');

  const seen = new Set();
  for (const item of state.items.values()) {
    seen.add(item.id);
    let el = cardsEl.querySelector(`:scope > [data-id="${CSS.escape(item.id)}"]`);
    if (!el) { el = document.createElement('article'); el.dataset.id = item.id; cardsEl.append(el); }
    const pos = state.layout.positions[item.id] || { x: 0, y: 0 };
    const dim = state.timeline && item.type === 'doel' && !parsePeriod(item.wanneer);
    el.className = [
      'card', `card--${item.type}`, `status--${item.status}`,
      sel?.kind === 'item' && sel.id === item.id && 'is-selected',
      state.editing === item.id && 'is-editing',
      linkFrom === item.id && 'is-linking',
      dim && 'is-dim',
    ].filter(Boolean).join(' ');
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.width = (pos.w || DEFAULT_W[item.type]) + 'px';
    const html = cardHtml(item);
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  for (const el of [...cardsEl.children]) if (!seen.has(el.dataset.id)) el.remove();

  renderLinks();
  emptyHint.hidden = state.items.size > 0;
}

export function renderLinks() {
  const box = id => {
    const el = cardsEl.querySelector(`:scope > [data-id="${CSS.escape(id)}"]`);
    return el && { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };
  linksEl.innerHTML = state.layout.links.map(link => {
    const a = box(link.from), b = box(link.to);
    if (!a || !b) return '';
    const [l, r] = a.x + a.w / 2 <= b.x + b.w / 2 ? [a, b] : [b, a];
    const [t, u] = a.y + a.h / 2 <= b.y + b.h / 2 ? [a, b] : [b, a];
    let d;
    if (r.x - (l.x + l.w) >= 30 || u.y - (t.y + t.h) < 30) {
      // side to side
      const x1 = l.x + l.w, y1 = l.y + l.h / 2, x2 = r.x, y2 = r.y + r.h / 2;
      const c = Math.max(40, Math.abs(x2 - x1) / 2);
      d = `M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`;
    } else {
      // stacked: bottom to top
      const x1 = t.x + t.w / 2, y1 = t.y + t.h, x2 = u.x + u.w / 2, y2 = u.y;
      const c = Math.max(30, (y2 - y1) / 2);
      d = `M${x1} ${y1} C${x1} ${y1 + c} ${x2} ${y2 - c} ${x2} ${y2}`;
    }
    const cls = state.selected?.kind === 'link' && state.selected.id === link.id ? ' class="is-selected"' : '';
    return `<path d="${d}"${cls}/><path class="link-hit" data-link="${esc(link.id)}" d="${d}"/>`;
  }).join('');
}

// ---------- tools ----------
export function setTool(tool) {
  state.tool = tool;
  linkFrom = null;
  viewport.dataset.tool = tool;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
  render();
}

export async function createAt(type, point) {
  const w = DEFAULT_W[type];
  const titles = { doel: 'Nieuw doel', idee: 'Nieuw idee', notitie: 'Notitie' };
  const item = await createItem({ type, titel: titles[type] || 'Nieuw', status: type === 'doel' ? 'idee' : 'idee' },
    { x: Math.round(point.x - w / 2), y: Math.round(point.y - 30) });
  setTool('select');
  hooks.openEdit(item.id, { isNew: true });
  return item;
}

// ---------- pointer interaction ----------
function itemsInZone(z) {
  return [...cardsEl.children].filter(el => {
    const cx = el.offsetLeft + el.offsetWidth / 2, cy = el.offsetTop + el.offsetHeight / 2;
    return cx > z.x && cx < z.x + z.w && cy > z.y && cy < z.y + z.h;
  }).map(el => el.dataset.id);
}

viewport.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 1) return;
  if (e.target.closest('[contenteditable="true"]')) return;
  const start = { x: e.clientX, y: e.clientY };
  const startWorld = toWorld(e.clientX, e.clientY);
  const card = e.target.closest('.card');
  const linkHit = e.target.closest('[data-link]');
  const zoneEl = e.target.closest('.zone');
  let moved = false;
  let onMove = () => {}, onUp = () => {};

  const track = (move, up) => { onMove = move; onUp = up; };
  const pan = () => {
    const v0 = { ...state.view };
    viewport.classList.add('is-panning');
    track(ev => {
      state.view.x = v0.x + ev.clientX - start.x;
      state.view.y = v0.y + ev.clientY - start.y;
      applyView();
    }, () => {
      viewport.classList.remove('is-panning');
      if (!moved) { select(null); hooks.closePanel(); }
    });
  };

  if (e.button === 1 || spaceDown) pan();
  else if (linkHit) { select({ kind: 'link', id: linkHit.dataset.link }); return; }
  else if (card) {
    const id = card.dataset.id;
    if (state.tool === 'lijn') {
      if (!linkFrom) { linkFrom = id; render(); }
      else if (linkFrom !== id) { const from = linkFrom; linkFrom = null; addLink(from, id); }
      return;
    }
    if (state.tool === 'edit') { hooks.openEdit(id); return; }
    const pos0 = { ...state.layout.positions[id] };
    if (e.target.closest('[data-resize]')) {
      const w0 = card.offsetWidth;
      checkpoint();
      track(ev => {
        const w = Math.max(120, Math.round(w0 + (ev.clientX - start.x) / state.view.scale));
        card.style.width = w + 'px';
        state.layout.positions[id] = { ...state.layout.positions[id], w };
        renderLinks();
      }, () => { setPosition(id, { w: state.layout.positions[id].w }); });
    } else {
      track(ev => {
        if (!moved) checkpoint();
        const x = Math.round(pos0.x + (ev.clientX - start.x) / state.view.scale);
        const y = Math.round(pos0.y + (ev.clientY - start.y) / state.view.scale);
        state.layout.positions[id] = { ...state.layout.positions[id], x, y };
        card.style.left = x + 'px'; card.style.top = y + 'px';
        renderLinks();
      }, () => {
        if (moved) setPosition(id, state.layout.positions[id]);
        else { select({ kind: 'item', id }); hooks.openRead(id); }
      });
    }
  } else if (['doel', 'idee', 'notitie'].includes(state.tool)) {
    createAt(state.tool, startWorld);
    return;
  } else if (state.tool === 'zone') {
    const ghost = document.createElement('div');
    ghost.className = 'zone is-drawing';
    zonesEl.append(ghost);
    let rect = null;
    track(ev => {
      const p = toWorld(ev.clientX, ev.clientY);
      rect = { x: Math.min(p.x, startWorld.x), y: Math.min(p.y, startWorld.y), w: Math.abs(p.x - startWorld.x), h: Math.abs(p.y - startWorld.y) };
      Object.assign(ghost.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    }, () => {
      ghost.remove();
      if (!rect || rect.w < 60 || rect.h < 40) return;
      checkpoint();
      const zone = { id: 'z' + Date.now().toString(36), label: 'NIEUWE ZONE', ...roundRect(rect) };
      setZones([...state.layout.zones, zone]);
      setTool('select');
      requestAnimationFrame(() => renameZone(zone.id));
    });
  } else if (zoneEl && (e.target.closest('[data-zone-label]') || e.target.closest('[data-zone-resize]'))) {
    const zone = state.layout.zones.find(z => z.id === zoneEl.dataset.zone);
    const z0 = { ...zone };
    const resizing = !!e.target.closest('[data-zone-resize]');
    const inside = resizing ? [] : itemsInZone(zone);
    const pos0 = Object.fromEntries(inside.map(id => [id, { ...state.layout.positions[id] }]));
    track(ev => {
      if (!moved) checkpoint();
      const dx = (ev.clientX - start.x) / state.view.scale, dy = (ev.clientY - start.y) / state.view.scale;
      if (resizing) Object.assign(zone, { w: Math.max(80, Math.round(z0.w + dx)), h: Math.max(60, Math.round(z0.h + dy)) });
      else {
        Object.assign(zone, { x: Math.round(z0.x + dx), y: Math.round(z0.y + dy) });
        for (const id of inside) state.layout.positions[id] = { ...pos0[id], x: Math.round(pos0[id].x + dx), y: Math.round(pos0[id].y + dy) };
      }
      render();
    }, () => {
      if (!moved) { select({ kind: 'zone', id: zone.id }); return; }
      setZones([...state.layout.zones]);
      for (const id of inside) setPosition(id, state.layout.positions[id]);
    });
  } else pan();

  viewport.setPointerCapture(e.pointerId);
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
    moved = true;
    onMove(ev);
  };
  const up = () => {
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', up);
    viewport.removeEventListener('pointercancel', up);
    onUp();
    flushLayout();
  };
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
});

const roundRect = r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

viewport.addEventListener('dblclick', e => {
  const label = e.target.closest('[data-zone-label]');
  if (label) return renameZone(label.parentElement.dataset.zone);
  if (e.target.closest('.card')) { hooks.openEdit(e.target.closest('.card').dataset.id); return; }
  if (state.tool === 'select') createAt('doel', toWorld(e.clientX, e.clientY));
});

viewport.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  else { state.view.x -= e.deltaY; applyView(); }
}, { passive: false });

function renameZone(id) {
  const label = zonesEl.querySelector(`[data-zone="${CSS.escape(id)}"] [data-zone-label]`);
  if (!label) return;
  label.contentEditable = 'true';
  label.focus();
  document.getSelection().selectAllChildren(label);
  const done = () => {
    label.contentEditable = 'false';
    label.removeEventListener('blur', done);
    const text = label.textContent.trim() || 'ZONE';
    const zone = state.layout.zones.find(z => z.id === id);
    if (zone && zone.label !== text) { checkpoint(); zone.label = text; setZones([...state.layout.zones]); }
  };
  label.addEventListener('blur', done);
  label.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); label.blur(); } });
}

export function deleteZone(id) {
  checkpoint();
  setZones(state.layout.zones.filter(z => z.id !== id));
  select(null);
}

window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input, textarea, [contenteditable="true"]')) { spaceDown = true; } });
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });

subscribe(render);
export { emit };
