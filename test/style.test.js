import test from 'node:test';
import assert from 'node:assert/strict';

// style.js touches the DOM only inside functions, but imports state.js which reads localStorage at load.
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { scopeCss } = await import('../public/js/style.js');

test('scopes "&" rules to one card', () => {
  assert.equal(scopeCss('a', '& { color: red; }\n& .card__title { x: y }'),
    '.card[data-id="a"] { color: red; }\n.card[data-id="a"] .card__title { x: y }');
});

test('wraps bare declarations and strips style tags', () => {
  assert.equal(scopeCss('a', 'color: red;'), '.card[data-id="a"] { color: red; }');
  assert.doesNotMatch(scopeCss('a', '</style><script>'), /<\/style/i);
});
