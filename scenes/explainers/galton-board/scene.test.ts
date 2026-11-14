import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import { Text } from '../../../src/index.ts';
import type { Mobject, Scene } from '../../../src/index.ts';
import GaltonBoard from './scene.ts';
import { FIRST, ROWS, binOf, boardStory, routes } from './model.ts';
import { CHART_H, FLOOR, TALLEST, binX, hops, restAt, routePath } from './picture.ts';

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

test('galton-board: the bars are as tall as the model’s counts, the labels say them, and the brace spans the bins it counts', async () => {
  const project = await loadProject(GaltonBoard, 'scenes/explainers/galton-board');
  assert.equal(project.scenarios.length, 1);
  const m = boardStory(), seen: string[] = [];
  await new project.scenarios[0]!.Scene({
    skipUntil: Infinity,
    async frame() {},
    async stepEnd(scene: Scene, step: { name: string }) {
      const part = (key: string): Mobject => {
        const found = scene.familyMembers().find((p) => p.key === key);
        assert.ok(found, `${step.name}: no part keyed ${key}`);
        return found;
      };
      seen.push(step.name);
      if (step.name === 'drop') {
        // The first ball rests on the floor of the bin its rights name.
        const [x, y] = part('ball').center(), [rx, ry] = restAt(ROWS, binOf(FIRST));
        assert.ok(close(x, rx) && close(y, ry), `the ball is at ${x}, ${y}`);
      }
      if (step.name === 'pile' || step.name === 'bell') {
        m.counts.forEach((count, bin) => {
          const [x0, y0, x1, y1] = part(`bar:${bin}`).box()!;
          assert.ok(close((x0 + x1) / 2, binX(ROWS, bin)), `bar ${bin} stands in its bin`);
          assert.ok(close(y0, FLOOR), `bar ${bin} stands on the floor`);
          assert.ok(close(y1 - y0, (count / TALLEST) * CHART_H), `bar ${bin} is ${count} balls tall`);
          const label = part(`count:${bin}`);
          assert.ok(label instanceof Text);
          assert.equal(label.text, String(count));
        });
      }
      if (step.name === 'pile') assert.equal((part('dropped') as Text).text, String(m.total));
      if (step.name === 'bell') {
        // The brace runs from the left wall of the first bin it counts to the right wall of the last.
        const [x0, , x1] = part('brace').box()!;
        assert.ok(close(x0, binX(ROWS, m.lo) - 0.5, 0.02) && close(x1, binX(ROWS, m.hi) + 0.5, 0.02), `the brace spans ${x0} to ${x1}`);
        // The shaded area stands on the floor between the same walls.
        const [a0, b0, a1] = part('bell:area').box()!;
        assert.ok(close(a0, binX(ROWS, m.lo) - 0.5, 0.02) && close(a1, binX(ROWS, m.hi) + 0.5, 0.02) && close(b0, FLOOR, 0.02));
      }
    },
  }).run();
  assert.deepEqual(seen, ['drop', 'predict', 'pile', 'paths', 'bell', 'edges']);
});

test('galton-board: every route’s path starts above the top peg, ends in the bin its rights name, and is its hops joined', () => {
  for (const route of routes(ROWS)) {
    const path = routePath(route), [x, y] = path.pointFromProportion(1), [rx, ry] = restAt(ROWS, binOf(route));
    assert.ok(close(x, rx) && close(y, ry), route.join(''));
    const parts = hops(route);
    assert.equal(parts.length, ROWS + 2);
    // Each hop begins where the one before ended.
    for (let i = 1; i < parts.length; i++) {
      const [ex, ey] = parts[i - 1]!.pointFromProportion(1), [sx, sy] = parts[i]!.pointFromProportion(0);
      assert.ok(close(ex, sx) && close(ey, sy), `${route.join('')} hop ${i}`);
    }
  }
});
