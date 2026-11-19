import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Statecharts from './scene.ts';
import { Text } from '../../../src/index.ts';
import type { Sink } from '../../../src/index.ts';
import type { View } from '../../../explain/index.ts';
import { TYPE } from '../../../explain/drawing.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { coffee, coffeeWithFrother, activeStates } from './model.ts';

await loadFonts();
const oracle = JSON.parse(readFileSync(new URL('./fixtures/statecharts-xstate.json', import.meta.url), 'utf8')) as {
  charts: Record<string, { configurations: string[][] }>;
};

test('every oracle coffee and frother configuration fits the whole phone picture at the readable type floor', async () => {
  const checked: number[] = [];
  const sink: Sink = {
    skipUntil: Infinity,
    async frame() {},
    async stepEnd(scene, step) {
      if (step.name !== 'parent' && step.name !== 'frother') return;
      const chart = step.name === 'parent' ? coffee() : coffeeWithFrother();
      const configurations = oracle.charts[step.name === 'parent' ? 'coffee' : 'coffeeWithFrother']!.configurations;
      const pictures = scene.mobjects.filter((m): m is View => 'draw' in m && typeof m.draw === 'function');
      assert.equal(pictures.length, 1);
      const picture = pictures[0]!;
      for (const config of configurations) {
        const drawn = picture.draw({ config, current: activeStates(chart, config) }, scene.shown);
        const labels = drawn.family().filter(m => m instanceof Text);
        assert.ok(labels.length > 0);
        for (const label of labels) {
          assert.ok(label.textSize() >= TYPE.small - 1e-6, label.text);
          const box = label.box()!;
          assert.ok(box[0] >= -8 && box[1] >= -4.5 && box[2] <= 8 && box[3] <= 4.5, label.text);
        }
      }
      checked.push(configurations.length);
    },
  };
  await new Statecharts(sink).run();
  assert.deepEqual(checked, [5, 9]);
});
