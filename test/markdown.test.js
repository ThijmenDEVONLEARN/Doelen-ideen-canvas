import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, toggleCheck, progress, summary } from '../public/js/markdown.js';

test('renders headings, checklists and inline markup', () => {
  const html = renderMarkdown('## Stappen\n- [x] Niche **kiezen**\n- [ ] KvK');
  assert.match(html, /<h4>Stappen<\/h4>/);
  assert.match(html, /<ul class="checklist">/);
  assert.match(html, /data-line="1" checked/);
  assert.match(html, /data-line="2">/);
  assert.match(html, /<strong>kiezen<\/strong>/);
});

test('escapes HTML and only links http(s)', () => {
  const html = renderMarkdown('<script>x</script> [a](javascript:alert(1)) [b](https://example.com)');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(html, /href="https:\/\/example.com"/);
});

test('toggles one checklist line and counts progress', () => {
  const md = 'tekst\n- [ ] a\n- [x] b';
  assert.equal(toggleCheck(md, 1), 'tekst\n- [x] a\n- [x] b');
  assert.equal(toggleCheck(md, 2), 'tekst\n- [ ] a\n- [ ] b');
  assert.equal(toggleCheck(md, 0), md);
  assert.deepEqual(progress(md), { done: 1, total: 2 });
});

test('summary skips markdown syntax', () => {
  assert.equal(summary('## Waarom\nOmdat'), 'Waarom');
  assert.equal(summary('- [ ] Eerste stap'), 'Eerste stap');
});
