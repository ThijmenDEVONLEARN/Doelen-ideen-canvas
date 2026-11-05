import { contentBounds } from './canvas.js';

// Export the whole canvas as a PNG by drawing the DOM into an SVG <foreignObject>.
// shortcut: web fonts are not embedded, so the PNG uses the fallback system fonts.

const world = document.getElementById('world');

async function toDataUrl(src) {
  const blob = await (await fetch(src)).blob();
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}

export async function exportPng() {
  const b = contentBounds();
  if (!b) throw new Error('De canvas is nog leeg');
  const pad = 48, W = Math.ceil(b.w + pad * 2), H = Math.ceil(b.h + pad * 2);
  const css = (await (await fetch('/css/app.css')).text()) + '\n' + document.getElementById('card-styles').textContent;

  const clone = world.cloneNode(true);
  clone.style.transform = `translate(${pad - b.x}px, ${pad - b.y}px)`;
  for (const el of clone.querySelectorAll('.is-selected, .is-editing, .is-linking, .is-dim')) el.classList.remove('is-selected', 'is-editing', 'is-linking', 'is-dim');
  for (const el of clone.querySelectorAll('.card__resize, .zone__resize, .link-hit')) el.remove();
  await Promise.all([...clone.querySelectorAll('img')].map(async img => { img.src = await toDataUrl(img.src); }));

  const body = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0f0d14;color:#ece8f4;font:14px/1.45 Manrope, system-ui, sans-serif">`
    + `<style>${css.replace(/@import[^;]+;/g, '').replace(/]]>/g, '')}</style>${body}</div></foreignObject></svg>`;

  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const scale = Math.min(2, 8000 / Math.max(W, H));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(W * scale), height: Math.round(H * scale) });
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `doelen-canvas-${new Date().toISOString().slice(0, 10)}.png` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
