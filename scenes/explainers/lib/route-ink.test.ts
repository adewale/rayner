import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rectangle, Scene, Text, keyed } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { routeInkCheck } from './route-ink/fidelity.ts';

await loadFonts();

test('an outlined carrier can surround its destination lettering and an opaque carrier hides it', () => {
  const scene = new Scene({ async frame() {} }), word = new Text('Approve', { fontSize: 0.5 });
  const carrier = keyed(new Rectangle({ width: 5, height: 1.5, fill: 'none', stroke: '#ff6600' }), 'carrier');
  scene.add(word, carrier);
  const run = () => {
    const check = routeInkCheck();
    for (const x of [0, 0.3]) {
      carrier.moveTo([x, 0]);
      check.frame(scene, 'carrier', [word]);
    }
    return check;
  };
  const open = run();
  open.assertClear('outline docking', ['Approve']);
  assert.throws(() => open.assertClear('absent label', ['Approve', 'Missing']), /no painted witness for "Missing"/);
  carrier.setFill('#ff6600', 1);
  assert.throws(() => run().assertClear('opaque docking', ['Approve']), /hides [1-9]\d* painted text pixels/);
});
