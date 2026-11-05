import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, stringify } from '../server/frontmatter.js';
import { createStore, slugify, countChecks } from '../server/store.js';

test('frontmatter round-trips plain values and blocks', () => {
  const data = { titel: 'Eigen bedrijf: stap 1', status: 'bezig', stijl: '& {\n  color: red;\n}' };
  const text = stringify(data, '## Waarom\nOmdat.\n');
  const back = parse(text);
  assert.deepEqual(back.data, data);
  assert.equal(back.body, '## Waarom\nOmdat.\n');
});

test('frontmatter tolerates files without a header', () => {
  assert.deepEqual(parse('alleen tekst'), { data: {}, body: 'alleen tekst' });
});

test('slugify strips accents and symbols', () => {
  assert.equal(slugify('Naar Japan! (ooit) – €'), 'naar-japan-ooit');
  assert.equal(slugify('Café idée'), 'cafe-idee');
  assert.equal(slugify('!!!'), 'item');
});

test('countChecks counts done and open checklist lines', () => {
  assert.deepEqual(countChecks('- [x] a\n- [ ] b\n* [X] c\ntekst'), { done: 2, total: 3 });
});

test('store creates, updates, logs steps and removes items', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-'));
  const store = createStore(dir);
  const a = store.create({ titel: 'Halve marathon', inhoud: '- [ ] 5 km\n- [ ] 10 km' });
  const b = store.create({ titel: 'Halve marathon' });
  assert.equal(a.id, 'halve-marathon');
  assert.equal(b.id, 'halve-marathon-2');

  store.update(a.id, { inhoud: '- [x] 5 km\n- [x] 10 km', status: 'gehaald' });
  const types = store.getActivity().map(e => e.type);
  assert.deepEqual(types, ['nieuw', 'nieuw', 'stap', 'stap', 'gehaald']);

  store.patchLayout({ positions: { [a.id]: { x: 1, y: 2 } }, links: [{ id: 'l1', from: a.id, to: b.id }] });
  store.remove(a.id);
  assert.equal(store.get(a.id), null);
  assert.deepEqual(store.getLayout().links, []);
  assert.throws(() => store.get('../etc/passwd'), /Ongeldige id/);
  assert.throws(() => store.create({ type: 'raar' }), /type moet/);
});
