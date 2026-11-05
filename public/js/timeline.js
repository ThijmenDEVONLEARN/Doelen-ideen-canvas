import { state, subscribe, emit } from './state.js';
import { parsePeriod, shortPeriod } from './period.js';
import { esc } from './markdown.js';

// Timeline band at the bottom. Goals are drawn as soft spans over their period
// ("voorjaar 2027" covers March to May), not as exact dates.

const band = document.getElementById('timeline');
const toggle = document.getElementById('timeline-toggle');
const PAD = 28, LANE_H = 30, MAX_LANES = 4;
let years = 5;
export const timelineHooks = { focus() {} };

export function setTimeline(on) {
  state.timeline = on;
  toggle.setAttribute('aria-pressed', String(on));
  toggle.querySelector('span').textContent = on ? 'Tijdband aan' : 'Tijdband';
  document.body.classList.toggle('has-timeline', on);
  emit();
}

function render() {
  band.hidden = !state.timeline;
  if (!state.timeline) return;

  const now = new Date();
  const start = now.getFullYear() * 12;
  const end = start + years * 12;
  const width = band.clientWidth - PAD * 2;
  const ppm = width / (years * 12);
  const x = m => PAD + (m - start) * ppm;

  const entries = [...state.items.values()]
    .filter(i => i.type === 'doel' || i.type === 'idee')
    .map(i => ({ item: i, p: parsePeriod(i.wanneer) }))
    .filter(e => e.p)
    .sort((a, b) => a.p.from - b.p.from);
  const visible = entries.filter(e => e.p.to + 1 > start && e.p.from < end);
  const outside = entries.length - visible.length;

  // Greedy lanes so labels never overlap.
  const laneEnds = [];
  const placed = visible.map(({ item, p }) => {
    const x1 = x(Math.max(p.from, start)), x2 = x(Math.min(p.to + 1, end));
    const label = `${item.titel} · ${shortPeriod(item.wanneer)}`;
    const labelW = label.length * 6.4 + 12;
    const flip = x2 + labelW > PAD + width;           // label left of the bar near the right edge
    const left = flip ? x1 - labelW - 8 : x1;
    const right = flip ? x2 : x2 + 8 + labelW;
    let lane = laneEnds.findIndex(e => e + 10 < left);
    if (lane === -1) lane = laneEnds.length < MAX_LANES ? laneEnds.length : laneEnds.indexOf(Math.min(...laneEnds));
    laneEnds[lane] = right;
    return { item, p, x1, x2, flip, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  band.style.height = `${44 + lanes * LANE_H + 26}px`;
  document.documentElement.style.setProperty('--timeline-h', band.style.height);

  const yearsHtml = Array.from({ length: years }, (_, i) => {
    const y = now.getFullYear() + i;
    return `<span class="tl-year" style="left:${x(y * 12)}px">${y}</span>`
      + (years <= 5 ? `<span class="tl-mid" style="left:${x(y * 12 + 6)}px">${years <= 2 ? 'medio' : ''}</span>` : '');
  }).join('');
  const nowX = x(now.getFullYear() * 12 + now.getMonth() + now.getDate() / 31);
  const monthName = now.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '');

  band.innerHTML = `
    <div class="tl-scale" style="background-size:${ppm}px 8px;background-position:${PAD}px 100%">${yearsHtml}</div>
    <div class="tl-now" style="left:${nowX}px"><span>nu · ${monthName} ${now.getFullYear()}</span></div>
    ${placed.map(({ item, x1, x2, flip, lane }) => {
      const top = 40 + lane * LANE_H;
      const label = `<span>${esc(item.titel)} · <em>${esc(shortPeriod(item.wanneer))}</em></span>`;
      if (item.status === 'gehaald') {
        return `<button type="button" class="tl-item tl-item--done" data-id="${esc(item.id)}" style="left:${(x1 + x2) / 2 - 6}px;top:${top + 2}px" title="${esc(item.titel)} (gehaald)"><i></i>${label}</button>`;
      }
      const vague = item.type === 'idee' || item.status === 'idee' ? ' tl-item--vague' : '';
      const bar = `<i style="width:${Math.max(8, x2 - x1)}px"></i>`;
      return `<button type="button" class="tl-item${vague}${flip ? ' tl-item--flip' : ''}" data-id="${esc(item.id)}" style="${flip ? `right:${band.clientWidth - x2}px` : `left:${x1}px`};top:${top}px">${flip ? label + bar : bar + label}</button>`;
    }).join('')}
    <div class="tl-foot">
      <span class="tl-note">${entries.length ? (outside ? `${outside} buiten beeld` : '') : 'Geef een doel een periode (potlood → Wanneer) om het hier te zien.'}</span>
      <div class="tl-zoom" role="group" aria-label="Bereik">${[1, 2, 5, 10].map(n => `<button type="button" data-years="${n}" aria-pressed="${n === years}">${n} jaar</button>`).join('')}</div>
    </div>`;
}

band.addEventListener('click', e => {
  const zoom = e.target.closest('[data-years]');
  if (zoom) { years = +zoom.dataset.years; render(); return; }
  const item = e.target.closest('[data-id]');
  if (item) timelineHooks.focus(item.dataset.id);
});
toggle.addEventListener('click', () => setTimeline(!state.timeline));
window.addEventListener('resize', render);
subscribe(render);
