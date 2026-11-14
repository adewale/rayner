import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fc, params } from '../lib/pbt.ts';
import { skipOracle } from '../lib/oracle.ts';
import { OTHERS, SUMS, add, cut, decimal, exact, lowest, neighbours, others, round, roundRatio, same, shortest, store, sumStory, typed } from './model.ts';
import { HALVES, TENTHS, TIE_UP } from './answers.ts';

interface Oracle {
  python: string;
  doubles: { digits: string; ratio: [string, string]; repr: string; below: string; above: string }[];
  pairs: { sum: string; exact: [string, string]; digits: string }[];
  literals: { float: string; side: 'exact' | 'high' | 'low' }[];
}
const python = spawnSync('python3', ['-I', '-c', 'import math; math.nextafter(1.0, 2.0)'], { encoding: 'utf8' });
const missing = python.status !== 0 && 'no python3 (3.9 or later, for math.nextafter) on PATH';
/** CPython's answers for these doubles, pairs and decimal literals, computed now. */
function ask(request: { doubles?: number[]; pairs?: [number, number][]; literals?: string[] }): Oracle {
  const input = JSON.stringify({ doubles: (request.doubles ?? []).map(String), pairs: (request.pairs ?? []).map((p) => p.map(String)), literals: request.literals ?? [] });
  const r = spawnSync('python3', ['-I', fileURLToPath(new URL('./oracle/doubles.py', import.meta.url))], { input, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as Oracle;
}

const double = fc.double({ min: 1e-9, max: 1e9, noNaN: true, minExcluded: true });
const literalArb = fc.tuple(fc.integer({ min: 0, max: 999 }), fc.stringMatching(/^[0-9]{1,18}$/)).map(([whole, rest]) => `${whole}.${rest}`).filter((t) => Number(t) > 1e-9);

test('a double’s exact fraction, its every decimal digit, its neighbours and what it prints as are CPython’s', (t) => {
  if (skipOracle(t, missing)) return;
  const xs = [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.5, 0.25, 0.75, 0.30000000000000004, 0.7999999999999999, 1, 3, 1e6, ...fc.sample(double, params(400))];
  const o = ask({ doubles: xs });
  xs.forEach((x, i) => {
    const want = o.doubles[i]!, got = exact(x);
    assert.equal(Number(want.repr), x, 'the oracle read the same double');
    // num / 2^power is CPython's as_integer_ratio, which is in lowest terms too.
    assert.equal(got.num.toString(), want.ratio[0], `${x}: numerator`);
    assert.equal((1n << BigInt(got.power)).toString(), want.ratio[1], `${x}: denominator`);
    assert.equal(decimal(got), want.digits.replace(/\.0$/, '').replace(/^(\d+\.\d*?)0+$/, '$1'), `${x}: digits`);
    assert.equal(neighbours(x).below, Number(want.below), `${x}: the double below`);
    assert.equal(neighbours(x).above, Number(want.above), `${x}: the double above`);
    // Between 0.0001 and 10^16 Python prints positional digits, as JavaScript does; it writes whole numbers with ".0".
    if (x >= 1e-4 && x < 1e16) assert.equal(shortest(x), want.repr.replace(/\.0$/, ''), `${x}: printed`);
  });
});

test('the exact sum of two doubles, rounded to the nearest with ties to even, is what CPython’s float addition gives', (t) => {
  if (skipOracle(t, missing)) return;
  const pairs: [number, number][] = [...OTHERS.map((s): [number, number] => [Number(s.a), Number(s.b)]), [0.2, 0.4], [0.3, 0.6], [1.1, 2.2], ...fc.sample(fc.tuple(double, double), params(400))];
  const o = ask({ pairs });
  pairs.forEach(([a, b], i) => {
    const want = o.pairs[i]!, total = add(exact(a), exact(b));
    assert.equal(total.num.toString(), want.exact[0], `${a} + ${b}: numerator`);
    assert.equal((1n << BigInt(total.power)).toString(), want.exact[1], `${a} + ${b}: denominator`);
    assert.equal(decimal(total), want.digits.replace(/^(\d+\.\d*?)0+$/, '$1').replace(/\.$/, ''), `${a} + ${b}: digits`);
    assert.equal(round(total).chosen, Number(want.sum), `${a} + ${b}: rounded`);
  });
});

test('a typed decimal is stored as the double CPython reads it as, on the side CPython finds it', (t) => {
  if (skipOracle(t, missing)) return;
  const literals = ['0.1', '0.2', '0.3', '0.4', '0.7', '0.8', '0.5', '0.25', '0.75', '9007199254740993', ...fc.sample(literalArb, params(400))];
  const o = ask({ literals });
  literals.forEach((text, i) => {
    const want = o.literals[i]!, got = store(text);
    assert.equal(got.chosen, Number(want.float), text);
    const side = got.where === 'exact' ? 'exact' : got.chosen === got.above ? 'high' : 'low';
    assert.equal(side, want.side, text);
  });
});

test('the model’s sum is this machine’s own: rounding the exact sum gives what JavaScript’s + gives', () => {
  fc.assert(fc.property(double, double, (a, b) => {
    const r = round(add(exact(a), exact(b)));
    assert.equal(r.chosen, a + b);
    // The exact sum lies between the two doubles named, and the chosen one is one of them.
    assert.ok(r.below <= r.chosen && r.chosen <= r.above);
    assert.equal(neighbours(r.below).above, r.above);
    assert.ok(r.along >= 0 && r.along < 1);
    assert.equal(r.where === 'exact', r.along === 0);
  }), params(2000));
});

test('a typed decimal is stored as the double JavaScript reads it as, and prints back as the shortest decimal that names it', () => {
  fc.assert(fc.property(literalArb, (text) => {
    const r = store(text);
    assert.equal(r.chosen, Number(text));
    assert.equal(Number(shortest(r.chosen)), r.chosen);
    assert.equal(shortest(r.chosen), String(r.chosen));
    // No shorter decimal names the same double: dropping a digit from what it prints reads as another.
    const printed = shortest(r.chosen);
    if (/\.\d\d/.test(printed)) assert.notEqual(Number(printed.slice(0, -1)), r.chosen);
  }), params(1000));
});

test('a double is a whole number over a power of two, and its decimal digits end', () => {
  fc.assert(fc.property(double, (x) => {
    const { num, power } = exact(x);
    assert.ok(power === 0 || num % 2n === 1n, 'lowest terms');
    assert.ok(num < 1n << 53n || power === 0);
    // The digits are the fraction, exactly: read back as a fraction over a power of ten, they equal it.
    const { num: n, places } = typed(decimal({ num, power }));
    assert.equal(n * (1n << BigInt(power)), num * 10n ** BigInt(places));
    assert.ok(same(lowest({ num: num * 4n, power: power + 2 }), { num, power }));
  }), params(500));
});

test('exactly halfway between two doubles, the one whose last bit is 0 is chosen', () => {
  fc.assert(fc.property(double, (x) => {
    const { above } = neighbours(x), a = exact(x), b = exact(above);
    // The midpoint of two neighbours: their sum over two.
    const sum = add(a, b), mid = { num: sum.num, power: sum.power + 1 };
    const r = round(mid);
    assert.equal(r.where, 'tie');
    assert.equal(r.along, 0.5);
    assert.deepEqual([r.below, r.above], [x, above]);
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, r.chosen);
    assert.equal(view.getBigUint64(0) & 1n, 0n, 'the chosen double’s last bit is 0');
  }), params(500));
  // A typed decimal can tie too: 2^53 + 1 lies halfway between two doubles and is stored as the even one.
  assert.deepEqual(roundRatio(9007199254740993n, 1n), { below: 9007199254740992, above: 9007199254740994, along: 0.5, where: 'tie', chosen: 9007199254740992 });
});

test('the page’s two sums: 0.1 + 0.2 lands one double above 0.3’s, and 0.1 + 0.3 lands on 0.4’s', () => {
  const a = sumStory(SUMS['0.1+0.2']), b = sumStory(SUMS['0.1+0.3']);
  // 0.1 is stored as 3602879701896397 / 2^55, a little high; 0.3 a little low.
  assert.deepEqual(a.stored[0]!.fraction, { num: 3602879701896397n, power: 55 });
  assert.equal(a.stored[0]!.digits, '0.1000000000000000055511151231257827021181583404541015625');
  assert.deepEqual(a.stored.map((s) => s.high), [true, true, false]);
  assert.equal(a.total, '0.3000000000000000166533453693773481063544750213623046875');
  // The exact sum is exactly halfway between 0.3's double and the next; the tie goes up, to the even one.
  assert.deepEqual(a.rounded, { below: 0.3, above: 0.30000000000000004, along: 0.5, where: 'tie', chosen: 0.30000000000000004 });
  assert.deepEqual([a.expectedAt, a.expectedTick, a.sumAt, a.sumTick], [0.2, 0, 0.5, 1]);
  assert.deepEqual([a.prints, a.expectedPrints, a.equal], ['0.30000000000000004', '0.3', false]);
  assert.equal(a.sum, 0.1 + 0.2);
  // The gap between doubles here is 2^-54.
  assert.deepEqual(a.gap, { num: 1n, power: 54 });
  assert.equal(a.ticks.length, 3);
  // 0.1 + 0.3: again a tie, again upward, and this time up is the double 0.4 is stored as.
  assert.deepEqual(b.rounded, { below: 0.39999999999999997, above: 0.4, along: 0.5, where: 'tie', chosen: 0.4 });
  assert.deepEqual([b.expectedAt, b.expectedTick, b.sumAt, b.sumTick], [0.6, 1, 0.5, 1]);
  assert.deepEqual([b.prints, b.expectedPrints, b.equal], ['0.4', '0.4', true]);
  assert.equal(b.sum, 0.1 + 0.3);
  // Every tick is one gap from the last, and prints as its own shortest decimal.
  for (const m of [a, b]) m.ticks.forEach((tick, i) => { if (i) assert.equal(neighbours(m.ticks[i - 1]!.double).above, tick.double); assert.equal(Number(tick.prints), tick.double); });
});

test('the last step’s sums: two equal their expected decimal and two do not, and only 0.5 + 0.25 is exact', () => {
  assert.deepEqual(others(), [
    { sum: '0.1 + 0.2', prints: '0.30000000000000004', expected: '0.3', equal: false, where: 'tie' },
    { sum: '0.1 + 0.3', prints: '0.4', expected: '0.4', equal: true, where: 'tie' },
    { sum: '0.1 + 0.7', prints: '0.7999999999999999', expected: '0.8', equal: false, where: 'below' },
    { sum: '0.5 + 0.25', prints: '0.75', expected: '0.75', equal: true, where: 'exact' },
  ]);
  for (const o of others()) assert.equal(o.equal, eval(`${o.sum} === ${o.expected}`), o.sum);
  assert.equal(cut('0.1000000000000000055511151231257827021181583404541015625', 25), '0.1000000000000000055511151…');
  assert.equal(cut('0.75', 25), '0.75');
});

test('the check answers’ cases: 0.2 + 0.4 ties upward past 0.6, and ten 0.1s do not make 1', () => {
  assert.deepEqual([TIE_UP.prints, TIE_UP.equal, TIE_UP.rounded.where], ['0.6000000000000001', false, 'tie']);
  assert.equal(TIE_UP.sum, 0.2 + 0.4);
  // The answer's words: both stored high, and the lower neighbour of the tie is the double 0.6 is stored as.
  assert.deepEqual(TIE_UP.stored.map((s) => s.high), [true, true, false]);
  assert.equal(TIE_UP.rounded.below, 0.6);
  assert.deepEqual(HALVES.stored.map((s) => s.exact), [true, true, true]);
  assert.equal(HALVES.rounded.where, 'exact');
  // Adding 0.1 ten times, rounding after each: the model's running total is the machine's.
  let machine = 0.1;
  for (let i = 1; i < 10; i++) machine += 0.1;
  assert.equal(TENTHS.total, machine);
  assert.equal(TENTHS.prints, '0.9999999999999999');
  assert.equal(TENTHS.total === 1, false);
});
