// node --test bench/premise/isdigit/method/method.test.ts
// The method's checks, without the engine: the model agrees with the oracle, and every step of every
// scenario renders words and pictures that state the recorded answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS, COUNTS, LINEUP, PREDICATES, intOf, predicates } from '../../../../scenes/explainers/isdigit/model.ts';
import { CPYTHON, CPYTHON_COUNTS } from './oracle.ts';
import { CHECKS, SHOWN, steps } from './page.ts';

test('the model gives CPython 3.15.1’s answers and counts', () => {
  for (const id of LINEUP) {
    const p = predicates(CHARS[id]),
      i = intOf(CHARS[id]);
    assert.deepEqual([p.isdecimal, p.isdigit, p.isnumeric, 'value' in i ? i.value : i.error], [...CPYTHON[id]], id);
  }
  assert.deepEqual({ ...COUNTS }, { ...CPYTHON_COUNTS });
});

test('every step of every scenario renders and states the recorded outcome', () => {
  for (const id of SHOWN)
    for (const g of PREDICATES) {
      const all = steps(id, g);
      assert.equal(all.length, 6);
      for (const s of all) {
        for (const field of [s.title, s.caption, s.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object/, `${id} ${g} ${s.id}`);
        assert.match(s.svg, /^<svg [^>]*viewBox="0 0 400 \d+"/, `${id} ${g} ${s.id}`);
      }
      const v = CPYTHON[id][3];
      assert.ok(all[1]!.title.includes(typeof v === 'number' ? `returns ${v}` : 'raises ValueError'), `${id} ${g}`);
      assert.ok(all[4]!.caption.includes('770') && all[4]!.caption.includes('898') && all[4]!.caption.includes('2,023'));
    }
  assert.match(steps('super', 'isdigit')[2]!.caption, /isdigit\(\) is True for ², and int\('²'\) raises ValueError/);
  assert.match(steps('super', 'isdigit')[4]!.title, /let '²' through to a ValueError/);
});

test('the check answers are computed from the model', () => {
  assert.match(CHECKS[0]!.a, /s\.isdigit\(\) is False\. Yet int\(s\) returns 7/);
  assert.match(CHECKS[1]!.a, /'3\.5'.*'2\.\?'/);
});
