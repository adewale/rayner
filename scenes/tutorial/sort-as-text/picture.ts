import { Group } from '../../../src/index.ts';
import type { DrawContext } from '../../../explain/index.ts';
import { SPACE, TYPE, keyedParts, tile, tones, label } from '../../../explain/drawing.ts';
import { sorted, type State } from './model.ts';

/** A box's width, and where row `y`'s boxes stand: centred on the stage, SPACE.s apart. */
const WIDTH = 1.9;
const row = (count: number) => (i: number) => (i - (count - 1) / 2) * (WIDTH + SPACE.s);

/** One number as a raised box: one group, its two parts keyed `<key>:box` and `<key>:label`. */
const numberBox = (s: DrawContext, text: string, at: [number, number], key: string) => tile(s, text, { at, key, width: WIDTH, raised: true, size: TYPE.small });

/**
 * The array as written, and under it what sort() makes of it once the state says it is sorted. With
 * no compare function the sorted row shows each number as the string sort() compares, in quotes.
 * Every box is keyed by its number, so when a number joins, the boxes it passes slide aside.
 */
export function drawSort(s: DrawContext, st: State): Group {
  const parts = keyedParts(), t = tones(s);
  const across = row(st.values.length);
  parts.add(label(s, 'The array', { at: [0, 1.5], color: t.soft }), 'array:name');
  st.values.forEach((n, i) => parts.add(numberBox(s, String(n), [across(i), 0.6], `array:${n}`), `array:${n}`));
  const how = st.compare === 'none' ? 'sort() compares them as text' : 'sort((a, b) => a - b) compares them as numbers';
  parts.add(label(s, how, { at: [0, -3], color: t.soft }), 'sorted:name');
  if (st.sorted)
    sorted(st.values, st.compare).forEach((n, i) =>
      parts.add(numberBox(s, st.compare === 'none' ? `"${n}"` : String(n), [across(i), -1.9], `sorted:${n}`), `sorted:${n}`));
  return parts.group();
}
