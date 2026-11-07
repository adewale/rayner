import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../../../src/index.ts';
import { NullSink } from '../../../src/output.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { Diagram, radarData } from '../../../explain/diagrams.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';
import { wordsFor } from '../../../explain/words.ts';
import { readSnapshots } from '../../../tools/lib/explain-project.ts';

const store = await readSnapshots('scenes/explainers/tailwind-gamut/scene');

const radar = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'radar' && x.spec.source.includes(text));
  assert.ok(s, `no pinned radar with ${text}`);
  return s;
};

async function shown(s: DiagramSnapshot, Kind: import('../../../src/index.ts').SceneClass = Scene, build: 'all' | 'frame' = 'all') {
  const d = new Diagram(new Kind(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build(build);
  return d;
}

const chroma500 = () => radar('curve tw["Tailwind 500"]{0.237,');

// ---------------------------------------------------------------- radar words (explain/diagrams.ts)
await loadFonts();

test('a radar chart names each curve by its value on every spoke, counts its spokes and scale, and leaves none blank', async () => {
  const seen = (await shown(chroma500())).describe();
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
  const d = await shown(chroma500(), Scene, 'frame');
  assert.equal(d.visible.has('dot:srgb:0'), false);
  await d.reveal(['curve:srgb']);
  for (let i = 0; i < 17; i++) assert.ok(d.visible.has(`dot:srgb:${i}`), `dot:srgb:${i}`);
  assert.equal(d.visible.has('dot:tw:0'), false);
  assert.equal(d.describe().blank, undefined);
  assert.equal(d.describe().what, 'Radar chart: 1 curve, 17 axes from 0 to 0.35');
});

test('a French scene says a radar chart in French', async () => {
  class Fr extends Scene {
    static meta = { id: 'fr', title: 'fr', lang: 'fr' };
  }
  const seen = (await shown(chroma500(), Fr)).describe();
  assert.equal(seen.what, 'Graphique en toile : 2 courbes, 17 axes de 0 à 0,35');
  assert.ok(seen.parts[0]!.name.startsWith('sRGB edge : 0,248 pour red 25°, 0,193 pour orange 48°'), seen.parts[0]!.name);
  assert.deepEqual(wordsFor('fr').families.radar, ['Graphique en toile', 'courbe']);
});

test('radarData reads axes, plain and keyed curves, several curves on a line, and the default scale', () => {
  const data = radarData(
    [
      '---',
      'config:',
      '  radar:',
      '    maxWidth: 3',
      '---',
      'radar-beta',
      '  axis a["Speed"], b, c["Cost, total"]',
      '  curve x["Now"]{1, 2.5, 3}, y{c: 4, a: 1}',
      '  curve z{0, 0, 0}',
    ].join('\n'),
  );
  assert.deepEqual(data.axes, [
    { id: 'a', label: 'Speed' },
    { id: 'b', label: 'b' },
    { id: 'c', label: 'Cost, total' },
  ]);
  assert.deepEqual(data.curves, [
    { id: 'x', label: 'Now', values: [1, 2.5, 3] },
    { id: 'y', label: 'y', values: [1, NaN, 4] },
    { id: 'z', label: 'z', values: [0, 0, 0] },
  ]);
  assert.equal(data.min, 0);
  assert.equal(data.max, 4);
  assert.deepEqual([radarData('radar-beta\n  axis a, b\n  curve q{1, 2}\n  max 10\n  min 5').min, radarData('radar-beta\n  max 10\n  min 5').max], [5, 10]);
});
