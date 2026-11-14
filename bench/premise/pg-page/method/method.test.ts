// node --test bench/premise/pg-page/method/method.test.ts
// The method's checks, without the engine: the model agrees with the oracle, and every step of every
// scenario renders words and pictures that state the measured numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioOf } from '../../../../scenes/explainers/pg-page/model.ts';
import type { Column } from '../../../../scenes/explainers/pg-page/model.ts';
import { MEASURED } from './oracle.ts';
import { CHECKS, steps } from './page.ts';

test('the model gives the measured page bounds, line pointers and table sizes', () => {
  for (const [k, m] of Object.entries(MEASURED) as [Column, (typeof MEASURED)[Column]][]) {
    const c = scenarioOf(k, 100);
    assert.deepEqual(
      [c.page.rows, c.page.lower, c.page.upper, c.pagesFor10000, c.tuple.lpLen, c.tuple.hoff, c.tuple.data, c.page.offsets[0]],
      [m.rows, m.lower, m.upper, m.pages, m.lpLen, m.hoff, m.data, m.firstOff],
      k,
    );
  }
});

test('every step of every scenario renders and states the measured rows and lp_len', () => {
  for (const k of ['int4', 'int8', 'int4-text'] as Column[]) {
    const all = steps(k);
    assert.equal(all.length, 6);
    for (const s of all) {
      for (const field of [s.title, s.caption, s.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object/, `${k} ${s.id}`);
      assert.match(s.svg, /^<svg [^>]*viewBox="0 0 400 \d+(\.\d+)?"/, `${k} ${s.id}`);
    }
    const m = MEASURED[k];
    assert.ok(all.find((s) => s.id === 'row')!.caption.includes(`${m.lpLen} bytes (pageinspect’s lp_len)`), k);
    assert.ok(all.find((s) => s.id === 'full')!.title.includes(`holds ${m.rows} `), k);
    assert.ok(all.find((s) => s.id === 'why')!.caption.includes(`leaving ${m.upper - m.lower}`), k);
  }
  assert.ok(steps('int4-text').find((s) => s.id === 'swap')!.title.startsWith(`Answer: ${MEASURED['int4-text'].rows - MEASURED['int8-text'].rows} more`));
});

test('the check answers are computed from the model', () => {
  assert.match(CHECKS[0]!.a, /^No\. .* 32 bytes, so both rows cost 36 and a page holds 226/);
  assert.match(CHECKS[2]!.a, /cost 52 bytes/);
});
