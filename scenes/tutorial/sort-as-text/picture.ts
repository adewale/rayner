import { Group } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { keyedParts } from '../../../explain/drawing.ts';
import { SPACE, box, tones, words } from '../../../explain/kit.ts';
import { sorted, type State } from './model.ts';

/** A box's width, and where row `y`'s boxes stand: centred on the stage, SPACE.s apart. */
const WIDTH = 1.9;
const row = (count: number) => (i: number) => (i - (count - 1) / 2) * (WIDTH + SPACE.s);

/** One number as a box: its two parts, keyed `<key>:box` and `<key>:label`, in one group. */
const numberBox = (s: Stage, text: string, at: [number, number], key: string) => new Group(...box(s, text, { at, key, width: WIDTH }));

/**
 * The array as written, and under it what sort() makes of it once the state says it is sorted. With
 * no compare function the sorted row shows each number as the string sort() compares, in quotes.
 * Every box is keyed by its number, so when a number joins, the boxes it passes slide aside.
 */
export function drawSort(s: Stage, st: State): Group {
  const parts = keyedParts(), t = tones(s);
  const across = row(st.values.length);
  parts.add(words(s, 'The array', { at: [0, 1.5], color: t.soft, align: 'middle' }), 'array:name');
  st.values.forEach((n, i) => parts.add(numberBox(s, String(n), [across(i), 0.6], `array:${n}`), `array:${n}`));
  const how = st.compare === 'none' ? 'sort() compares them as text' : 'sort((a, b) => a - b) compares them as numbers';
  parts.add(words(s, how, { at: [0, -1], color: t.soft, align: 'middle' }), 'sorted:name');
  if (st.sorted)
    sorted(st.values, st.compare).forEach((n, i) =>
      parts.add(numberBox(s, st.compare === 'none' ? `"${n}"` : String(n), [across(i), -1.9], `sorted:${n}`), `sorted:${n}`));
  return parts.group();
}
