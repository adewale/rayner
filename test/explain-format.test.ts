import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counted, grouped, listed, numberWord, ordinal, percent, upperFirst } from '../scenes/explainers/lib/format.ts';

test('listed joins English lists with commas and a final "and", without a serial comma', () => {
  assert.equal(listed([]), '');
  assert.equal(listed(['R6']), 'R6');
  assert.equal(listed(['R6', 'R9']), 'R6 and R9');
  assert.equal(listed(['R6', 'R7', 'R9']), 'R6, R7 and R9');
  assert.equal(listed([3, 5, 9, 12]), '3, 5, 9 and 12');
});

test('listed joins with "or" on request', () => {
  assert.equal(listed([], { or: true }), '');
  assert.equal(listed(['A'], { or: true }), 'A');
  assert.equal(listed(['A', 'B'], { or: true }), 'A or B');
  assert.equal(listed([10, 20, 30], { or: true }), '10, 20 or 30');
});

test('numberWord writes one to twelve as words, the chosen word for zero, and numerals otherwise', () => {
  assert.equal(numberWord(0), 'no');
  assert.equal(numberWord(0, { zero: 'none' }), 'none');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 11, 12].map((n) => numberWord(n)), ['one', 'two', 'three', 'four', 'five', 'six', 'ten', 'eleven', 'twelve']);
  assert.equal(numberWord(13), '13');
  assert.equal(numberWord(2.5), '2.5');
  assert.equal(numberWord(-1), '-1');
  assert.equal(numberWord(3, { capital: true }), 'Three');
  assert.equal(numberWord(0, { zero: 'no one', capital: true }), 'No one');
  assert.equal(numberWord(14, { capital: true }), '14');
});

test('counted pairs a count with its noun, plural unless the count is 1', () => {
  assert.equal(counted(1, 'edit'), '1 edit');
  assert.equal(counted(0, 'edit'), '0 edits');
  assert.equal(counted(3, 'local pod'), '3 local pods');
  assert.equal(counted(2, 'child', { plural: 'children' }), '2 children');
  assert.equal(counted(1, 'meeting', { words: true }), 'one meeting');
  assert.equal(counted(0, 'meeting', { words: true }), 'no meetings');
  assert.equal(counted(0, 'read', { words: true, zero: 'none' }), 'none reads');
  assert.equal(counted(1, 'token', { digits: 1 }), '1.0 token');
  assert.equal(counted(0.5, 'token', { digits: 1 }), '0.5 tokens');
});

test('grouped puts a comma between groups of three digits', () => {
  assert.deepEqual([0, 770, 1000, 2023, 6371, 1234567, -1234, 1234.5].map(grouped), ['0', '770', '1,000', '2,023', '6,371', '1,234,567', '-1,234', '1,234.5']);
});

test('upperFirst and ordinal', () => {
  assert.equal(upperFirst('monday'), 'Monday');
  assert.equal(upperFirst(''), '');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th']);
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
