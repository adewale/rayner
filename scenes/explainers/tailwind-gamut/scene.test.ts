import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf, loadSnapshots } from '../../../explain/testing.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';

const store = await loadSnapshots('scenes/explainers/tailwind-gamut');

const radar = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'radar' && x.spec.source.includes(text));
  assert.ok(s, `no pinned radar with ${text}`);
  return s;
};

const chroma500 = () => radar('curve tw["Tailwind 500"]{0.237,');

// ---------------------------------------------------------------- radar words (explain/diagrams.ts)

test('a radar chart names each curve by its value on every spoke, counts its spokes and scale, and leaves none blank', async () => {
  const seen = (await diagramOf(chroma500())).describe();
  assert.equal(seen.what, 'Radar chart: 2 curves, 17 axes from 0 to 0.35');
  assert.equal(seen.blank, undefined);
  assert.deepEqual(
    seen.parts.map((p) => p.name.split(', ').slice(0, 2).join(', ')),
    ['sRGB edge: 0.248 at red 25°, 0.193 at orange 48°', 'Tailwind 500: 0.237 at red 25°, 0.213 at orange 48°'],
  );
  assert.equal(seen.parts[1]!.name.split(', ').length, 17);
  assert.ok(seen.parts[1]!.name.endsWith('0.246 at rose 16°'));
});

test('a radar curve brings its dots: revealing the polygon reveals its vertices, which need no words of their own', async () => {
  const d = await diagramOf(chroma500(), { build: 'frame' });
  assert.equal(d.visible.has('dot:srgb:0'), false);
  await d.reveal(['curve:srgb']);
  for (let i = 0; i < 17; i++) assert.ok(d.visible.has(`dot:srgb:${i}`), `dot:srgb:${i}`);
  assert.equal(d.visible.has('dot:tw:0'), false);
  assert.equal(d.describe().blank, undefined);
  assert.equal(d.describe().what, 'Radar chart: 1 curve, 17 axes from 0 to 0.35');
});

test('a French scene says a radar chart in French', async () => {
  const seen = (await diagramOf(chroma500(), { lang: 'fr' })).describe();
  assert.equal(seen.what, 'Graphique en toile : 2 courbes, 17 axes de 0 à 0,35');
  assert.ok(seen.parts[0]!.name.startsWith('sRGB edge : 0,248 pour red 25°, 0,193 pour orange 48°'), seen.parts[0]!.name);
});
