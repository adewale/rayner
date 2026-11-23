import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FadeIn, FadeOut, Rectangle, Scene, Succession, Text, Transform, keyed, linear } from '../src/index.ts';
import type { Vec } from '../src/index.ts';
import { KeyedMotionSink } from '../src/internal.ts';
import type { KeyedMotionFinding } from '../src/keyed-motion.ts';
import { loadFonts } from '../explain/testing.ts';

await loadFonts();

const words = (text: string, at: Vec, key: string) => keyed(new Text(text, { fontSize: 0.7, color: '#222222' }).moveTo(at), key);

async function findings(draw: (scene: Scene) => Promise<void>): Promise<KeyedMotionFinding[]> {
  class Example extends Scene {
    override async construct() {
      await this.step('move');
      await draw(this);
    }
  }
  const sink = new KeyedMotionSink();
  await new Example(sink).run();
  return sink.finish();
}

/** A token that appears at `from`, travels to `to`, holds there `hold` seconds and leaves, in one play. */
function trip(token: Text, from: Vec, to: Vec, { move = 1.2, hold = 0.4 } = {}) {
  token.moveTo(from);
  return new Succession([
    new FadeIn(token, { runTime: 0.1 }),
    new Transform(token, token.copy().moveTo(to), { runTime: move, rateFunc: linear }),
    new Transform(token, token.copy().moveTo(to), { runTime: hold }),
    new FadeOut(token, { runTime: 0.1 }),
  ]);
}

test('travelling words with no plate cover a label whose letters they cross; words passing beside it do not', async () => {
  for (const [y, expected] of [[0, ['covers token']], [2, []]] as const) {
    const found = await findings(async (s) => {
      const label = words('ABCD', [0, 0], 'label'), token = words('WXYZ', [-6, y], 'token');
      s.add(label);
      await s.play(trip(token, [-6, y], [6, y], { move: 2.4, hold: 0.2 }));
    });
    assert.deepEqual(found.filter((f) => f.kind === 'covers').map((f) => `${f.kind} ${f.key}`), expected, JSON.stringify(found));
  }
});

test('travelling words over a resting copy of the same words cover it as a twin', async () => {
  const found = await findings(async (s) => {
    s.add(words('ABCD', [0, 0], 'label'));
    await s.play(trip(words('ABCD', [-6, 0], 'token'), [-6, 0], [6, 0], { move: 2.4, hold: 0.2 }));
  });
  const covers = found.filter((f) => f.kind === 'covers');
  assert.equal(covers.length, 1, JSON.stringify(found));
  assert.match(covers[0]!.detail, /the same words as its own/);
});

test('a token landing letter on letter on its resting copy is one word, even when a plate between them hides some of its letters', async () => {
  // Drawn in this order: the travelling copy, a plate over the left of the landing place, then
  // the resting copy above the plate. Offset by a third of a unit, the two copies are two words.
  for (const [dx, expected] of [[0, 0], [0.3, 1]] as const) {
    const found = await findings(async (s) => {
      const token = words('ABCD', [0, -4], 'value');
      const plate = new Rectangle({ width: 1.2, height: 1.4, fill: '#88aacc', stroke: 'none' }).moveTo([-0.9, 0]);
      const resting = words('ABCD', [dx, 0], 'slot');
      s.add(token, plate, resting);
      await s.play(trip(token, [0, -4], [0, 0], { move: 0.3, hold: 0.5 }));
    });
    const duplicates = found.filter((f) => f.kind === 'duplicate words');
    assert.equal(duplicates.length, expected, `offset ${dx}: ${JSON.stringify(found)}`);
  }
});
