// Starts the canvas with example goals in .demo-data/, so your own data/ stays untouched.
// Delete .demo-data/ to reset the demo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = path.join(root, '.demo-data');

if (!fs.existsSync(demo)) {
  fs.cpSync(path.join(root, 'examples'), demo, { recursive: true });
  // Give the example activity a realistic history for the weekly review.
  const now = Date.now(), day = 864e5;
  const ids = fs.readdirSync(path.join(demo, 'items')).map(f => f.replace(/\.md$/, ''));
  const activity = [
    ...ids.map(id => ({ t: new Date(now - 60 * day).toISOString(), type: 'nieuw', id })),
    { t: new Date(now - 40 * day).toISOString(), type: 'gehaald', id: '10-km-hardlopen' },
    { t: new Date(now - 30 * day).toISOString(), type: 'stap', id: 'halve-marathon' },
    { t: new Date(now - 3 * day).toISOString(), type: 'stap', id: 'eigen-bedrijf' },
    { t: new Date(now - 2 * day).toISOString(), type: 'stap', id: 'eigen-bedrijf' },
    { t: new Date(now - 1 * day).toISOString(), type: 'nieuw', id: 'spaarpot-per-maand' },
  ];
  fs.writeFileSync(path.join(demo, 'activity.json'), JSON.stringify(activity));
  console.log('Demo-data aangemaakt in .demo-data/');
}

process.env.DATA_DIR = demo;
await import('../server.js');
