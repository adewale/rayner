// How a radar chart's Mermaid source reads into axes, curves and a scale (explain/diagrams.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarData } from '../explain/diagrams.ts';

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
