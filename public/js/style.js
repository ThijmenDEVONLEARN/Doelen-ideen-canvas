import { state, setPresets } from './state.js';
import { esc } from './markdown.js';

// Every card can carry its own CSS. "&" stands for the card itself; CSS without "&"
// is treated as declarations for the card. Rules are scoped to the card's data-id, so a
// style can never leak onto other cards or the app around it.

export const BUILTIN_PRESETS = [
  { name: 'Ster', css: '& {\n  background: #1b1625;\n  color: #ece8f4;\n  border: 1px solid #8b6cf5;\n  border-radius: 14px;\n  box-shadow: 0 0 28px #8b6cf555;\n}' },
  { name: 'Post-it', css: '& {\n  background: #ffe98a;\n  color: #2a2620;\n  border: 1px solid #ffe98a;\n  border-radius: 2px;\n  box-shadow: 0 8px 18px #0006;\n  transform: rotate(-1.5deg);\n}\n& .card__meta { color: #6b5d2a; }' },
  { name: 'Neon', css: '& {\n  background: #06140f;\n  color: #7dffb2;\n  border: 1px solid #2bff88;\n  border-radius: 6px;\n  box-shadow: 0 0 40px #2bff8866;\n  font-family: var(--mono);\n}' },
  { name: 'Minimaal', css: '& {\n  background: #ffffff;\n  color: #111111;\n  border: 1px solid #dddddd;\n  border-radius: 8px;\n  box-shadow: none;\n}\n& .card__meta { color: #666; }' },
];

const FONTS = [
  ['', 'Standaard'], ['var(--display)', 'Bricolage'], ['var(--body)', 'Manrope'],
  ['var(--mono)', 'Mono'], ['Georgia, serif', 'Serif'],
];

export function scopeCss(id, css = '') {
  const sel = `.card[data-id="${id.replace(/"/g, '')}"]`;
  const clean = css.replace(/<\/?style/gi, '');
  return clean.includes('&') ? clean.replaceAll('&', sel) : `${sel} { ${clean} }`;
}

let preview = null; // { id, css } while the edit panel is open
export function setPreview(id, css) { preview = id ? { id, css } : null; applyStyles(); }

export function applyStyles() {
  const css = [...state.items.values()].map(item => {
    const own = preview?.id === item.id ? preview.css : item.stijl;
    return own ? `/* ${item.id} */\n${scopeCss(item.id, own)}` : '';
  }).filter(Boolean).join('\n');
  document.getElementById('card-styles').textContent = css;
}

// ---------- editor ----------
function read(css) {
  const get = re => (css.match(re) || [])[1];
  return {
    bg: get(/background(?:-color)?:\s*(#[0-9a-f]{6})/i) || '#1b1625',
    fg: get(/[^-]color:\s*(#[0-9a-f]{6})/i) || '#ece8f4',
    border: get(/border:[^;#]*(#[0-9a-f]{6})/i) || '#8b6cf5',
    radius: +(get(/border-radius:\s*(\d+)px/i) || 14),
    glow: +(get(/box-shadow:\s*0 0 (\d+)px/i) || 0),
    font: get(/font-family:\s*([^;}\n]+)/i)?.trim() || '',
  };
}

function write(v) {
  return `& {\n  background: ${v.bg};\n  color: ${v.fg};\n  border: 1px solid ${v.border};\n  border-radius: ${v.radius}px;\n`
    + `  box-shadow: ${v.glow ? `0 0 ${v.glow}px ${v.border}66` : 'none'};\n${v.font ? `  font-family: ${v.font};\n` : ''}}`;
}

/** Builds the style editor inside `root` and calls onChange(css) on every edit. */
export function mountStyleEditor(root, initialCss, onChange) {
  let css = initialCss || '';
  root.innerHTML = `
    <div class="seg" role="tablist" aria-label="Stijl-modus">
      <button type="button" role="tab" data-mode="simple" aria-selected="true">Simpel</button>
      <button type="button" role="tab" data-mode="css" aria-selected="false">CSS</button>
    </div>
    <div class="style-simple">
      <label class="srow">Achtergrond <input type="color" name="bg"></label>
      <label class="srow">Tekst <input type="color" name="fg"></label>
      <label class="srow">Rand <input type="color" name="border"></label>
      <label class="srow">Hoeken <input type="range" name="radius" min="0" max="32"><output name="radiusOut"></output></label>
      <label class="srow">Gloed <input type="range" name="glow" min="0" max="60"><output name="glowOut"></output></label>
      <label class="srow">Lettertype <select name="font">${FONTS.map(([v, l]) => `<option value="${esc(v)}">${l}</option>`).join('')}</select></label>
    </div>
    <div class="style-css" hidden>
      <label class="field-label" for="style-css">CSS voor deze kaart, <code>&amp;</code> is de kaart zelf</label>
      <textarea id="style-css" class="code" spellcheck="false" rows="10" placeholder="& {&#10;  background: #1b1625;&#10;}&#10;& .card__title { letter-spacing: .02em; }"></textarea>
    </div>
    <div>
      <div class="field-label">Presets</div>
      <div class="presets"></div>
      <div class="preset-save">
        <input type="text" name="presetName" placeholder="Naam voor deze stijl" aria-label="Naam voor nieuwe preset">
        <button type="button" class="btn" data-save-preset>Opslaan als preset</button>
      </div>
    </div>
    <button type="button" class="btn btn--ghost" data-reset>Terug naar standaard</button>`;

  const q = s => root.querySelector(s);
  const ta = q('textarea');
  const inputs = ['bg', 'fg', 'border', 'radius', 'glow', 'font'].map(n => q(`[name="${n}"]`));

  const syncControls = () => {
    const v = read(css);
    for (const el of inputs) el.value = v[el.name];
    if (![...q('[name="font"]').options].some(o => o.value === v.font)) q('[name="font"]').value = '';
    q('[name="radiusOut"]').value = v.radius;
    q('[name="glowOut"]').value = v.glow;
    ta.value = css;
  };
  const set = (next, { controls = true } = {}) => {
    css = next;
    if (controls) syncControls(); else ta.value = css;
    onChange(css);
  };

  for (const el of inputs) {
    el.addEventListener('input', () => {
      const v = Object.fromEntries(inputs.map(i => [i.name, i.type === 'range' ? +i.value : i.value]));
      q('[name="radiusOut"]').value = v.radius;
      q('[name="glowOut"]').value = v.glow;
      set(write(v), { controls: false });
    });
  }
  ta.addEventListener('input', () => { css = ta.value; onChange(css); });

  for (const tab of root.querySelectorAll('[data-mode]')) {
    tab.addEventListener('click', () => {
      const simple = tab.dataset.mode === 'simple';
      for (const t of root.querySelectorAll('[data-mode]')) t.setAttribute('aria-selected', String(t === tab));
      q('.style-simple').hidden = !simple;
      q('.style-css').hidden = simple;
      if (simple) syncControls();
    });
  }

  const renderPresets = () => {
    const own = state.layout.presets || [];
    q('.presets').innerHTML = [
      ...BUILTIN_PRESETS.map((p, i) => `<button type="button" class="pchip" data-builtin="${i}">${esc(p.name)}</button>`),
      ...own.map((p, i) => `<span class="pchip pchip--own"><button type="button" data-own="${i}">${esc(p.name)}</button><button type="button" data-del="${i}" aria-label="Preset ${esc(p.name)} verwijderen">×</button></span>`),
    ].join('');
  };
  q('.presets').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const own = state.layout.presets || [];
    if (b.dataset.builtin) set(BUILTIN_PRESETS[+b.dataset.builtin].css);
    else if (b.dataset.own) set(own[+b.dataset.own].css);
    else if (b.dataset.del) { setPresets(own.filter((_, i) => i !== +b.dataset.del)); renderPresets(); }
  });
  q('[data-save-preset]').addEventListener('click', () => {
    const name = q('[name="presetName"]').value.trim();
    if (!name || !css.trim()) return q('[name="presetName"]').focus();
    setPresets([...(state.layout.presets || []).filter(p => p.name !== name), { name, css }]);
    q('[name="presetName"]').value = '';
    renderPresets();
  });
  q('[data-reset]').addEventListener('click', () => set(''));

  syncControls();
  renderPresets();
  return { get value() { return css; } };
}
