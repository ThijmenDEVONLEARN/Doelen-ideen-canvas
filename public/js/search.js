import { state } from './state.js';
import { esc, summary } from './markdown.js';

// Ctrl+K palette: jump to any goal, idea or note, or run an action.

const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let actions = [];
let onPick = () => {};
let overlay = null;

export function setupSearch(opts) { actions = opts.actions; onPick = opts.onPick; }

function highlight(text, q) {
  const i = fold(text).indexOf(q);
  if (!q || i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + q.length)) + '</b>' + esc(text.slice(i + q.length));
}

export function openSearch() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="palette" role="dialog" aria-label="Zoeken">
      <label class="palette__q"><svg><use href="#i-search"/></svg>
        <input type="text" placeholder="Zoek een doel, idee of actie…" aria-label="Zoeken" autocomplete="off"></label>
      <div class="palette__list" role="listbox"></div>
    </div>`;
  document.body.append(overlay);
  const input = overlay.querySelector('input');
  const list = overlay.querySelector('.palette__list');
  let results = [];
  let active = 0;

  const update = () => {
    const q = fold(input.value.trim());
    const items = [...state.items.values()]
      .filter(i => !q || fold(i.titel).includes(q) || fold(i.inhoud).includes(q))
      .slice(0, 8)
      .map(i => ({ kind: i.type === 'doel' ? 'Doelen' : i.type === 'idee' ? 'Ideeën' : 'Notities en afbeeldingen', item: i }));
    const acts = actions.filter(a => !q || fold(a.label).includes(q)).map(a => ({ kind: 'Acties', action: a }));
    results = [...items, ...acts];
    active = Math.min(active, Math.max(0, results.length - 1));
    let lastKind = null;
    list.innerHTML = results.length ? results.map((r, n) => {
      const head = r.kind !== lastKind ? `<div class="palette__group">${r.kind}</div>` : '';
      lastKind = r.kind;
      const label = r.item ? r.item.titel : r.action.label;
      const extra = r.item ? esc(r.item.wanneer || (r.item.door === 'claude' ? 'door Claude' : summary(r.item.inhoud, 40))) : esc(r.action.key || '');
      const dot = r.item ? `dot dot--${r.item.type}` : 'dot dot--action';
      return `${head}<div class="palette__row${n === active ? ' is-active' : ''}" role="option" aria-selected="${n === active}" data-n="${n}"><i class="${dot}"></i><span>${highlight(label, q)}</span><em>${extra}</em></div>`;
    }).join('') : '<p class="palette__empty">Niets gevonden.</p>';
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  const pick = n => {
    const r = results[n];
    if (!r) return;
    closeSearch();
    if (r.item) onPick(r.item.id); else r.action.run();
  };

  input.addEventListener('input', () => { active = 0; update(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); update(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); update(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });
  list.addEventListener('click', e => { const row = e.target.closest('[data-n]'); if (row) pick(+row.dataset.n); });
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeSearch(); });
  update();
  input.focus();
}

export function closeSearch() {
  overlay?.remove();
  overlay = null;
}
