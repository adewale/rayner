// The drawing kit: small functions that draw the parts explanations keep needing (a label, a
// tile, a table that places its measured columns, a flow of named steps, bars on one scale), as
// ordinary mobjects coloured from a stage's palette. Imported as `rayner/drawing`. Each returns a
// keyed Group or mobject, so matching (matchByKey), find(), invariants and reviews can address
// its parts; nothing here animates, registers or reads scene state.
import { Group, Text, Rectangle, Circle, Line, Arrow } from '../src/index.ts';
import type { Mobject, Vec, Box } from '../src/index.ts';
import type { Stage } from './stage.ts';
import { callout as calloutLook, dimension as dimensionLook, pin as pinLook, legend as legendLook } from './annotate.ts';
import { emphasisSource } from './look.ts';
import type { Side, LegendItem } from './annotate.ts';
import { Card, CodeBlock } from './panels.ts';
import type { CardRow, CardOptions, CodeOptions } from './panels.ts';
import { layoutDirection, physicalAt } from './layout-direction.ts';
export type { LegendItem } from './annotate.ts';

/**
 * `m` marked as emphasis, `as` what it shows (`'ring: idle'`, `'outlined: push at slot 3'`): call
 * it where a draw makes a mark, so the phone's close-ups and the descriptions find the mark in the
 * picture itself, at whatever state it was drawn from. A part that does not change can be put on a
 * step's close-up tour the same way, and `null` takes the mark off again. Returns `m`.
 */
export function emphasised<T extends Mobject>(m: T, as: string | null): T {
  if (as === null) { delete (m as Partial<Record<typeof emphasisSource, unknown>>)[emphasisSource]; return m; }
  // A method on the part, so a copy (a view's placed picture, say) reports itself, not the original.
  Object.assign(m, { [emphasisSource](this: Mobject) { return [[this, as]] as const; } });
  return m;
}
/** `m` with `key` set: the address matching (matchByKey), find(), invariants and reviews read. */
export function keyed<T extends Mobject>(m: T, key: string): T {
  m.key = key;
  return m;
}

/**
 * A picture built from keyed parts, as a view's draw builds one: `add(m, key)` keys `m`, keeps it in
 * order and returns it; `group()` returns the parts as one Group. A key used twice is refused when it
 * is added, because two parts with one key cannot keep their identity from picture to picture (a
 * choreography or a keyed morph would refuse the picture later, far from the line that drew it).
 */
export function keyedParts(): { add<T extends Mobject>(m: T, key: string): T; group(): Group } {
  const parts: Mobject[] = [], keys = new Set<string>();
  return {
    add(m, key) {
      if (keys.has(key)) throw new Error(`keyedParts: two parts are keyed ${key}`);
      keys.add(key);
      parts.push(keyed(m, key));
      return m;
    },
    group: () => new Group(...parts),
  };
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

/** What a table cell shows. */
export type TableCell = string | number;
/**
 * A row that carries its own identity: `key` keeps it the same part wherever it moves, so a
 * keyed morph pairs it with itself after a sort, or an insertion or deletion above it. A row
 * given as a bare array of cells is keyed by its index.
 */
export interface TableRow { key: string; cells: readonly TableCell[] }

/**
 * Headers in bold over rows of cells, text columns aligned at their starts and
 * numeric columns at their ends, with a rule under the headers that spans exactly
 * the columns: the group's box is the table's measured extent.
 *
 * Every part is keyed, so the same row in two pictures is the same part: the table is
 * `key`, the header row `key:head` with each header `key:head:column`, each row
 * `key:row` with each cell `key:row:column`, and the rule `key:rule`. A column is named
 * by its header, a row by its own `key` (or its index, for a bare array of cells). Two
 * columns with one header, or two rows with one key, are refused: a key is a part's
 * identity, and two parts cannot share one.
 */
export function table(
  headers: readonly string[],
  rows: readonly (TableRow | readonly TableCell[])[],
  s: Stage,
  { xs: columns = [-5.5, -1.7, 2.2, 5.8] as TableColumns, y = 1.9, gap = 1.05, key = 'comparison', size = 0.6 } = {},
): Group {
  const named = rows.map((row, r): TableRow => (isTableRow(row) ? row : { key: String(r), cells: row }));
  const columnsSeen = new Set<string>();
  for (const h of headers) {
    if (columnsSeen.has(h)) throw new Error(`table ${key}: two columns are headed "${h}"; a header names its column's cells, so each column needs its own`);
    columnsSeen.add(h);
  }
  const rowsSeen = new Set<string>();
  for (const { key: k } of named) {
    if (k === 'head' || k === 'rule') throw new Error(`table ${key}: a row cannot be keyed "${k}"; ${key}:${k} is the table's own part`);
    if (rowsSeen.has(k)) throw new Error(`table ${key}: two rows are keyed "${k}"; a row's key is its identity, so each row needs its own`);
    rowsSeen.add(k);
  }
  const values = named.map((row) => row.cells);
  const heads = headers.map((h) => new Text(h, { fontSize: size, color: s.palette.ink, weight: 'bold' }));
  const cells = values.map((row) => row.map((v) => new Text(String(v), { fontSize: size, color: s.palette.ink })));
  const widths = headers.map((_, c) => Math.max(heads[c]!.width(), ...cells.map((row) => row[c]!.width())));
  const xs = Array.isArray(columns) ? (columns as readonly number[]) : columnCentres(widths, columns as Exclude<TableColumns, readonly number[]>);
  const isNumber = (v: TableCell | undefined) =>
    typeof v === 'number' || /^[+−-]?\d[\d.,\s/]*(?:%|€|h|days|pages|tokens|bytes|GiB|TiB)?$/u.test(String(v));
  // A dash stands for an empty cell; it keeps a column of numbers aligned as numbers.
  const isBlank = (v: TableCell | undefined) => typeof v === 'string' && /^[–—-]?$/u.test(v);
  const numeric = headers.map(
    (_, c) => values.some((row) => isNumber(row[c])) && values.every((row) => isNumber(row[c]) || isBlank(row[c])),
  );
  const place = (text: Text, c: number, at: number) =>
    text.moveTo([xs[c]! + ((numeric[c] ? 1 : -1) * widths[c]!) / 2, at], [numeric[c] ? 1 : -1, 0]);
  // Drawn in the same order as ever (rule, headers, then rows top to bottom), so keys change no frame.
  const children: Mobject[] = [
    keyed(new Group(...heads.map((h, c) => keyed(place(h, c, y), `${key}:head:${headers[c]}`))), `${key}:head`),
    ...cells.map((row, r) => {
      const id = `${key}:${named[r]!.key}`;
      return keyed(new Group(...row.map((v, c) => keyed(place(v, c, y - (r + 1) * gap), `${id}:${headers[c]}`))), id);
    }),
  ];
  if (headers.length)
    children.unshift(
      keyed(
        new Line(
          [Math.min(...xs.slice(0, headers.length).map((x, c) => x - widths[c]! / 2)), y - size * 0.7],
          [Math.max(...xs.slice(0, headers.length).map((x, c) => x + widths[c]! / 2)), y - size * 0.7],
          { stroke: s.soft, strokeWidth: 0.025 },
        ),
        `${key}:rule`,
      ),
    );
  const g = new Group(...children);
  g.key = key;
  return g;
}
const isTableRow = (row: TableRow | readonly TableCell[]): row is TableRow => !Array.isArray(row);
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

// Annotations, as the stage's s.callout, s.dimension and s.pin draw them but without drawing them in:
// a view's draw or a staged step's draw builds them from state, beside the parts they annotate.
// The stage's helpers build these same pictures, mapped to the camera, and then draw them in.

/**
 * Words beside a target (a point, a box or a mobject) with a leader line from the words to the
 * target's nearest edge, ending in a dot, on the stage's paper: `s.callout`'s picture. `gap` is how
 * far the words stand off the target. Described by its words.
 */
export function callout(
  s: Stage,
  target: Vec | Box | Mobject,
  text: string,
  { side = 'right', gap = 0.55, color = s.palette.ink, size = 0.24, key }: { side?: Side; gap?: number; color?: string; size?: number; key?: string } = {},
): Group {
  const g = calloutLook(target, text, { color, size, side, gap, background: s.palette.paper, shaping: s.scene.textShaping });
  return key ? keyed(g, key) : g;
}
/**
 * A dimension line from `a` to `b`, set off by `offset` (positive: to the left of a→b), with ticks
 * at both ends and `label` at its middle, in the stage's emphasis on its paper: `s.dimension`'s
 * picture. Described as “A dimension line marked …”.
 */
export function dimension(
  s: Stage,
  a: Vec,
  b: Vec,
  label: string,
  { offset = 0.3, color = s.emphasis, size = 0.24, key }: { offset?: number; color?: string; size?: number; key?: string } = {},
): Group {
  const g = dimensionLook(a, b, label, { color, size, offset, background: s.palette.paper, shaping: s.scene.textShaping });
  return key ? keyed(g, key) : g;
}
/**
 * A pin stuck in at `at`, with an optional label beside its head on its `side` (right by default), in the
 * stage's emphasis: `s.pin`'s picture. Described as “A pin marked …”.
 */
export function pin(
  s: Stage,
  at: Vec,
  { label, color = s.emphasis, size = 0.24, side = 'right', key }: { label?: string; color?: string; size?: number; side?: 'left' | 'right'; key?: string } = {},
): Group {
  const g = pinLook(at, { color, size, side, shaping: s.scene.textShaping, ...(label ? { label } : {}) });
  return key ? keyed(g, key) : g;
}
/**
 * A key: swatches (a filled square, a short line, dashed or not) with the words for what each
 * means, in order, the words in the stage's ink. Keyed `key`, each entry `key:<label>`. Describes
 * itself as its swatch→meaning pairs, "Key: purple fill, cat’s bits; dashed blue line, the
 * browser", naming each colour by its nearest plain name or the entry's `name`; so a caption's "the
 * purple fill" or "dashed" is said on the stage too, and `rayner check` finds it there.
 */
export function legend(
  s: Stage,
  items: readonly LegendItem[],
  { at = [0, 0] as Vec, size = 0.3, direction = 'column' as 'column' | 'row', gap, key = 'legend' }: { at?: Vec; size?: number; direction?: 'column' | 'row'; gap?: number; key?: string } = {},
): Group {
  const g = legendLook(items, { ink: s.palette.ink, shaping: s.scene.textShaping, size, at, direction, ...(gap === undefined ? {} : { gap }) });
  g.children.forEach((entry, i) => keyed(entry, `${key}:${items[i]!.label}`));
  return keyed(g, key);
}
/**
 * Labelled values on a panel in the stage's colours: `s.card`'s picture, not entered, for a view's
 * draw, which builds the card from state at every sync. `at: 'start' | 'end'` and the field order
 * follow the stage's direction; `direction` sets the card's own field order. Each row is a label and
 * its value, or one value per column with `columns`. A card describes itself, its lit row with its
 * word.
 */
export function card(s: Stage, rows: readonly CardRow[], opts: CardOptions = {}): Card {
  const direction = layoutDirection(opts, s.direction);
  return new Card(s.scene, s.palette, rows, { ...opts, at: physicalAt(opts.at, s.direction), direction });
}
/**
 * Code on a panel in the stage's colours, one string per line: `s.code`'s picture, not entered, for
 * a view's draw. `at: 'start' | 'end'` follows the stage's direction. A code panel describes itself,
 * its lit, added and removed lines with their words. For code text with no panel (the engine's
 * matching and diff transforms), use the engine's `Code`.
 */
export function code(s: Stage, source: readonly string[], opts: CodeOptions = {}): CodeBlock {
  return new CodeBlock(s.scene, s.palette, source, { ...opts, at: physicalAt(opts.at, s.direction) });
}
