import { Scene, Group, Rectangle, Arrow, Text } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, table, tile, presentFrame } from './lesson-drawing.ts';
export { label, table, tile };
import type {NarrativeFrame} from './lesson-drawing.ts';
export interface ReaderFrame extends NarrativeFrame { values: Record<string, unknown> }
/** A short explanation precedes the detailed program walkthrough in the same
 * scene. Both use the domain model; neither reads values back from captions. */
export async function readerFirst(
  scene: Scene,
  s: Stage,
  frames: readonly ReaderFrame[] | Promise<readonly ReaderFrame[]>,
) {
  for (const frame of await frames) await presentFrame(scene, s, frame, () => {
    scene.state.reader = {...frame.values};
  }, true);
}

export function flow(s: Stage, names: readonly string[], { y = 1, key = 'reader-flow' } = {}) {
  const width = names.length === 4 ? 3.0 : 3.8,
    gap = names.length === 4 ? 0.75 : 1.35;
  const xs = names.map((_, i) => (i - (names.length - 1) / 2) * (width + gap));
  const g = new Group();
  g.key = key;
  const wrapped = names.map((name) => {
    const lines: string[] = [];
    for (const word of name.split(' ')) {
      const next = lines.length ? `${lines.at(-1)} ${word}` : word;
      if (lines.length && new Text(next, { fontSize: 0.62 }).width() <= width - 0.3) lines[lines.length - 1] = next;
      else lines.push(word);
    }
    return lines;
  });
  const height = Math.max(1.15, ...wrapped.map((lines) => lines.length * 0.68 + 0.3));
  names.forEach((name, i) => {
    const lines = wrapped[i]!;
    const node =
      lines.length === 1
        ? tile(name, xs[i]!, y, width, height, s, { size: 0.62 })
        : new Group(
            new Rectangle({
              width,
              height,
              fill: s.palette.paper,
              stroke: s.soft,
              strokeWidth: 0.025,
            }).moveTo([xs[i]!, y]),
            ...lines.map((line, row) =>
              label(line, xs[i]!, y + ((lines.length - 1) / 2 - row) * 0.68, s.palette.ink, 0.62),
            ),
          );
    node.key = `${key}:${i}`;
    g.add(node);
    if (i)
      g.add(
        new Arrow([xs[i - 1]! + width / 2, y], [xs[i]! - width / 2, y], {
          stroke: s.emphasis,
          strokeWidth: 0.04,
          tipLength: 0.16,
          tipWidth: 0.14,
        }),
      );
  });
  return g;
}
/** Equal scale and aligned starts: comparisons do not require remembering a previous frame. */
export function bars(
  s: Stage,
  rows: readonly { label: string; value: number; display: string }[],
  maximum: number,
  { key = 'reader-bars', y = 1.7 } = {},
) {
  if (
    !Number.isFinite(maximum) ||
    maximum <= 0 ||
    rows.some((r) => !Number.isFinite(r.value) || r.value < 0 || r.value > maximum)
  )
    throw new Error('Bars need a positive scale and values within it');
  const g = new Group();
  g.key = key;
  rows.forEach((r, i) => {
    const yy = y - i * 2.3,
      width = (r.value / maximum) * 8.5;
    g.add(
      label(r.label, -4, yy + 0.55, s.palette.ink, 0.64, `${key}:${i}:label`).moveTo([-4, yy + 0.55], [-1, 0]),
      new Rectangle({ width: 8.5, height: 0.68, fill: 'none', stroke: s.soft, strokeWidth: 0.02 }).moveTo([
        0.25,
        yy - 0.3,
      ]),
      ...(r.value > 0
        ? [new Rectangle({ width, height: 0.68, fill: s.emphasis, stroke: 'none' }).moveTo([-4 + width / 2, yy - 0.3])]
        : []),
      label(r.display, 7.2, yy - 0.3, s.palette.ink, 0.7, `${key}:${i}:value`).moveTo([7.2, yy - 0.3], [1, 0]),
    );
  });
  return g;
}
