// The drawing kit, imported as `rayner/drawing`: the one way to draw a picture by hand. The measures
// a picture is laid out in (a type scale with a floor a phone can read, strokes, radii, spacing, the
// safe margin), the stage's colours by role, and small functions that draw the parts explanations
// keep needing (a line of words, a labelled box, a label on a plate, a connector with rounded
// corners, a table that places its measured columns, a flow of named steps, bars on one scale, the
// annotations and the panels), as ordinary mobjects coloured from a stage's look. Keyed pictures
// key their parts, so matching (match: 'key'), find(), invariants and reviews can address them.
// Nothing here registers or reads scene state; the choreography at the end (`beats`, `flight`,
// `pass`) builds a transition's animations from the choreography a machine's transition hands it,
// and plays nothing itself. docs/REFERENCE.md ("Drawing kit") lists it.
//
// The measures, words, plates, connectors and choreography are the reusable part of the Poppy
// series' visual system (scenes/explainers/lib/poppy-kit.ts), which builds on them: test/drawing.test.ts
// checks that the two still draw and play alike.
import { AnimationGroup, Group, Rectangle, Line, Arrow, Succession, Text, keyed } from '../src/index.ts';
import type { Animation, Mobject, Style, Vec, Box } from '../src/index.ts';
import type { Choreography } from './choreograph.ts';
import type { Stage } from './stage.ts';
import { callout as calloutLook, dimension as dimensionLook, pin as pinLook, legend as legendLook } from './annotate.ts';
import { emphasisSource, stagePalette } from './look.ts';
import type { LegendItem } from './annotate.ts';
import type { Side } from './diagrams.ts';
import { Card, CodeBlock } from './panels.ts';
import type { CardRow, CardOptions, CodeBlockOptions } from './panels.ts';
import { physicalAt } from './layout-direction.ts';
export type { LegendItem } from './annotate.ts';
export type { Card, CodeBlock, CardRow, CardOptions, CodeBlockOptions, LineMark } from './panels.ts';

// ---------------------------------------------------------------------------------------------
// Measures

/**
 * Four type sizes, in scene units, and no others. `small` is the floor: 0.56 units is 12.5 CSS px
 * on a 358 px phone stage, the smallest size `rayner review` accepts there. Hierarchy comes from
 * the jump from `small` to `title` or `display`, and from weight, not from many sizes.
 */
export const TYPE = { small: 0.56, label: 0.64, title: 0.8, display: 1.6 } as const;
/** Line weights, in units: rules, outlines of objects, idle lines, the line in use. */
export const STROKE = { hair: 0.035, fine: 0.06, line: 0.1, bold: 0.16 } as const;
/** Corner radii, in units, from a sheet's near-square corner to a device's round one. */
export const RADIUS = { sharp: 0.05, small: 0.08, panel: 0.16, round: 0.26 } as const;
/** The spacing scale, multiples of 0.14 units: related things sit `xs`–`s` apart, separate groups `l`–`xl`. */
export const SPACE = { xs: 0.14, s: 0.28, m: 0.42, l: 0.7, xl: 1.12 } as const;
/**
 * The safe area of a stage without a heading (`stage(this, { heading: false })`): keep text within
 * these. With a heading, lay text into `regionBox('main')` instead.
 */
export const MARGIN = { left: -7.65, right: 7.65, top: 4.15, bottom: -4.15 } as const;
/** The height of an opaque plate that hides a line behind a label of `TYPE.small` or `TYPE.label`, and of a raised tile's box. */
export const PLATE_HEIGHT = 0.84;

// ---------------------------------------------------------------------------------------------
// Colour roles

/**
 * The stage's colours by the one job each does, read from its look (`s.look`), so they follow the
 * stage's style and palette. No colour means "good" or "bad" by itself; `good` and `bad` are for an
 * outcome a caption names as passed or refused.
 */
export interface Tones {
  /** The ground everything sits on: the stage's paper. Plates are this colour. */
  readonly ground: string;
  /** Words, and whatever is in use: the line in use, a value that changed. */
  readonly ink: string;
  /** Secondary words, at least 4.5:1 on the ground. */
  readonly soft: string;
  /** Idle: lines not in use, empty slots. Never words. */
  readonly idle: string;
  /** The body of a structure: a box, a panel, a device. */
  readonly raised: string;
  /** Hairlines that separate. */
  readonly rule: string;
  /** The one thing the step is about. */
  readonly accent: string;
  readonly good: string;
  readonly bad: string;
}
/** The stage's colours by role (`Tones`), from its look. */
export function tones(s: Stage): Tones {
  const l = s.look;
  return { ground: l.paper, ink: l.ink, soft: l.soft, idle: l.muted, raised: l.raised, rule: l.rule, accent: l.emphasis, good: l.good, bad: l.bad };
}

// ---------------------------------------------------------------------------------------------
// Keyed parts

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
/**
 * A picture built from keyed parts, as a view's draw builds one: `add(m, key)` keys `m`, keeps it in
 * order and returns it; `group()` returns the parts as one Group. A key used twice is refused when it
 * is added, because two parts with one key cannot keep their identity from picture to picture (a
 * choreography or a keyed morph would refuse the picture later, far from the line that drew it).
 */
export function keyedParts(): Parts {
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
/** A collector of keyed parts, as `keyedParts()` returns one. */
export type Parts = { add<T extends Mobject>(m: T, key: string): T; group(): Group };
/**
 * Adds a composite's parts, each already keyed, to a `keyedParts()` collector by their own keys:
 * a list (as `plate` returns), or a keyed composite's children (a keyed `tile`'s box and label),
 * leaving the composite itself out. A transition then addresses each part, replacing the words and
 * moving the box apart, where it would move the composite whole: a choreography addresses a
 * picture's outermost keyed parts. A part with no key is refused.
 */
export function addAll(parts: Parts, composite: Mobject | readonly Mobject[]): void {
  for (const m of 'children' in composite ? [...composite.children] : composite) {
    if (!m.key) throw new Error('addAll(): a part has no key; give each part a key, as a keyed tile and plate key theirs');
    parts.add(m, m.key);
  }
}

/**
 * The kit's conventions, the same in every function: the stage `s` first, for its look and its
 * text shaping; then what the picture shows, positionally (its text, rows or items, and what it
 * measures or points at); then one options object. In it, `at` is where the picture stands, `size`
 * its text size, and `key` the address of a composite and its parts. A function whose parts are keyed
 * requires `key`; one that takes it optionally (`tile` and the annotations) keys its parts only
 * when given it. Each keyed composite keys its parts under its own key (`key:box`, `key:label` and so
 * on), so a scene addresses a part by key, never by index. A single part (`label`, `connector`) takes no
 * `key`: key it with `keyed()`, the one way to key a part.
 * Text is made with the scene's shaping.
 */

/** How `label` sets a line of text. */
export type LabelOptions = {
  /** The anchor point: the middle, start or end of the line (per `align`), at the line's vertical centre. Default [0, 0]. */
  at?: Vec;
  /** In stage units; default `TYPE.small`, the floor. Anything smaller is refused. Prefer one of `TYPE`'s sizes. */
  size?: number;
  /** Default: the stage's ink. */
  color?: string;
  bold?: boolean;
  /** JetBrains Mono, for literals: names in code, hosts, IDs, numbers a reader may copy. */
  mono?: boolean;
  /** Which part of the line `at` is: 'middle' (default), 'start' or 'end'. */
  align?: 'start' | 'middle' | 'end';
};

/**
 * One line of words, the way a scene draws words: at `at`, in the look's ink unless given a
 * `color`, at `size` units (default `TYPE.small`): Inter, or JetBrains Mono with `mono`, bold with
 * `bold`, shaped as the scene shapes text. `at` is the line's middle, or with `align` its start or
 * end, at its vertical centre. A size under `TYPE.small` (0.56 units, 12.5 px on a 358 px phone
 * stage showing the whole picture) is a RangeError: a fact that does not fit at `TYPE.small`
 * belongs in the caption or the description. Returns an unkeyed Text, its `width()` its measured
 * width; key it with `keyed()`.
 */
export function label(
  s: Stage,
  text: string | number,
  { at = [0, 0], size = TYPE.small, color = s.look.ink, bold = false, mono = false, align = 'middle' }: LabelOptions = {},
): Text {
  if (!(size >= TYPE.small - 1e-9)) throw new RangeError(`label(): ${JSON.stringify(String(text))} at ${size} units is under TYPE.small (${TYPE.small}), which a phone cannot read; put the fact in the caption instead`);
  return new Text(String(text), { fontSize: size, color, shaping: s.scene.textShaping, anchor: align, ...(bold ? { weight: 'bold' as const } : {}), ...(mono ? { font: 'mono' as const } : {}) })
    .moveTo(at, [align === 'start' ? -1 : align === 'end' ? 1 : 0, 0]);
}

/**
 * A labelled box centred at `at`, its label centred on it. On the paper, it is outlined soft,
 * emphasised when `active`, and red, words too, when `bad`. `raised` draws it as a structure's body
 * instead: filled in the raised tone, an idle outline at `STROKE.fine`, or an ink outline at
 * `STROKE.bold` with bold words when `active` (a red one when `bad`), its corners rounded by
 * `RADIUS.small`. It is as wide as its label plus `SPACE.m` each side unless given a `width`, and
 * `PLATE_HEIGHT` tall unless given a `height`; `radius` rounds its corners, `mono` sets the label in
 * JetBrains Mono. Keyed `key` when given, with its parts `key:box` and `key:label`; add those to a
 * picture by their own keys with `addAll(parts, tile(...))`, so a transition replaces the words and
 * moves the box apart.
 */
export function tile(
  s: Stage,
  text: string | number,
  { at = [0, 0], width, height = PLATE_HEIGHT, active = false, bad = false, raised = false, size = 0.62, mono = false, radius, key }: {
    at?: Vec; width?: number; height?: number; active?: boolean; bad?: boolean; raised?: boolean; size?: number; mono?: boolean; radius?: number; key?: string;
  },
): Group {
  const look = s.look, marked = active || bad;
  const words = label(s, text, { at, color: bad ? look.bad : look.ink, size, mono, bold: raised && marked });
  const box = new Rectangle({
    width: width ?? words.width() + 2 * SPACE.m,
    height,
    fill: raised ? look.raised : look.paper,
    stroke: bad ? look.bad : raised ? (active ? look.ink : look.muted) : active ? look.emphasis : look.soft,
    strokeWidth: raised ? (marked ? STROKE.bold : STROKE.fine) : marked ? 0.055 : 0.025,
    cornerRadius: radius ?? (raised ? RADIUS.small : 0),
  }).moveTo(at);
  if (key === undefined) return new Group(box, words);
  return keyed(new Group(keyed(box, `${key}:box`), keyed(words, `${key}:label`)), key);
}

/** Options for `plate`. */
export type PlateOptions = Omit<LabelOptions, 'at'> & {
  /** Where the words stand, as `label` places them, but from their start unless `align` says otherwise. */
  at: Vec;
  /** Prefix of the parts' keys: `<key>:plate` and `<key>:label`. */
  key: string;
  /** Space on each side of the words; default 0.18, as on the Poppy series' lane names. */
  padding?: number;
};

/**
 * A label set on an opaque plate of the ground's colour, so a line that runs behind it is hidden
 * where the words sit, as a transit map sets a line's name on the line. The words are a `label`, so
 * held to the type scale, standing from `at` unless `align` says otherwise. Returns two parts, keyed `<key>:plate` and `<key>:label`; the plate comes
 * first, so the words paint over it. Add them with `addAll(parts, plate(...))`.
 */
export function plate(s: Stage, text: string, { at, key, padding = 0.18, align = 'start', ...style }: PlateOptions): Mobject[] {
  const words = label(s, text, { at, align, ...style });
  const w = words.width();
  const centre = align === 'start' ? at[0] + w / 2 : align === 'end' ? at[0] - w / 2 : at[0];
  const back = new Rectangle({ width: w + 2 * padding, height: PLATE_HEIGHT, fill: s.look.paper, stroke: 'none' }).moveTo([centre, at[1]]);
  return [keyed(back, `${key}:plate`), keyed(words, `${key}:label`)];
}

/** Options for `connector`. */
export type ConnectorOptions = {
  /** The line in use: ink at `STROKE.bold`. Otherwise idle at `STROKE.line`. */
  active?: boolean;
  /** Overrides the colour `active` chooses. */
  color?: string;
  /** Overrides the weight `active` chooses. */
  strokeWidth?: number;
  /** Largest corner radius; default 0.22. A corner shorter than twice it is rounded less. */
  radius?: number;
};

/**
 * An open route through corner points, each corner rounded as a transit map rounds its lines. It is
 * a Line, so `rayner check` treats it as a connector (and fails one that crosses a label), not as an
 * object. Key it with `keyed()`. At least two points.
 */
export function connector(s: Stage, points: readonly Vec[], { active = false, color, strokeWidth, radius = 0.22 }: ConnectorOptions = {}): Line {
  if (points.length < 2) throw new RangeError('connector(): a connector needs at least two points');
  const t = tones(s);
  return roundedPath(points, radius, { stroke: color ?? (active ? t.ink : t.idle), strokeWidth: strokeWidth ?? (active ? STROKE.bold : STROKE.line), fill: 'none' });
}

/** A Line through `points` with each corner rounded by up to `r` (scenes/explainers/lib/poppy-kit.ts draws its lanes so). */
function roundedPath(points: readonly Vec[], r: number, style: Style): Line {
  const line = new Line(points[0]!, points[0]!, style);
  line.subpaths = []; line.closed = [];
  line.startNewPath(points[0]!);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!;
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, la / 2, lc / 2);
    if (k < 1e-6) { line.addLineTo(b); continue; }
    const p: Vec = [b[0] + ((a[0] - b[0]) * k) / la, b[1] + ((a[1] - b[1]) * k) / la], q: Vec = [b[0] + ((c[0] - b[0]) * k) / lc, b[1] + ((c[1] - b[1]) * k) / lc];
    line.addLineTo(p);
    line.addCubic([p[0] + (b[0] - p[0]) * 0.55, p[1] + (b[1] - p[1]) * 0.55], [q[0] + (b[0] - q[0]) * 0.55, q[1] + (b[1] - q[1]) * 0.55], q);
  }
  line.addLineTo(points.at(-1)!);
  return line;
}

/**
 * A route through these points, for a token to travel (`c.travel`, `flight`, `pass`): a Line from
 * the first to the second, then on to each next point. Consecutive repeats are dropped, since a
 * zero-length hop stalls a token; fewer than two distinct points is a RangeError.
 */
export function route(first: Vec, ...rest: Vec[]): Line {
  const points = [first, ...rest].filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1]![0], p[1] - all[i - 1]![1]) > 1e-6);
  if (points.length < 2) throw new RangeError('route(): a route needs two distinct points');
  const path = new Line(points[0]!, points[1]!);
  for (const p of points.slice(2)) path.addLineTo(p);
  return path;
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
  keyed(g, key);
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
      keyed(label(s, title, { at: [x, y + 0.7], color: s.look.soft, size: 0.6 }), `${key}:title`),
      keyed(label(s, value, { at: [x, y - 0.45], size: 0.95 }), `${key}:value`),
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
  keyed(g, key);
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
                keyed(label(s, line, { at: [xs[i]!, y + ((lines.length - 1) / 2 - row) * 0.68], size: 0.62 }), `${key}:${i}:label:${row}`),
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
  keyed(g, key);
  rows.forEach((r, i) => {
    const yy = y - i * 2.3,
      width = (r.value / maximum) * 8.5;
    g.add(
      keyed(label(s, r.label, { at: [dx - 4, yy + 0.55], size: 0.64 }), `${key}:${i}:label`).moveTo([dx - 4, yy + 0.55], [-1, 0]),
      keyed(
        new Rectangle({ width: 8.5, height: 0.68, fill: 'none', stroke: s.look.soft, strokeWidth: 0.02 }).moveTo([dx + 0.25, yy - 0.3]),
        `${key}:${i}:track`,
      ),
      ...(r.value > 0
        ? [keyed(new Rectangle({ width, height: 0.68, fill: s.look.emphasis, stroke: 'none' }).moveTo([dx - 4 + width / 2, yy - 0.3]), `${key}:${i}:bar`)]
        : []),
      keyed(label(s, r.display, { at: [dx + 7.2, yy - 0.3], size: 0.7 }), `${key}:${i}:value`).moveTo([dx + 7.2, yy - 0.3], [1, 0]),
    );
  });
  return g;
}

// Annotations: pictures that say a value where it is, built in world coordinates, for a view's or a
// staged step's draw, or for s.enter or s.keep, beside the parts they annotate.

/**
 * Words beside a target (a point, a box or a mobject) with a leader line from the words to the
 * target's nearest edge, ending in a dot, on the stage's paper. `gap` is how
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

// ---------------------------------------------------------------------------------------------
// Choreography: transitions in beats

/** One thing a transition plays: an animation, or several together. */
export type Beat = Animation | AnimationGroup;

/** Keys each choreography has already sent out, so `beats` and `flight` never take a part out twice. */
const departed = new WeakMap<Choreography, Set<string>>();
const leaveOnce = (c: Choreography, k: string, runTime: number): Animation | null => {
  const gone = departed.get(c) ?? new Set<string>();
  departed.set(c, gone);
  if (gone.has(k) || !c.has(k, 'from')) return null;
  gone.add(k);
  return c.leave(k, { runTime });
};

/** Options for `beats`. */
export type BeatsOptions = {
  /**
   * Key prefixes of the parts that belong to the last event (a token, a result): they leave before
   * the flight, and their words are replaced after it even when unchanged, so a result is never
   * readable before what caused it arrives. A prefix ending in `:` matches keys that start with it;
   * any other matches the key itself and keys under it (`token` matches `token` and `token:label`).
   * Default none.
   */
  fresh?: readonly string[];
  /** Keys to bring in right after the flight, before the rest settles (a barrier dropping in). */
  then?: readonly string[];
  /**
   * Key prefixes of parts that change before the flight, as the first beat: the line a request takes
   * lights up before its token sets off. Parts both pictures have are morphed; words that change are
   * still replaced at the end.
   */
  lead?: readonly string[];
};

/**
 * A transition between two pictures of a view, for a machine's transition or `t.choreograph(view)`,
 * in beats. First, words that change, and every `fresh` part, go, while the `lead` parts change.
 * Then the flight plays (made only now, after the leaves, since a part may enter again only once it
 * has left). Then the `then` parts come, and last the new words come while every other part settles
 * (`c.rest()`). Words are replaced, never morphed glyph by glyph. Returns one Succession.
 */
export function beats(c: Choreography, flight: () => Beat[] = () => [], { fresh = [], then = [], lead = [] }: BeatsOptions = {}): Succession {
  const starts = (list: readonly string[]) => (k: string) => list.some((f) => k === f || k.startsWith(f.endsWith(':') ? f : `${f}:`));
  const isFresh = starts(fresh), isLead = starts(lead);
  const out: Animation[] = [], back: Animation[] = [];
  for (const k of c.keys('to')) {
    if (!isLead(k) || !c.has(k, 'from') || isFresh(k) || then.includes(k)) continue;
    const now = c.from(k), next = c.to(k);
    if (now instanceof Text && next instanceof Text && now.text !== next.text) continue;
    out.push(c.morph(k, { runTime: 0.3 }));
  }
  for (const k of c.keys('to')) {
    if (!c.has(k, 'from') || then.includes(k)) continue;
    const now = c.from(k), next = c.to(k);
    if (now instanceof Text && next instanceof Text && (now.text !== next.text || isFresh(k))) {
      const gone = leaveOnce(c, k, 0.25);
      if (gone) out.push(gone);
      back.push(c.enter(k, {}, { runTime: 0.35 }));
    }
  }
  for (const k of c.keys('from'))
    if (isFresh(k) && !(c.from(k) instanceof Text && c.has(k, 'to'))) {
      const gone = leaveOnce(c, k, 0.25);
      if (gone) out.push(gone);
    }
  for (const k of then) {
    const gone = leaveOnce(c, k, 0.25);
    if (gone) out.push(gone);
  }
  const flown = flight();
  const arriving = then.filter((k) => c.has(k, 'to')).map((k) => c.enter(k, {}, { runTime: 0.3 }));
  return new Succession([
    ...(out.length ? [new AnimationGroup(out)] : []),
    ...flown,
    ...(arriving.length ? [new AnimationGroup(arriving)] : []),
    new AnimationGroup([...back, c.rest({ runTime: 0.45 })]),
  ]);
}

/**
 * Timing of a flight or a pass, in seconds; and, for `flight`, `scale`: the travelling copy's size
 * relative to the part (default 1), so a token can ride under labels and give way to the full part
 * where it lands.
 */
export type FlightTiming = { appear?: number; move?: number; leave?: number; scale?: number };

/**
 * A part's flight, for `beats`: a copy of the target part `k`, as it will rest, appears at the first
 * point, travels through the others to the part's resting centre, and there gives way to the part
 * itself. A Group cannot `enter` from another part, so this is how a token, a ticket or a key moves.
 * If the current picture has the part too, it leaves as the copy appears. Returns the thunk `beats`
 * takes.
 */
export function flight(c: Choreography, k: string, via: readonly Vec[], { appear = 0.25, move = 1.0, leave = 0.2, scale = 1 }: FlightTiming = {}): () => Beat[] {
  return () => {
    if (!c.has(k, 'to')) throw new RangeError(`flight(): the target picture has no part keyed ${JSON.stringify(k)}`);
    if (!via.length) throw new RangeError('flight(): give at least the point it starts from');
    const part = c.to(k), end = part.center() as Vec;
    const gone = leaveOnce(c, k, appear);
    const token = part.copy();
    if (scale !== 1) token.scale(scale);
    const walk = c.travel(`${k}:flight`, token, route(via[0]!, ...via.slice(1), end), { appear, move, leave });
    return [gone ? new AnimationGroup([gone, walk.appear]) : walk.appear, walk.move, new AnimationGroup([walk.leave, c.enter(k, {}, { runTime: leave })])];
  };
}

/**
 * A token passing through, which neither picture keeps (a document carried across, a key handed
 * back): `token` appears at the first point, travels the route and fades at the last. `id` must be
 * unused by both pictures. Returns its three beats, to place in a flight thunk. To send away a part
 * the current picture has, leave it in the same beat as the token appears.
 */
export function pass(c: Choreography, id: string, token: Mobject, via: readonly Vec[], { appear = 0.25, move = 0.9, leave = 0.25 }: FlightTiming = {}): Beat[] {
  const walk = c.travel(id, token.moveTo(via[0]!), route(via[0]!, ...via.slice(1)), { appear, move, leave });
  return [walk.appear, walk.move, walk.leave];
}
