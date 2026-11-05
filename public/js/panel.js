import { state, subscribe, emit, updateItem, deleteItem, select } from './state.js';
import { renderMarkdown, toggleCheck, progress, esc } from './markdown.js';
import { MODES, parsePeriod, formatPeriod } from './period.js';
import { mountStyleEditor, setPreview } from './style.js';

// Clicking a card opens the read view: contents and checklist only.
// Editing happens only through the pencil tool (or E / double-click), in the edit view.

const panel = document.getElementById('panel');
const STATUS = [['idee', 'Idee'], ['bezig', 'Bezig'], ['gehaald', 'Gehaald']];
const TYPES = [['doel', 'Doel'], ['idee', 'Idee'], ['notitie', 'Notitie'], ['afbeelding', 'Afbeelding']];
let mode = null; // 'read' | 'edit'
let currentId = null;

export const panelHooks = { uploadImage: null }; // set by images.js

function zoneOf(id) {
  const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!el) return '';
  const cx = el.offsetLeft + el.offsetWidth / 2, cy = el.offsetTop + el.offsetHeight / 2;
  const z = state.layout.zones.find(z => cx > z.x && cx < z.x + z.w && cy > z.y && cy < z.y + z.h);
  return z ? z.label : '';
}

export function closePanel() {
  if (mode === 'edit') setPreview(null);
  mode = null; currentId = null;
  state.editing = null;
  panel.hidden = true;
  panel.innerHTML = '';
  emit();
}

// ---------- read view ----------
export function openRead(id) {
  if (mode === 'edit' && currentId !== id) setPreview(null);
  mode = 'read'; currentId = id;
  state.editing = null;
  renderRead();
}

function renderRead() {
  const item = state.items.get(currentId);
  if (!item) return closePanel();
  const { done, total } = progress(item.inhoud);
  const zone = zoneOf(item.id);
  const meta = [
    item.type === 'doel' ? `<span class="chip chip--${item.status}">${STATUS.find(s => s[0] === item.status)[1]}</span>` : `<span class="chip chip--idee">${esc(item.type)}</span>`,
    item.wanneer && `<span>${esc(item.wanneer)}</span>`,
    zone && `<span>${esc(zone)}</span>`,
    item.door === 'claude' && '<span class="card__by">door Claude</span>',
  ].filter(Boolean).join('');
  const img = item.type === 'afbeelding' && /^\/uploads\/[\w.-]+$|^https?:\/\//.test(item.afbeelding)
    ? `<img class="panel__img" src="${esc(item.afbeelding)}" alt="">` : '';

  panel.className = 'panel panel--read';
  panel.innerHTML = `
    <div class="panel__head"><div class="panel__meta">${meta}</div>
      <button type="button" class="icon-btn" data-close aria-label="Sluiten"><svg><use href="#i-close"/></svg></button></div>
    <h2 class="panel__title">${esc(item.titel)}</h2>
    ${total ? `<div class="panel__progress"><div class="card__bar"><i style="width:${Math.round(done / total * 100)}%"></i></div><span>${done} van ${total}</span></div>` : ''}
    ${img}
    <div class="md panel__body">${item.inhoud.trim() ? renderMarkdown(item.inhoud) : '<p class="muted">Nog geen inhoud. Klik op het potlood om iets te schrijven.</p>'}</div>
    <footer class="panel__hint"><svg><use href="#i-edit"/></svg>Bewerken via het potlood links, of toets <kbd>E</kbd></footer>`;
  panel.hidden = false;
}

panel.addEventListener('change', e => {
  if (mode !== 'read' || !e.target.matches('input[type="checkbox"][data-line]')) return;
  const item = state.items.get(currentId);
  updateItem(item.id, { inhoud: toggleCheck(item.inhoud, +e.target.dataset.line) });
});
panel.addEventListener('click', e => { if (e.target.closest('[data-close]')) { closePanel(); select(null); } });

subscribe(() => { if (mode === 'read') renderRead(); });

// ---------- edit view ----------
export function openEdit(id, { isNew = false } = {}) {
  const item = state.items.get(id);
  if (!item) return;
  mode = 'edit'; currentId = id;
  state.editing = id;
  state.selected = { kind: 'item', id };

  const period = parsePeriod(item.wanneer);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => thisYear - 1 + i);
  const pMode = period?.mode || 'geen';

  panel.className = 'panel panel--edit';
  panel.innerHTML = `
    <form class="edit" novalidate>
      <div class="panel__head"><div class="panel__meta">${isNew ? 'Nieuw item' : 'Bewerken'}</div>
        <button type="button" class="icon-btn" data-cancel aria-label="Annuleren"><svg><use href="#i-close"/></svg></button></div>
      <label class="field-label" for="f-titel">Titel</label>
      <input id="f-titel" name="titel" class="input input--title" value="${esc(item.titel)}" required autocomplete="off">
      <div class="two">
        <div><label class="field-label" for="f-type">Soort</label>
          <select id="f-type" name="type" class="input">${TYPES.map(([v, l]) => `<option value="${v}"${v === item.type ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div data-for="doel"><span class="field-label">Status</span>
          <div class="chips">${STATUS.map(([v, l]) => `<label class="chip-radio"><input type="radio" name="status" value="${v}"${v === item.status ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      </div>
      <fieldset class="when" data-for="doel idee">
        <legend class="field-label">Wanneer</legend>
        <div class="chips chips--wrap">${MODES.map(m => `<label class="chip-radio"><input type="radio" name="pmode" value="${m.id}"${m.id === pMode ? ' checked' : ''}><span>${m.label}</span></label>`).join('')}</div>
        <div class="two when__pick">
          <select name="ppart" class="input" aria-label="Deel van het jaar"></select>
          <select name="pyear" class="input" aria-label="Jaar">${years.map(y => `<option${y === (period?.year || thisYear + 1) ? ' selected' : ''}>${y}</option>`).join('')}</select>
        </div>
        ${item.wanneer && !period ? `<p class="hint">Huidige tekst "${esc(item.wanneer)}" blijft staan tot je hier iets kiest.</p>` : ''}
      </fieldset>
      <div data-for="afbeelding">
        <label class="field-label" for="f-img">Afbeelding</label>
        <div class="img-row"><input id="f-img" name="afbeelding" class="input" value="${esc(item.afbeelding)}" placeholder="/uploads/… of https://…"></div>
      </div>
      <div class="seg" role="tablist" aria-label="Bewerk-tabblad">
        <button type="button" role="tab" data-tab="inhoud" aria-selected="true">Inhoud (Markdown)</button>
        <button type="button" role="tab" data-tab="stijl" aria-selected="false">Stijl</button>
      </div>
      <div data-pane="inhoud" class="pane">
        <textarea name="inhoud" class="input code md-src" spellcheck="true" placeholder="## Waarom&#10;Wat het je oplevert…&#10;&#10;## Stappen&#10;- [ ] Eerste stap&#10;- [ ] Tweede stap">${esc(item.inhoud)}</textarea>
        <p class="hint">Tip: <code>- [ ] stap</code> wordt een checklist, <code>## Kop</code> een kopje, <code>**vet**</code> vet.</p>
      </div>
      <div data-pane="stijl" class="pane style-editor" hidden></div>
      <div class="edit__actions">
        ${isNew ? '' : '<button type="button" class="btn btn--danger" data-delete>Verwijderen</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-cancel>Annuleren</button>
        <button type="submit" class="btn btn--primary">Opslaan <kbd>Ctrl ↵</kbd></button>
      </div>
    </form>`;
  panel.hidden = false;

  const form = panel.querySelector('form');
  const f = name => form.elements[name];
  let periodTouched = false;

  const styleEditor = mountStyleEditor(panel.querySelector('[data-pane="stijl"]'), item.stijl, css => setPreview(id, css));
  setPreview(id, item.stijl);

  const syncType = () => {
    for (const el of form.querySelectorAll('[data-for]')) el.hidden = !el.dataset.for.split(' ').includes(f('type').value);
  };
  const syncPeriod = () => {
    const m = MODES.find(m => m.id === form.querySelector('[name="pmode"]:checked').value);
    const part = f('ppart');
    const prev = part.value || period?.part;
    part.innerHTML = m.parts.map(p => `<option${p === prev ? ' selected' : ''}>${p}</option>`).join('');
    part.hidden = !m.parts.length;
    f('pyear').hidden = m.id === 'geen';
  };
  syncType(); syncPeriod();
  f('type').addEventListener('change', syncType);
  form.querySelector('.when').addEventListener('change', e => { periodTouched = true; if (e.target.name === 'pmode') syncPeriod(); });

  for (const tab of form.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const t of form.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t === tab));
      for (const p of form.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== tab.dataset.tab;
    });
  }

  panelHooks.uploadImage?.(form.querySelector('.img-row'), url => { f('afbeelding').value = url; });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const titel = f('titel').value.trim();
    if (!titel) { f('titel').focus(); return; }
    const pmode = form.querySelector('[name="pmode"]:checked').value;
    const patch = {
      titel,
      type: f('type').value,
      status: form.querySelector('[name="status"]:checked')?.value || item.status,
      wanneer: periodTouched || parsePeriod(item.wanneer) ? formatPeriod(pmode, f('ppart').value, +f('pyear').value) : item.wanneer,
      afbeelding: f('afbeelding').value.trim(),
      inhoud: f('inhoud').value,
      stijl: styleEditor.value,
    };
    await updateItem(id, patch);
    setPreview(null);
    openRead(id);
  });
  form.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  for (const b of form.querySelectorAll('[data-cancel]')) b.addEventListener('click', cancel);
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`"${item.titel}" verwijderen?`)) return;
    closePanel();
    await deleteItem(id);
  });

  async function cancel() {
    setPreview(null);
    if (isNew) { closePanel(); await deleteItem(id); return; }
    openRead(id);
  }

  emit();
  f('titel').focus();
  if (isNew) f('titel').select();
}

export function currentPanel() { return { mode, id: currentId }; }
