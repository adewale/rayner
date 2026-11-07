import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../../../src/index.ts';
import { NullSink } from '../../../src/output.ts';
import { loadFonts, loadSnapshots } from '../../../explain/testing.ts';
import { Diagram } from '../../../explain/index.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';

const store = await loadSnapshots('scenes/explainers/pg-page');

const pie = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'pie' && x.spec.source.includes(text));
  assert.ok(s, `no pinned pie with ${text}`);
  return s;
};

async function shown(s: DiagramSnapshot) {
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d;
}

// ---------------------------------------------------------------- pie words (explain/diagrams.ts)
await loadFonts();

test('a pie chart names its slices by name, bytes and share, says their labels with them, and leaves none blank', async () => {
  const seen = (await shown(pie('"Row data" : 904\n'))).describe();
  assert.equal(seen.what, 'Pie chart “One page of int4 rows”: 6 slices');
  assert.equal(seen.blank, undefined);
  assert.deepEqual(
    seen.parts.map((p) => p.name),
    [
      'Row data: 904 (11.0%)',
      'Tuple headers: 5198 (63.5%)',
      'Alignment padding: 1130 (13.8%)',
      'Line pointers: 904 (11.0%)',
      'Page header: 24 (0.3%)',
      'Free space: 32 (0.4%)',
    ],
  );
});

test('a pie slice without showData is named by its share alone', async () => {
  // The same snapshot with the legend lines a chart without showData draws, "Name (share)".
  const s: DiagramSnapshot = structuredClone(pie('"Row data" : 904\n'));
  for (const p of s.parts)
    if (p.id.startsWith('legend-label:'))
      for (const shape of p.shapes) if (shape.text) shape.text = shape.text.replace(/ \[\d+\]/, '');
  const seen = (await shown(s)).describe();
  assert.equal(seen.parts[0]!.name, 'Row data: 11.0%');
  assert.equal(seen.blank, undefined);
});
