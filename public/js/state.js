import { api } from './api.js';

export const state = {
  items: new Map(),
  layout: { positions: {}, links: [], zones: [], presets: [] },
  selected: null,        // { kind: 'item' | 'link' | 'zone', id }
  tool: 'select',
  view: loadView(),
  timeline: false,
  editing: null,         // id of the item open in the edit panel
};

const listeners = new Set();
export function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function emit() { for (const cb of listeners) cb(); }

export async function load() {
  const data = await api('GET', '/api/state');
  state.items = new Map(data.items.map(i => [i.id, i]));
  state.layout = data.layout;
  if (state.selected?.kind === 'item' && !state.items.has(state.selected.id)) state.selected = null;
  emit();
}

// ---------- undo / redo ----------
// shortcut: undo restores a full snapshot through PUT /api/state, so it also reverts changes made
// by others in between. Fine for a single-user local app; switch to per-operation undo if that changes.
const undoStack = [];
const redoStack = [];
const snapshot = () => ({ items: [...state.items.values()].map(i => ({ ...i })), layout: structuredClone(state.layout) });

export function checkpoint() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}

async function restore(from, to) {
  const snap = from.pop();
  if (!snap) return false;
  to.push(snapshot());
  await api('PUT', '/api/state', snap);
  await load();
  return true;
}
export const undo = () => restore(undoStack, redoStack);
export const redo = () => restore(redoStack, undoStack);

// ---------- items ----------
export async function createItem(fields, pos) {
  checkpoint();
  const item = await api('POST', '/api/items', { ...fields, ...pos });
  state.items.set(item.id, item);
  if (pos) state.layout.positions[item.id] = { ...pos };
  emit();
  return item;
}

export async function updateItem(id, patch, { record = true } = {}) {
  if (record) checkpoint();
  const item = await api('PATCH', `/api/items/${id}`, patch);
  state.items.set(id, item);
  emit();
  return item;
}

export async function deleteItem(id) {
  checkpoint();
  await api('DELETE', `/api/items/${id}`);
  state.items.delete(id);
  delete state.layout.positions[id];
  state.layout.links = state.layout.links.filter(l => l.from !== id && l.to !== id);
  if (state.selected?.id === id) state.selected = null;
  emit();
}

// ---------- layout ----------
let layoutTimer = null;
let layoutPatch = {};
/** Batch layout writes (dragging fires many moves). */
export function saveLayout(patch) {
  for (const [k, v] of Object.entries(patch)) {
    layoutPatch[k] = k === 'positions' ? { ...layoutPatch.positions, ...v } : v;
  }
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(flushLayout, 250);
}
export function flushLayout() {
  clearTimeout(layoutTimer);
  if (!Object.keys(layoutPatch).length) return Promise.resolve();
  const patch = layoutPatch;
  layoutPatch = {};
  return api('PATCH', '/api/layout', patch);
}

export function setPosition(id, pos) {
  state.layout.positions[id] = { ...state.layout.positions[id], ...pos };
  saveLayout({ positions: { [id]: state.layout.positions[id] } });
}

export async function addLink(from, to) {
  checkpoint();
  const link = await api('POST', '/api/links', { from, to });
  if (!state.layout.links.some(l => l.id === link.id)) state.layout.links.push(link);
  emit();
}

export async function removeLink(id) {
  checkpoint();
  await api('DELETE', `/api/links/${id}`);
  state.layout.links = state.layout.links.filter(l => l.id !== id);
  if (state.selected?.id === id) state.selected = null;
  emit();
}

export function setZones(zones) {
  state.layout.zones = zones;
  saveLayout({ zones });
  emit();
}

export function setPresets(presets) {
  state.layout.presets = presets;
  saveLayout({ presets });
}

// ---------- view ----------
function loadView() {
  try { return JSON.parse(localStorage.getItem('doelen-canvas:view')) || { x: 0, y: 0, scale: 1 }; }
  catch { return { x: 0, y: 0, scale: 1 }; }
}
export function saveView() {
  try { localStorage.setItem('doelen-canvas:view', JSON.stringify(state.view)); } catch { /* private mode */ }
}

export function select(sel) {
  state.selected = sel;
  emit();
}
