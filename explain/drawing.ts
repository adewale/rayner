// The drawing kit: small functions that draw the parts explanations keep needing (a label, a
// tile, a table that places its measured columns, a flow of named steps, bars on one scale, the
// annotations), as ordinary mobjects coloured from a stage's look. Imported as `rayner/drawing`.
// Keyed pictures key their parts, so matching (matchByKey), find(), invariants and reviews can
// address them; nothing here animates, registers or reads scene state.
import { Group, Rectangle, Circle, Line, Arrow, Text } from '../src/index.ts';
import type { Mobject, Vec, Box } from '../src/index.ts';
import type { Stage } from './stage.ts';
import { callout as calloutLook, dimension as dimensionLook, pin as pinLook, legend as legendLook } from './annotate.ts';
import { emphasisSource, stagePalette } from './look.ts';
import type { Side, LegendItem } from './annotate.ts';
import { Card, CodeBlock } from './panels.ts';
import type { CardRow, CardOptions, CodeBlockOptions } from './panels.ts';
import { physicalAt } from './layout-direction.ts';
export type { LegendItem } from './annotate.ts';
export type { Card, CodeBlock, CardRow, CardOptions, CodeBlockOptions } from './panels.ts';

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
      if (keys.has(key)) throw new Error(`keyedParts().add(): two parts are keyed ${JSON.stringify(key)}; give each part its own key`);
      keys.add(key);
      parts.push(keyed(m, key));
      return m;
    },
    group: () => new Group(...parts),
  };
}

/**
 * The kit's conventions, the same in every function: the stage `s` first, for its look and its
 * text shaping; then what the picture shows, positionally (its text, rows or items, and what it
 * measures or points at); then one options object. In it, `at` is where the picture stands, `size`
 * its text size, and `key` its address. A function whose parts are keyed requires `key`; one that
 * takes it optionally keys its parts only when given it. Each keyed composite keys its parts under
 * its own key (`key:box`, `key:label` and so on), so a scene addresses a part by key, never by index.
 * Text is made with the scene's shaping.
 */

/** A centred line of text at `at`, in the look's ink unless given a `color`. */
export function label(
  s: Stage,
  text: string | number,
  { at = [0, 0], color = s.look.ink, size = 0.6, key }: { at?: Vec; color?: string; size?: number; key?: string } = {},
): Text {
  const t = new Text(String(text), { fontSize: size, color, shaping: s.scene.textShaping }).moveTo(at);
  return key ? keyed(t, key) : t;
}
/**
 * A labelled box `width` by `height` centred at `at`: soft, emphasised when `active`, red when `bad`.
 * Keyed `key` when given, with its parts `key:box` and `key:label`.
 */
export function tile(
  s: Stage,
  text: string | number,
  { at = [0, 0], width, height, active, bad, size = 0.62, key }: { at?: Vec; width: number; height: number; active?: boolean; bad?: boolean; size?: number; key?: string },
): Group {
  const color = bad ? s.look.bad : active ? s.look.emphasis : s.look.soft;
  const box = new Rectangle({
    width,
    height,
    fill: s.look.paper,
    stroke: color,
    strokeWidth: active || bad ? 0.055 : 0.025,
  }).moveTo(at);
  const words = label(s, text, { at, color: bad ? s.look.bad : s.look.ink, size });
  if (!key) return new Group(box, words);
  return keyed(new Group(keyed(box, `${key}:box`), keyed(words, `${key}:label`)), key);
}
/** A straight stroke from `a` to `b`, in the look's ink unless given a `color`; keyed when given `key`. */
export function segment(
  s: Stage,
  a: Vec,
  b: Vec,
  { color = s.look.ink, strokeWidth = 0.04, key }: { color?: string; strokeWidth?: number; key?: string } = {},
): Line {
  const line = new Line(a, b, { stroke: color, strokeWidth });
  return key ? keyed(line, key) : line;
}
/** A labelled circle at `at`, emphasised when `active`. Keyed `key` when given, with its parts `key:circle` and `key:label`. */
export function dot(
  s: Stage,
  text: string,
  { at = [0, 0], active = false, key }: { at?: Vec; active?: boolean; key?: string } = {},
): Group {
  const circle = new Circle({
    radius: 0.5,
    fill: s.look.paper,
    stroke: active ? s.look.emphasis : s.look.soft,
    strokeWidth: active ? 0.055 : 0.03,
  }).moveTo(at);
  const words = label(s, text, { at, size: 0.7 });
  if (!key) return new Group(circle, words);
  return keyed(new Group(keyed(circle, `${key}:circle`), keyed(words, `${key}:label`)), key);
}
/**
 * Where a table's columns go: their centres, or an edge for the measured columns to
 * start from, then either the right edge they spread to with equal gaps, or the
 * gap between neighbours. The table measures its own column widths either way, and
 * `at`'s x shifts them all.
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
 * the columns: the group's box is the table's measured extent. `columns` places the
 * columns, shifted by `at`'s x; the header row stands at `at`'s y, and each row `gap` below the last.
 *
 * Every part is keyed, so the same row in two pictures is the same part: the table is
 * `key`, the header row `key:head` with each header `key:head:column`, each row
 * `key:row` with each cell `key:row:column`, and the rule `key:rule`. A column is named
 * by its header, a row by its own `key` (or its index, for a bare array of cells). Two
 * columns with one header, or two rows with one key, are refused: a key is a part's
 * identity, and two parts cannot share one.
 */
export function table(
  s: Stage,
  headers: readonly string[],
  rows: readonly (TableRow | readonly TableCell[])[],
  { key, columns = [-5.5, -1.7, 2.2, 5.8], at = [0, 1.9], gap = 1.05, size = 0.6 }: { key: string; columns?: TableColumns; at?: Vec; gap?: number; size?: number },
): Group {
  const [dx, y] = at;
  const named = rows.map((row, r): TableRow => (isTableRow(row) ? row : { key: String(r), cells: row }));
  const columnsSeen = new Set<string>();
  for (const h of headers) {
    if (columnsSeen.has(h)) throw new Error(`table(): the table ${JSON.stringify(key)} has two columns headed ${JSON.stringify(h)}; a header names its column's cells, so each column needs its own`);
    columnsSeen.add(h);
  }
  const rowsSeen = new Set<string>();
  for (const { key: k } of named) {
    if (k === 'head' || k === 'rule') throw new Error(`table(): a row of the table ${JSON.stringify(key)} cannot be keyed ${JSON.stringify(k)}, since ${key}:${k} is the table's own part; key the row otherwise`);
    if (rowsSeen.has(k)) throw new Error(`table(): the table ${JSON.stringify(key)} has two rows keyed ${JSON.stringify(k)}; a row's key is its identity, so each row needs its own`);
    rowsSeen.add(k);
  }
  const values = named.map((row) => row.cells);
  const heads = headers.map((h) => new Text(h, { fontSize: size, color: s.look.ink, weight: 'bold', shaping: s.scene.textShaping }));
  const cells = values.map((row) => row.map((v) => new Text(String(v), { fontSize: size, color: s.look.ink, shaping: s.scene.textShaping })));
  const widths = headers.map((_, c) => Math.max(heads[c]!.width(), ...cells.map((row) => row[c]!.width())));
  const xs = (Array.isArray(columns) ? (columns as readonly number[]) : columnCentres(widths, columns as Exclude<TableColumns, readonly number[]>)).map((x) => x + dx);
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
          { stroke: s.look.soft, strokeWidth: 0.025 },
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
/** A title over a large value, centred on `at`'s x. Keyed `key`, with its parts `key:title` and `key:value`. */
export function stat(s: Stage, title: string, value: string | number, { at = [0, 0], key }: { at?: Vec; key: string }): Group {
  const [x, y] = at;
  return keyed(
    new Group(
      label(s, title, { at: [x, y + 0.7], color: s.look.soft, size: 0.6, key: `${key}:title` }),
      label(s, value, { at: [x, y - 0.45], size: 0.95, key: `${key}:value` }),
    ),
    key,
  );
}
/**
 * Named steps in boxes of one size, left to right on a row centred at `at`, joined by arrows; long
 * names wrap inside their box. Keyed `key`: each box `key:i` (its parts `key:i:box` and
 * `key:i:label`, a wrapped name's lines `key:i:label:j`), and the arrow into box i `key:i:arrow`.
 */
export function flow(s: Stage, names: readonly string[], { at = [0, 1], key }: { at?: Vec; key: string }): Group {
  const [x0, y] = at;
  const width = names.length === 4 ? 3.0 : 3.8,
    gap = names.length === 4 ? 0.75 : 1.35;
  const xs = names.map((_, i) => x0 + (i - (names.length - 1) / 2) * (width + gap));
  const g = new Group();
  g.key = key;
  const wrapped = names.map((name) => {
    const lines: string[] = [];
    for (const word of name.split(' ')) {
      const next = lines.length ? `${lines.at(-1)} ${word}` : word;
      if (lines.length && new Text(next, { fontSize: 0.62, shaping: s.scene.textShaping }).width() <= width - 0.3) lines[lines.length - 1] = next;
      else lines.push(word);
    }
    return lines;
  });
  const height = Math.max(1.15, ...wrapped.map((lines) => lines.length * 0.68 + 0.3));
  names.forEach((name, i) => {
    const lines = wrapped[i]!;
    const node =
      lines.length === 1
        ? tile(s, name, { at: [xs[i]!, y], width, height, size: 0.62, key: `${key}:${i}` })
        : keyed(
            new Group(
              keyed(
                new Rectangle({
                  width,
                  height,
                  fill: s.look.paper,
                  stroke: s.look.soft,
                  strokeWidth: 0.025,
                }).moveTo([xs[i]!, y]),
                `${key}:${i}:box`,
              ),
              ...lines.map((line, row) =>
                label(s, line, { at: [xs[i]!, y + ((lines.length - 1) / 2 - row) * 0.68], size: 0.62, key: `${key}:${i}:label:${row}` }),
              ),
            ),
            `${key}:${i}`,
          );
    g.add(node);
    if (i)
      g.add(
        keyed(
          new Arrow([xs[i - 1]! + width / 2, y], [xs[i]! - width / 2, y], {
            stroke: s.look.emphasis,
            strokeWidth: 0.04,
            tipLength: 0.16,
            tipWidth: 0.14,
          }),
          `${key}:${i}:arrow`,
        ),
      );
  });
  return g;
}
/**
 * Equal scale and aligned starts: comparisons do not require remembering a previous frame. The
 * first row's centre line is at `at`'s y, each next row 2.3 below, and `at`'s x shifts the layout
 * (at 0 the bars start at x = −4). Keyed `key`: each row's label `key:i:label`, track
 * `key:i:track`, bar `key:i:bar` (none for a zero value) and value `key:i:value`.
 */
export function bars(
  s: Stage,
  rows: readonly { label: string; value: number; display: string }[],
  maximum: number,
  { at = [0, 1.7], key }: { at?: Vec; key: string },
): Group {
  if (
    !Number.isFinite(maximum) ||
    maximum <= 0 ||
    rows.some((r) => !Number.isFinite(r.value) || r.value < 0 || r.value > maximum)
  )
    throw new RangeError('bars(): the maximum must be a positive number, and every value must be from 0 to the maximum');
  const [dx, y] = at;
  const g = new Group();
  g.key = key;
  rows.forEach((r, i) => {
    const yy = y - i * 2.3,
      width = (r.value / maximum) * 8.5;
    g.add(
      label(s, r.label, { at: [dx - 4, yy + 0.55], size: 0.64, key: `${key}:${i}:label` }).moveTo([dx - 4, yy + 0.55], [-1, 0]),
      keyed(
        new Rectangle({ width: 8.5, height: 0.68, fill: 'none', stroke: s.look.soft, strokeWidth: 0.02 }).moveTo([dx + 0.25, yy - 0.3]),
        `${key}:${i}:track`,
      ),
      ...(r.value > 0
        ? [keyed(new Rectangle({ width, height: 0.68, fill: s.look.emphasis, stroke: 'none' }).moveTo([dx - 4 + width / 2, yy - 0.3]), `${key}:${i}:bar`)]
        : []),
      label(s, r.display, { at: [dx + 7.2, yy - 0.3], size: 0.7, key: `${key}:${i}:value` }).moveTo([dx + 7.2, yy - 0.3], [1, 0]),
    );
  });
  return g;
}

// Annotations: pictures that say a value where it is, built in world coordinates, for a view's or a
// staged step's draw, or for s.enter, beside the parts they annotate. s.callout builds a callout with
// the same function from the points the camera shows, then maps it to the screen, so with the camera
// moved it is still at its size on screen; at home the two are the same picture.

/**
 * Words beside a target (a point, a box or a mobject) with a leader line from the words to the
 * target's nearest edge, ending in a dot, on the stage's paper: `s.callout`'s picture. `gap` is how
 * far the words stand off the target. Keyed `key` when given, with its parts `key:line`, `key:dot`,
 * `key:backing` and `key:text`. Described by its words.
 */
export function callout(
  s: Stage,
  target: Vec | Box | Mobject,
  text: string,
  { side = 'right', gap = 0.55, color = s.look.ink, size = 0.24, key }: { side?: Side; gap?: number; color?: string; size?: number; key?: string } = {},
): Group {
  return calloutLook(target, text, { color, size, side, gap, background: s.look.paper, shaping: s.scene.textShaping, ...(key === undefined ? {} : { key }) });
}
/**
 * A dimension line from `a` to `b`, set off by `offset` (positive: to the left of a→b), with ticks
 * at both ends and `label` at its middle, in the look's emphasis on its paper. Keyed `key` when given, with its parts `key:extension:start`, `key:extension:end`,
 * `key:line`, `key:arrow:start`, `key:arrow:end`, `key:backing` and `key:text`. Described as “A
 * dimension line marked …”.
 */
export function dimension(
  s: Stage,
  a: Vec,
  b: Vec,
  label: string,
  { offset = 0.3, color = s.look.emphasis, size = 0.24, key }: { offset?: number; color?: string; size?: number; key?: string } = {},
): Group {
  return dimensionLook(a, b, label, { color, size, offset, background: s.look.paper, shaping: s.scene.textShaping, ...(key === undefined ? {} : { key }) });
}
/**
 * A pin stuck in at `point`, with an optional label beside its head on its `side` (right by
 * default), in the look's emphasis. Keyed `key` when given, with its parts
 * `key:needle`, `key:head` and `key:label`. Described as “A pin marked …”.
 */
export function pin(
  s: Stage,
  point: Vec,
  { label, color = s.look.emphasis, size = 0.24, side = 'right', key }: { label?: string; color?: string; size?: number; side?: 'left' | 'right'; key?: string } = {},
): Group {
  return pinLook(point, { color, size, side, shaping: s.scene.textShaping, ...(label ? { label } : {}), ...(key === undefined ? {} : { key }) });
}
/**
 * A key: swatches (a filled square, a short line, dashed or not) with the words for what each
 * means, in order, the words in the look's ink, stacked in a column or side by side in a row
 * (`stack`), the first entry starting at `at`. Keyed `key`, each entry `key:<label>` (its swatch
 * `key:<label>:swatch`, its words `key:<label>:text`). Describes itself as its swatch→meaning
 * pairs, "Key: purple fill, cat’s bits; dashed blue line, the browser", naming each colour by its
 * nearest plain name or the entry's `name`; so a caption's "the purple fill" or "dashed" is said on
 * the stage too, and `rayner check` finds it there.
 */
export function legend(
  s: Stage,
  items: readonly LegendItem[],
  opts: { at?: Vec; size?: number; stack?: 'column' | 'row'; gap?: number; key: string },
): Group {
  const { at = [0, 0], size = 0.3, stack = 'column', gap, key } = opts;
  return legendLook(items, { ink: s.look.ink, shaping: s.scene.textShaping, size, at, stack, key, ...(gap === undefined ? {} : { gap }) });
}
/**
 * Labelled values on a panel in the stage's colours: `s.card`'s picture, not entered, for a view's
 * draw, which builds the card from state at every sync. `at: 'start' | 'end'` and the field order
 * follow the stage's direction; `direction` sets the card's own field order. Each row is a label and
 * its value, or one value per column with `columns`. A card describes itself, its lit row with its
 * word.
 */
export function card(s: Stage, rows: readonly CardRow[], opts: CardOptions = {}): Card {
  const api = (opts as { api?: string }).api ?? 'card()';
  return new Card(s.scene, stagePalette(s, api), rows, { ...opts, at: physicalAt(opts.at, s.direction), direction: opts.direction ?? s.direction });
}
/**
 * Code on a panel in the stage's colours, one string per line: `s.code`'s picture, not entered, for
 * a view's draw. `at: 'start' | 'end'` follows the stage's direction. A code panel describes itself,
 * its lit, added and removed lines with their words. For code text with no panel (the engine's
 * matching and diff transforms), use the engine's `Code`.
 */
export function code(s: Stage, source: readonly string[], opts: CodeBlockOptions = {}): CodeBlock {
  return new CodeBlock(s.scene, stagePalette(s, (opts as { api?: string }).api ?? 'code()'), source, { ...opts, at: physicalAt(opts.at, s.direction) });
}
