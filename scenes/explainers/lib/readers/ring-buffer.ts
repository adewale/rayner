import { Group, Arrow } from '../../../../src/index.ts';
import { label, tile } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

/**
 * The queue a ring buffer replaces: values kept in array order, popped with
 * Array.prototype.shift, which takes the first value and moves each later one
 * a slot left. The counts are what real arrays report after the shift.
 */
export function arrayQueue(values: readonly number[]) {
  const after = [...values];
  const popped = after.shift()!;
  // shift moves every value behind the first: as many moves as values remain.
  return { before: [...values], after, popped, moved: after.length };
}

export function frames(): ReaderFrame[] {
  const q = arrayQueue([1, 2, 3, 4, 5]),
    big = arrayQueue(Array.from({ length: 1000 }, (_, i) => i + 1));
  const x = (i: number) => (i - 2) * 2.3,
    TOP = 1.5,
    BOTTOM = -1.0,
    W = 2.0,
    H = 1.05;
  return [
    {
      id: 'shift',
      title: 'A queue in an array: each pop moves every value left',
      line: `Predict: how could pop take ${q.popped} without moving the other ${q.moved}?`,
      caption: `The simplest queue keeps its values in order in an array. Push writes at the end; pop takes the front, then copies every other value one slot left, as the language’s definition of Array.prototype.shift does. Popping from five values moves ${q.moved}; from a thousand, ${big.moved}. Engines may store some arrays differently, but these are the copies the definition describes. The order stays right because every pop pays for every value left behind.`,
      values: { before: q.before, after: q.after, popped: q.popped, moved: q.moved },
      draw: (s) => {
        const g = new Group();
        q.before.forEach((v, i) =>
          g.add(
            tile(v, x(i), TOP, W, H, s, { size: 0.7, key: `array:${i}`, bad: i === 0 }),
            label(`slot ${i}`, x(i), TOP + 0.95, s.soft, 0.5),
          ),
        );
        q.before.forEach((_, i) => {
          const v = q.after[i];
          g.add(tile(v ?? 'empty', x(i), BOTTOM, W, H, s, { size: v == null ? 0.5 : 0.7, key: `array-after:${i}` }));
        });
        // One arrow per value shift moves: slot i + 1 to slot i.
        for (let i = 0; i < q.moved; i++)
          g.add(
            new Arrow([x(i + 1) - 0.35, TOP - H / 2 - 0.08], [x(i) + 0.35, BOTTOM + H / 2 + 0.08], {
              stroke: s.emphasis,
              strokeWidth: 0.04,
              tipLength: 0.2,
              tipWidth: 0.17,
            }),
          );
        g.add(
          label(`pop() returned ${q.popped} and moved ${q.moved} values`, 0, -2.75, s.bad, 0.58, 'shift-result'),
        );
        return g;
      },
    },
  ];
}
