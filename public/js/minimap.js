import { state, subscribe } from './state.js';
import { contentBounds, centerOn } from './canvas.js';

// Small overview in the corner: cards, zones and the visible area. Click or drag to move there.

const mini = document.getElementById('minimap');
const ctx = mini.getContext('2d');
const viewport = document.getElementById('viewport');
let frame = null;

function transform() {
  const b = contentBounds();
  const r = viewport.getBoundingClientRect();
  const v = state.view;
  const view = { x: -v.x / v.scale, y: -v.y / v.scale, w: r.width / v.scale, h: r.height / v.scale };
  const x1 = Math.min(view.x, b?.x ?? view.x), y1 = Math.min(view.y, b?.y ?? view.y);
  const x2 = Math.max(view.x + view.w, b ? b.x + b.w : 0), y2 = Math.max(view.y + view.h, b ? b.y + b.h : 0);
  const pad = 8, W = mini.width / devicePixelRatio, H = mini.height / devicePixelRatio;
  const s = Math.min((W - pad * 2) / (x2 - x1), (H - pad * 2) / (y2 - y1));
  const ox = pad + ((W - pad * 2) - (x2 - x1) * s) / 2 - x1 * s;
  const oy = pad + ((H - pad * 2) - (y2 - y1) * s) / 2 - y1 * s;
  return { s, ox, oy, view };
}

function draw() {
  frame = null;
  const dpr = devicePixelRatio;
  const W = mini.clientWidth, H = mini.clientHeight;
  if (mini.width !== W * dpr) { mini.width = W * dpr; mini.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const { s, ox, oy, view } = transform();
  ctx.strokeStyle = '#3a3350';
  ctx.setLineDash([3, 3]);
  for (const z of state.layout.zones) ctx.strokeRect(ox + z.x * s, oy + z.y * s, z.w * s, z.h * s);
  ctx.setLineDash([]);
  for (const el of document.querySelectorAll('#cards > .card')) {
    const item = state.items.get(el.dataset.id);
    ctx.fillStyle = item?.status === 'gehaald' ? '#5fd49a' : item?.type === 'doel' ? '#8b6cf5' : '#4a3e70';
    ctx.fillRect(ox + el.offsetLeft * s, oy + el.offsetTop * s, Math.max(2, el.offsetWidth * s), Math.max(2, el.offsetHeight * s));
  }
  ctx.strokeStyle = '#4cc3d6';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + view.x * s, oy + view.y * s, view.w * s, view.h * s);
}

export function redrawMinimap() { if (!frame) frame = requestAnimationFrame(draw); }

function jump(e) {
  const r = mini.getBoundingClientRect();
  const { s, ox, oy } = transform();
  centerOn((e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s);
}
mini.addEventListener('pointerdown', e => {
  mini.setPointerCapture(e.pointerId);
  jump(e);
  const move = ev => jump(ev);
  mini.addEventListener('pointermove', move);
  mini.addEventListener('pointerup', () => mini.removeEventListener('pointermove', move), { once: true });
});
subscribe(redrawMinimap);
window.addEventListener('resize', redrawMinimap);
