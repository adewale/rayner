import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import { NumberLine, Text } from '../../../src/index.ts';
import type { Mobject, Scene } from '../../../src/index.ts';
import FloatSum from './scene.ts';
import { SUMS, cut, sumStory } from './model.ts';
import { PLACES } from './picture.ts';

const CHOICE: Record<string, keyof typeof SUMS> = { 'two-tenths': '0.1+0.2', 'three-tenths': '0.1+0.3' };
const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;

test('float-sum: the marks stand where the line puts the model’s places, and the printed decimals are the model’s', async () => {
  const project = await loadProject(FloatSum, 'scenes/explainers/float-sum');
  assert.equal(project.scenarios.length, 2);
  for (const scenario of project.scenarios) {
    const m = sumStory(SUMS[CHOICE[scenario.values.sum!]!]), seen: string[] = [];
    await new scenario.Scene({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene: Scene, step: { name: string }) {
        const part = (key: string): Mobject => {
          const found = scene.familyMembers().find((p) => p.key === key);
          assert.ok(found, `${scenario.values.sum} ${step.name}: no part keyed ${key}`);
          return found;
        };
        const said = (key: string) => { const t = part(key); assert.ok(t instanceof Text); return t.text; };
        seen.push(step.name);
        if (step.name === 'stored') m.stored.forEach((v, i) => assert.equal(said(`kept:${i}`), cut(v.digits, PLACES)));
        if (['line', 'predict', 'round'].includes(step.name)) {
          const line = part('line');
          assert.ok(line instanceof NumberLine);
          const x = (key: string) => part(key).center()[0], at = (place: number) => line.n2p(place)[0];
          // The ring is at the typed decimal's place, and the dot on the tick it is kept as.
          assert.ok(close(x('mark:typed'), at(m.expectedAt)), 'the ring');
          assert.ok(close(x('mark:kept'), at(m.expectedTick)), 'the dot');
          m.ticks.forEach((_, i) => assert.ok(close(x(`tick:${i}`), at(i)), `tick ${i}`));
          assert.equal(said('name:0'), m.ticks[0]!.prints);
          assert.equal(said('name:1'), m.ticks[1]!.prints);
          // The square is at the exact sum's place until it is rounded, then on the tick the sum is kept as.
          if (step.name === 'predict') assert.ok(close(x('mark:sum'), at(m.sumAt)), 'the square, before rounding');
          if (step.name === 'round') {
            assert.ok(close(x('mark:sum'), at(m.sumTick)), 'the square, after rounding');
            // Equal doubles are one tick: the square ends on the dot only when == holds.
            assert.equal(close(x('mark:sum'), x('mark:kept')), m.equal);
          }
        }
        if (step.name === 'print') {
          assert.equal(said('sum:kept'), cut(m.ticks[m.sumTick]!.digits, PLACES));
          assert.equal(said('sum:printed'), m.prints);
          assert.equal(said('expected:kept'), cut(m.stored[2]!.digits, PLACES));
          assert.equal(said('expected:printed'), m.expectedPrints);
        }
      },
    }).run();
    assert.deepEqual(seen, ['surprise', 'stored', 'line', 'predict', 'round', 'print', 'others']);
  }
});
