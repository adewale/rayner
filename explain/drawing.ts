// The drawing kit: small functions that draw the parts explanations keep needing (a label, a
// tile, a table that places its measured columns, a flow of named steps, bars on one scale), as
// ordinary mobjects coloured from a stage's palette. Imported as `rayner/drawing`. Each returns a
// keyed Group or mobject, so matching (matchByKey), find(), invariants and reviews can address
// its parts; nothing here animates, registers or reads scene state.
import { Group, Text, Rectangle, Circle, Line, Arrow } from '../src/index.ts';
import type { Mobject, Vec } from '../src/index.ts';
import type { Stage } from './stage.ts';

/** `m` with `key` set: the address matching (matchByKey), find(), invariants and reviews read. */
export function keyed<T extends Mobject>(m: T, key: string): T {
  m.key = key;
  return m;
}

/** A centred line of text at (x, y). */
export function label(text: string | number, x: number, y: number, color: string, size = 0.6, key?: string): Text {
  const t = new Text(String(text), { fontSize: size, color }).moveTo([x, y]);
  if (key) t.key = key;
  return t;
}
/** A labelled box: soft, emphasised when `active`, red when `bad`; keyed when `key` is given. */
export function tile(
  text: string | number,
  x: number,
  y: number,
  width: number,
  height: number,
  s: Stage,
  options: { active?: boolean; bad?: boolean; key?: string; size?: number } = {},
): Group {
  const color = options.bad ? s.bad : options.active ? s.emphasis : s.soft;
  const g = new Group(
    new Rectangle({
      width,
      height,
      fill: s.palette.paper,
      stroke: color,
      strokeWidth: options.active || options.bad ? 0.055 : 0.025,
    }).moveTo([x, y]),
    label(text, x, y, options.bad ? s.bad : s.palette.ink, options.size ?? 0.62),
  );
  if (options.key) g.key = options.key;
  return g;
}
/** A straight stroke from a to b, keyed when `key` is given. */
export function segment(a: Vec, b: Vec, color: string, width = 0.04, key?: string): Line {
  const line = new Line(a, b, { stroke: color, strokeWidth: width });
  return key ? keyed(line, key) : line;
}
/** A labelled circle, emphasised when `active`; keyed when `key` is given. */
export function dot(text: string, x: number, y: number, s: Stage, active = false, key?: string): Group {
  const g = new Group(
    new Circle({
      radius: 0.5,
      fill: s.palette.paper,
      stroke: active ? s.emphasis : s.soft,
      strokeWidth: active ? 0.055 : 0.03,
    }).moveTo([x, y]),
    label(text, x, y, s.palette.ink, 0.7),
  );
  return key ? keyed(g, key) : g;
}
/**
 * Where a table's columns go: their centres, or an edge for the measured columns to
 * start from, then either the right edge they spread to with equal gaps, or the
 * gap between neighbours. The table measures its own column widths either way.
 */
export type TableColumns = readonly number[] | { left: number; right: number } | { left: number; gap: number };

/**
 * Headers in bold over rows of cells, text columns aligned at their starts and
 * numeric columns at their ends, with a rule under the headers that spans exactly
 * the columns: the group's box is the table's measured extent.
 */
export function table(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  s: Stage,
  { xs: columns = [-5.5, -1.7, 2.2, 5.8] as TableColumns, y = 1.9, gap = 1.05, key = 'comparison', size = 0.6 } = {},
): Group {
  const heads = headers.map((h) => new Text(h, { fontSize: size, color: s.palette.ink, weight: 'bold' }));
  const cells = rows.map((row) => row.map((v) => new Text(String(v), { fontSize: size, color: s.palette.ink })));
  const widths = headers.map((_, c) => Math.max(heads[c]!.width(), ...cells.map((row) => row[c]!.width())));
  const xs = Array.isArray(columns) ? (columns as readonly number[]) : columnCentres(widths, columns as Exclude<TableColumns, readonly number[]>);
  const isNumber = (v: string | number | undefined) =>
    typeof v === 'number' || /^[+−-]?\d[\d.,\s/]*(?:%|€|h|days|pages|tokens|bytes|GiB|TiB)?$/u.test(String(v));
  // A dash stands for an empty cell; it keeps a column of numbers aligned as numbers.
  const isBlank = (v: string | number | undefined) => typeof v === 'string' && /^[–—-]?$/u.test(v);
  const numeric = headers.map(
    (_, c) => rows.some((row) => isNumber(row[c])) && rows.every((row) => isNumber(row[c]) || isBlank(row[c])),
  );
  const place = (text: Text, c: number, at: number) =>
    text.moveTo([xs[c]! + ((numeric[c] ? 1 : -1) * widths[c]!) / 2, at], [numeric[c] ? 1 : -1, 0]);
  const children: Mobject[] = heads.map((h, c) => place(h, c, y));
  cells.forEach((row, r) => row.forEach((v, c) => children.push(place(v, c, y - (r + 1) * gap))));
  if (headers.length)
    children.unshift(
      new Line(
        [Math.min(...xs.slice(0, headers.length).map((x, c) => x - widths[c]! / 2)), y - size * 0.7],
        [Math.max(...xs.slice(0, headers.length).map((x, c) => x + widths[c]! / 2)), y - size * 0.7],
        { stroke: s.soft, strokeWidth: 0.025 },
      ),
    );
  const g = new Group(...children);
  g.key = key;
  return g;
}
/** Column centres for measured widths laid from `left`: spread to `right` with equal gaps, or `gap` apart. */
function columnCentres(widths: readonly number[], at: { left: number; right: number } | { left: number; gap: number }): number[] {
  const total = widths.reduce((a, w) => a + w, 0);
  const gap = 'gap' in at ? at.gap : widths.length > 1 ? (at.right - at.left - total) / (widths.length - 1) : 0;
  let x = at.left;
  return widths.map((w) => {
    const centre = x + w / 2;
    x += w + gap;
    return centre;
  });
}
/** A title over a large value, keyed. */
export function stat(s: Stage, title: string, value: string | number, x: number, y: number, key: string): Group {
  const g = new Group(label(title, x, y + 0.7, s.soft, 0.6), label(value, x, y - 0.45, s.palette.ink, 0.95));
  g.key = key;
  return g;
}
/** Named steps in boxes of one size, left to right, joined by arrows; long names wrap inside their box. */
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
