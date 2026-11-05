import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePeriod, formatPeriod, shortPeriod } from '../public/js/period.js';

const range = s => { const p = parsePeriod(s); return p && [p.from - p.year * 12, p.to - p.year * 12]; };

test('parses vague periods into month ranges', () => {
  assert.deepEqual(range('medio 2028'), [4, 7]);
  assert.deepEqual(range('begin 2028'), [0, 3]);
  assert.deepEqual(range('eind 2031'), [8, 11]);
  assert.deepEqual(range('voorjaar 2027'), [2, 4]);
  assert.deepEqual(range('winter 2027'), [11, 13]);
  assert.deepEqual(range('Q2 2027'), [3, 5]);
  assert.deepEqual(range('mrt 2027'), [2, 2]);
  assert.deepEqual(range('maart 2027'), [2, 2]);
  assert.deepEqual(range('2029'), [0, 11]);
  assert.deepEqual(range('ergens in 2029'), [0, 11]);
  assert.deepEqual(range("zomer '27"), [5, 7]);
  assert.deepEqual(range('2027-09-14'), [8, 8]);
});

test('rejects text it cannot place', () => {
  assert.equal(parsePeriod(''), null);
  assert.equal(parsePeriod('ooit'), null);
  assert.equal(parsePeriod('2027-13'), null);
});

test('formats picker values and short labels', () => {
  assert.equal(formatPeriod('deel', 'medio', 2028), 'medio 2028');
  assert.equal(formatPeriod('jaar', '', 2030), '2030');
  assert.equal(formatPeriod('geen', '', 2030), '');
  assert.equal(shortPeriod('voorjaar 2027'), "voorjaar '27");
  assert.equal(shortPeriod('2029'), 'ergens in 2029');
});
