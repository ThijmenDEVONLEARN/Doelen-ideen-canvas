import { api } from './api.js';
import { createItem } from './state.js';
import { panelHooks } from './panel.js';

// Vision board images: pick a file, drop it on the canvas or paste it.

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX = 15 * 1024 * 1024;

export async function upload(file) {
  if (!ACCEPT.includes(file.type)) throw new Error('Alleen png, jpg, gif of webp');
  if (file.size > MAX) throw new Error('Afbeelding is groter dan 15 MB');
  return (await api('POST', '/api/uploads', file)).url;
}

function chooseFile() {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT.join(',') });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function addImage(point, file) {
  file ??= await chooseFile();
  if (!file) return null;
  const url = await upload(file);
  const titel = file.name ? file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') : 'Afbeelding';
  return createItem({ type: 'afbeelding', titel, afbeelding: url }, { x: Math.round(point.x - 100), y: Math.round(point.y - 70) });
}

/** Drag-and-drop and paste on the canvas. */
export function setupImageDrop(viewport, toWorld, center) {
  viewport.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
  viewport.addEventListener('drop', e => {
    const files = [...e.dataTransfer.files].filter(f => ACCEPT.includes(f.type));
    if (!files.length) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    files.forEach((f, i) => addImage({ x: p.x + i * 30, y: p.y + i * 30 }, f));
  });
  window.addEventListener('paste', e => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    const file = [...e.clipboardData.files].find(f => ACCEPT.includes(f.type));
    if (file) { e.preventDefault(); addImage(center(), file); }
  });
}

// Upload button inside the edit panel for image items.
panelHooks.uploadImage = (row, setUrl) => {
  const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: 'Uploaden' });
  btn.addEventListener('click', async () => {
    const file = await chooseFile();
    if (file) setUrl(await upload(file));
  });
  row.append(btn);
};
