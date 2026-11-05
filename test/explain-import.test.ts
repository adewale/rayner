// SVG import (integrations/agentic-mermaid): text runs lowered to glyph
// outlines (text.ts) and SVG path data read as engine paths (build/read-svg.ts).
// The browser-side capture is in explain-capture.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Box } from '../src/index.ts';
import { outlineText } from '../integrations/agentic-mermaid/text.ts';
import { pathFromSvgD } from '../integrations/agentic-mermaid/build/read-svg.ts';
import type { SnapshotTextRun } from '../integrations/agentic-mermaid/snapshot.ts';
import { fc, params } from './lib/pbt.ts';

await loadFonts();
const PX = 100; // SVG pixels per scene unit
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;
const inkBox = (run: SnapshotTextRun): Box => new Group(...outlineText(run, { fill: '#000000' })).box()!;

test('SVG middle baseline centres the embedded font x-height, while alphabetic preserves its baseline', () => {
  const run = { text: 'x', x: 0, y: 0, size: 14, matrix: [1, 0, 0, 1, 0, 0] };
  const alphabetic = new Group(...outlineText(run, { fill: '#000000' }));
  const middle = new Group(...outlineText({ ...run, baseline: 'middle' }, { fill: '#000000' }));
  assert.ok(Math.abs(alphabetic.box()![1]) < 1e-6);
  assert.ok(alphabetic.center()[1] > 0.02);
  assert.ok(Math.abs(middle.center()[1]) < 1e-6, `Middle should centre x ink, got ${middle.center()[1]}`);
  assert.ok(Math.abs(middle.height() - alphabetic.height()) < 1e-6);
});

test('a text run with a measured width spans it from its anchor: middle and end shift it by half and all of that width', () => {
  // Agentic Mermaid writes every run with its width; tick labels end at their anchor, titles are centred on it.
  const run = { text: 'Hello', x: 200, y: 100, size: 20, width: 60, matrix: [1, 0, 0, 1, 0, 0] };
  const [start, middle, end] = (['start', 'middle', 'end'] as const).map((anchor) => inkBox({ ...run, anchor })) as [Box, Box, Box];
  assert.ok(near(middle[0], start[0] - 0.3) && near(end[0], start[0] - 0.6), `${start} ${middle} ${end}`);
  assert.ok([1, 3].every((i) => near(start[i]!, end[i]!)), 'the anchor moves the run along its line only');
  // The outlines stretch to the width: twice the width, twice the ink.
  const wide = inkBox({ ...run, anchor: 'start', width: 120 });
  assert.ok(near(wide[2] - wide[0], 2 * (start[2] - start[0])));
});

test('a text run set on its side by its matrix turns its ink a quarter turn about the matrix origin', () => {
  // An XY chart's y-axis title: matrix(0 -1 1 0 e f) draws the run upward from (e, f).
  const flat = inkBox({ text: 'Tokens', x: 0, y: 0, size: 12, anchor: 'middle', matrix: [1, 0, 0, 1, 0, 0] });
  const side = inkBox({ text: 'Tokens', x: 0, y: 0, size: 12, anchor: 'middle', matrix: [0, -1, 1, 0, 30, 200] });
  assert.ok(near(side[2] - side[0], flat[3] - flat[1]) && near(side[3] - side[1], flat[2] - flat[0]), `${flat} ${side}`);
  // Centred on its anchor along its own line, which now runs up the y axis through y = -f.
  assert.ok(near((side[1] + side[3]) / 2, -200 / PX + (flat[0] + flat[2]) / 2), `${side}`);
});

const coord = fc.double({ min: -5, max: 5, noNaN: true });
const vec = fc.tuple(coord, coord);

test("svg import: after Z, a drawing command starts a new subpath at the closed one's start (ManimCommunity #31; manim #1731)", () => {
  // https://github.com/ManimCommunity/manim/issues/31 (improve the SVG parser), https://github.com/3b1b/manim/pull/1731.
  // SVG 1.1 §8.3.3: after closepath the current point is the subpath's start, and the next command opens a new subpath there.
  fc.assert(
    fc.property(fc.array(vec, { minLength: 3, maxLength: 5 }), vec, fc.constantFrom('L', 'l'), (poly, next, cmd) => {
      const [p0] = poly;
      const d = 'M' + poly.map(([x, y]) => `${x} ${y}`).join('L') + 'Z' + (cmd === 'L' ? `L${next[0]} ${next[1]}` : `l${next[0] - p0![0]} ${next[1] - p0![1]}`);
      const v = pathFromSvgD(d);
      assert.equal(v.subpaths.length, 2, d);
      assert.equal(v.closed[0], true);
      const s = v.subpaths[1]!;
      assert.ok(near(s[0]!, p0![0]) && near(s[1]!, p0![1]) && near(s[s.length - 2]!, next[0]) && near(s[s.length - 1]!, next[1]), d);
    }),
    params(300),
  );
});
