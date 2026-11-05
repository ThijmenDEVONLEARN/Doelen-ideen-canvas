import { state, load, undo, redo, deleteItem, removeLink, subscribe } from './state.js';
import { onSaveStatus, onServerChange } from './api.js';
import { applyView, zoomAt, fitAll, setTool, deleteZone, render, hooks, focusItem, createAt, viewportCenter } from './canvas.js';
import { openRead, openEdit, closePanel } from './panel.js';
import { setTimeline, timelineHooks } from './timeline.js';
import { setupSearch, openSearch } from './search.js';
import { openReview } from './review.js';
import { applyStyles } from './style.js';

const $ = id => document.getElementById(id);

export function toast(text, kind = 'info') {
  const el = $('toast');
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

window.addEventListener('unhandledrejection', e => toast(e.reason?.message || 'Er ging iets mis', 'error'));

onSaveStatus(s => {
  const el = $('save-status');
  el.dataset.state = s;
  el.textContent = { saved: 'opgeslagen', saving: 'opslaan…', error: 'niet verbonden met de server' }[s];
});

for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
$('zoom-in').addEventListener('click', () => zoomAt(1.2));
$('zoom-out').addEventListener('click', () => zoomAt(1 / 1.2));
$('zoom-fit').addEventListener('click', fitAll);
subscribe(applyStyles);
subscribe(() => { $('zoom-level').textContent = Math.round(state.view.scale * 100) + '%'; });

Object.assign(hooks, { openRead, openEdit, closePanel });
timelineHooks.focus = id => { focusItem(id); openRead(id); };

export const actions = [
  { label: 'Nieuw doel maken', key: 'D', run: () => createAt('doel', viewportCenter()) },
  { label: 'Nieuw idee maken', key: 'I', run: () => createAt('idee', viewportCenter()) },
  { label: 'Nieuwe notitie maken', key: 'N', run: () => createAt('notitie', viewportCenter()) },
  { label: 'Tijdband aan of uit', key: 'T', run: () => setTimeline(!state.timeline) },
  { label: 'Weekreview openen', key: '', run: () => openReview({ at: viewportCenter }) },
  { label: 'Alles in beeld', key: '', run: fitAll },
];
setupSearch({ actions, onPick: id => { focusItem(id); openRead(id); } });
$('search-open').addEventListener('click', openSearch);
$('review-open').addEventListener('click', () => openReview({ at: viewportCenter }));

const TOOL_KEYS = { v: 'select', p: 'edit', d: 'doel', i: 'idee', n: 'notitie', z: 'zone', l: 'lijn' };
export const shortcuts = { 'ctrl+k': openSearch }; // { 'ctrl+k': fn }, checked before anything else

window.addEventListener('keydown', e => {
  const combo = (e.ctrlKey || e.metaKey ? 'ctrl+' : '') + (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
  if (shortcuts[combo]) { e.preventDefault(); shortcuts[combo](e); return; }
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (combo === 'ctrl+z') { e.preventDefault(); undo(); return; }
  if (combo === 'ctrl+shift+z' || combo === 'ctrl+y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (TOOL_KEYS[e.key.toLowerCase()]) { setTool(TOOL_KEYS[e.key.toLowerCase()]); return; }
  if (e.key.toLowerCase() === 't') { setTimeline(!state.timeline); return; }
  if (e.key === 'Escape') { setTool('select'); closePanel(); return; }
  if (e.key.toLowerCase() === 'e' && state.selected?.kind === 'item') { e.preventDefault(); openEdit(state.selected.id); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const sel = state.selected;
    if (!sel) return;
    if (sel.kind === 'link') removeLink(sel.id);
    else if (sel.kind === 'zone') deleteZone(sel.id);
    else if (sel.kind === 'item' && confirm(`"${state.items.get(sel.id)?.titel}" verwijderen?`)) deleteItem(sel.id);
  }
});

let reloadTimer;
onServerChange(() => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => load(), 150);
});

setTool('select');
applyView();
await load();
if (!localStorage.getItem('doelen-canvas:view')) fitAll();
render();
