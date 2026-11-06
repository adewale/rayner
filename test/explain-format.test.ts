import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listed, numberWord, percent } from '../scenes/explainers/lib/format.ts';

test('listed joins English lists with commas and a final "and", without a serial comma', () => {
  assert.equal(listed([]), '');
  assert.equal(listed(['R6']), 'R6');
  assert.equal(listed(['R6', 'R9']), 'R6 and R9');
  assert.equal(listed(['R6', 'R7', 'R9']), 'R6, R7 and R9');
  assert.equal(listed([3, 5, 9, 12]), '3, 5, 9 and 12');
});

test('numberWord writes one to ten as words, the chosen word for zero, and numerals otherwise', () => {
  assert.equal(numberWord(0), 'no');
  assert.equal(numberWord(0, { zero: 'none' }), 'none');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map((n) => numberWord(n)), ['one', 'two', 'three', 'four', 'five', 'six', 'ten']);
  assert.equal(numberWord(11), '11');
  assert.equal(numberWord(2.5), '2.5');
  assert.equal(numberWord(-1), '-1');
});

test('percent reads fractions, parts of a whole and values already in percent', () => {
  assert.equal(percent(0.37), '37.0%');
  assert.equal(percent(0.5073, { digits: 2 }), '50.73%');
  assert.equal(percent(5, { of: 20 }), '25.0%');
  assert.equal(percent(97.25, { of: 100 }), '97.3%'); // 97.25 is stored exactly, and toFixed rounds its half up
  assert.equal(percent(0.125, { digits: 0 }), '13%');
});

test('percent under 1% can switch to more decimals or to significant digits', () => {
  // bloom-filter's two decimals under 1%
  assert.equal(percent(0.0042, { under1: { digits: 2 } }), '0.42%');
  assert.equal(percent(0.0421, { under1: { digits: 2 } }), '4.2%');
  assert.equal(percent(0, { under1: { digits: 2 } }), '0.00%');
  // ext4-space's two significant digits under 1%, and one decimal at 0 and from 1% up
  assert.equal(percent(4, { of: 1000, under1: { significant: 2 } }), '0.40%');
  assert.equal(percent(14, { of: 100000, under1: { significant: 2 } }), '0.014%');
  assert.equal(percent(0, { of: 10, under1: { significant: 2 } }), '0.0%');
  assert.equal(percent(933, { of: 1000, under1: { significant: 2 } }), '93.3%');
});

test('percent keeps a drawn share off 0.0% with least, and rounds by Math.round on request', () => {
  // pg-page: a share of an 8192-byte page, at least 0.1% when there are any bytes
  const page = { of: 8192, least: 0.1, rounding: 'Math.round' as const };
  assert.equal(percent(4, page), '0.1%');
  assert.equal(percent(0, page), '0.0%');
  assert.equal(percent(901, page), '11.0%');
  // The two roundings differ where scaling lands on a half: 0.15 is stored as 0.1499…
  assert.equal(percent(0.15, { of: 100 }), '0.1%');
  assert.equal(percent(0.15, { of: 100, rounding: 'Math.round' }), '0.2%');
  // seasons: whole percents by Math.round
  assert.equal(percent(0.505, { digits: 0, rounding: 'Math.round' }), '51%');
});
