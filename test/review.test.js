import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { weekStats, isoWeek } = await import('../public/js/review.js');

test('isoWeek follows ISO 8601', () => {
  assert.equal(isoWeek(new Date(2026, 10, 5)), 45);
  assert.equal(isoWeek(new Date(2027, 0, 1)), 53);
});

test('weekStats counts this week and finds stuck goals', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const ago = d => new Date(now - d * 864e5).toISOString();
  const items = [
    { id: 'a', titel: 'A', type: 'doel', status: 'bezig', aangemaakt: ago(60) },
    { id: 'b', titel: 'B', type: 'doel', status: 'bezig', aangemaakt: ago(60) },
    { id: 'c', titel: 'C', type: 'doel', status: 'gehaald', aangemaakt: ago(60) },
  ];
  const activity = [
    { t: ago(60), type: 'nieuw', id: 'a' }, { t: ago(60), type: 'nieuw', id: 'b' },
    { t: ago(2), type: 'stap', id: 'b' }, { t: ago(1), type: 'gehaald', id: 'c' },
  ];
  const s = weekStats(activity, items, now);
  assert.equal(s.steps, 1);
  assert.equal(s.created, 0);
  assert.deepEqual(s.reached, ['C']);
  assert.deepEqual(s.stuck.map(x => [x.id, x.days]), [['a', 60]]);
});
