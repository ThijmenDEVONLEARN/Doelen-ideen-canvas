import { state, createItem } from './state.js';
import { api } from './api.js';
import { progress, esc } from './markdown.js';

// Weekly review: what moved this week, which goal is stuck, and what's next.
// The answers are saved as a note on the canvas.

const DAY = 864e5;
const STUCK_DAYS = 21;

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / DAY + 1) / 7);
}

export function weekStats(activity, items, now = new Date()) {
  const since = now - 7 * DAY;
  const week = activity.filter(a => new Date(a.t) >= since);
  const lastStep = {};
  for (const a of activity) if (a.type === 'stap' || a.type === 'nieuw') lastStep[a.id] = Math.max(lastStep[a.id] || 0, +new Date(a.t));
  const stuck = items.filter(i => i.type === 'doel' && i.status === 'bezig'
    && now - (lastStep[i.id] || +new Date(i.aangemaakt) || 0) > STUCK_DAYS * DAY);
  return {
    steps: week.filter(a => a.type === 'stap').length,
    created: week.filter(a => a.type === 'nieuw').length,
    reached: week.filter(a => a.type === 'gehaald').map(a => items.find(i => i.id === a.id)?.titel).filter(Boolean),
    stuck: stuck.map(i => ({ id: i.id, titel: i.titel, days: Math.floor((now - (lastStep[i.id] || +new Date(i.aangemaakt))) / DAY) })),
  };
}

export async function openReview({ at }) {
  const items = [...state.items.values()];
  const s = weekStats(await api('GET', '/api/activity'), items);
  const now = new Date();
  const week = isoWeek(now);
  const from = new Date(now - 6 * DAY).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const to = now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  const busy = items.filter(i => i.type === 'doel' && i.status === 'bezig').map(i => ({ i, p: progress(i.inhoud) })).filter(x => x.p.total);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <form class="review" role="dialog" aria-label="Weekreview">
      <div><div class="field-label">Week ${week} · ${from} t/m ${to}</div><h2 class="review__title">Hoe ging deze week?</h2></div>
      <div class="stats">
        <div><b>${s.steps}</b><span>stappen afgevinkt</span></div>
        <div><b>${s.created}</b><span>nieuwe doelen en ideeën</span></div>
        <div><b>${s.reached.length}</b><span>doelen gehaald</span></div>
      </div>
      ${busy.length ? `<ul class="review__goals">${busy.map(({ i, p }) => `<li><span>${esc(i.titel)}</span><div class="card__bar"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></div><em>${p.done}/${p.total}</em></li>`).join('')}</ul>` : ''}
      ${s.stuck.map(x => `<p class="warn"><i></i><span><b>${esc(x.titel)}</b> heeft al ${x.days} dagen geen stap gezet. Kies er nu één kleine stap voor.</span></p>`).join('')}
      <div class="two">
        <label><span class="field-label">Wat ging goed?</span><textarea name="good" class="input" rows="4"></textarea></label>
        <label><span class="field-label">Wat pak ik volgende week op?</span><textarea name="next" class="input" rows="4"></textarea></label>
      </div>
      <div class="edit__actions"><span class="spacer"></span>
        <button type="button" class="btn" data-close>Later</button>
        <button type="submit" class="btn btn--primary">Opslaan op canvas</button></div>
    </form>`;
  document.body.append(overlay);
  const form = overlay.querySelector('form');
  const close = () => overlay.remove();
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const good = form.elements.good.value.trim(), next = form.elements.next.value.trim();
    const md = [
      `${s.steps} stappen afgevinkt, ${s.created} nieuwe items${s.reached.length ? `, gehaald: ${s.reached.join(', ')}` : ''}.`,
      good && `## Wat ging goed\n${good}`,
      next && `## Volgende week\n${next.split('\n').map(l => l.trim() ? `- [ ] ${l.replace(/^[-*]\s*(\[ \]\s*)?/, '')}` : '').filter(Boolean).join('\n')}`,
    ].filter(Boolean).join('\n\n');
    await createItem({ type: 'notitie', titel: `Weekreview week ${week}`, inhoud: md }, { x: Math.round(at().x - 115), y: Math.round(at().y - 80) });
    close();
  });
  form.elements.good.focus();
}
