import { Group, Rectangle, Text, Code } from '../src/index.ts';
import type { Scene, Vec, Box, Mobject } from '../src/index.ts';
import type { Palette } from '../src/color.ts';
import { soft, raised, rule, boxCenter, emphasis, good, bad, regionBox, emphasisSource, seenSource } from './look.ts';
import type { Region, Emphasis } from './look.ts';
import type { Description } from './trace.ts';
import { wordsOf } from './words.ts';
import { layoutDirection } from './layout-direction.ts';
import type { LayoutDirection } from './layout-direction.ts';

/** A label and its value; with `columns`, one value per column or a single value that spans them. */
export type CardRow = readonly [label: string, value: unknown, ...more: unknown[]];
export interface CardOptions {
  /**
   * Centre of the card, or a region/box to centre it in. The box's width caps
   * the card's, and a card never rises above the box's top. The regions `'start'` and `'end'`
   * follow the stage's direction.
   */
  at?: Vec | Box | Region | 'start' | 'end';
  /** In a box: 'top' sets the card's top on the box's top, so cards side by side align. */
  align?: 'center' | 'top';
  /** Fixed width; by default the card fits its widest row. */
  width?: number;
  title?: string;
  /**
   * Headings for side-by-side value columns. Each row then gives one value per
   * column, or one value that spans them all.
   */
  columns?: readonly string[];
  size?: number;
  /**
   * Field arrangement only: RTL puts labels on the right and values on the left. By default the
   * stage's direction.
   */
  direction?: LayoutDirection;
  /**
   * The row lit by a bar across the panel, and `as`, the word its description gives it (default
   * "marked", in the scene's language), such as `'rejected'`: part of the picture, described and
   * emphasised. A card that changes is drawn by a view from state, lit row included.
   */
  lit?: { row: string; as?: string } | null;
  /**
   * Key the card and its parts under this name, for a card drawn in a view: `view.sync()` then changes it
   * in place. Each value's key includes its text, so an
   * unchanged value stays put, a changed one fades out as its replacement fades in, and the bar
   * moves to the lit row.
   */
  key?: string;
  /**
   * `false`: no panel behind the rows and no padding, for values written inside a drawing (a ring
   * buffer's head and tail inside its ring). The card keeps its rows, keys and lit bar, and
   * describes itself as a card does.
   */
  panel?: boolean;
}
/** A panel's options with its place resolved: a point, a box or a physical region. */
type PlacedOptions<T extends { at?: unknown }> = Omit<T, 'at'> & { at?: Vec | Box | Region; api?: string };
const ROW = 1.9; // row pitch, in font sizes
/** Shrink a value towards its anchored edge, never mirroring it. */
function fitValue(value: Text, room: number, edge: -1 | 1 = 1): void {
  const w = value.width();
  if (w > room && w > 0) value.scale(Math.max(room, 0) / w, { aboutEdge: [edge, 0] });
}
/**
 * Fit a row's label and value into `room`. The label never takes more than
 * 90% of it, so every value (now or after `set`) keeps a positive room.
 */
function fitRow(label: Text, value: Text, room: number, edge: -1 | 1): void {
  const labelRoom = Math.min(room * 0.9, Math.max(room - value.width(), room * 0.6));
  if (label.width() > labelRoom) label.scale(labelRoom / label.width(), { aboutEdge: [-edge, 0] });
  fitValue(value, room - label.width(), edge);
}
const PAD = 0.28;
/** Space between columns, in font sizes. */
const COLUMN_GAP = 1.2;
/** The raised, ruled panel cards and code sit on. */
const panelRect = (colors: Palette, width: number, height: number) =>
  new Rectangle({ width, height, cornerRadius: 0.1, fill: raised(colors), stroke: rule(colors), strokeWidth: 0.016 });
/** A tinted bar behind a row or lines: the one shape for lit rows, lit lines and diff lines. */
const tint = (color: string, width: number, height: number) =>
  new Rectangle({ width, height, cornerRadius: 0.05, fill: color, fillOpacity: 0.2, stroke: 'none' });
/**
 * Put a panel `height` tall at a point, or centred in a box (`align: 'top'` sets
 * it on the box's top, so panels side by side align), never above the box's top.
 */
function place(panel: Group, at: Vec | Box, height: number, align: 'center' | 'top' = 'center'): void {
  if (at.length !== 4) {
    panel.moveTo(at as Vec);
    return;
  }
  const b = at as Box,
    [x, y] = boxCenter(b);
  panel.moveTo([x, align === 'top' ? b[3] - height / 2 : Math.min(b[3] - height / 2, y)]);
}

/**
 * Labelled values on a panel, built by the kit's `card(s, rows, opts)` and entered by `s.card`. A
 * native Group: move, fade or transform it like any engine object. Its `lit` row stays lit, so
 * the resting frame of a step shows what changed.
 */
export class Card extends Group {
  private readonly scene: Scene;
  /** The call an error names: the kit's `card()` or the stage's `s.card()`. */
  private readonly api: string;
  /** Each row's value; for a row with a value per column, its last column's. */
  readonly values = new Map<string, Text>();
  /** Each row's values, one per column (or one that spans them). */
  readonly cells = new Map<string, Text[]>();
  readonly labels = new Map<string, Text>();
  readonly columns: readonly string[];
  readonly size: number;
  readonly direction: LayoutDirection;
  readonly panel: Rectangle;
  readonly bar: Rectangle;
  private valueEdge: number;
  private maxValue: number;
  /** The row `mark` lit and its word, for the description. */
  private lit: { label: string; as: string } | null = null;
  private repeated: Set<string>;
  private readonly title: string | undefined;
  /** Rows in order (labels may repeat), for the description. */
  private rows: { label: string; cells: Text[]; labelWidth: number }[] = [];
  /** Room for each column's values; empty without columns. */
  private columnRoom: number[] = [];

  /** @internal The kit's `card(s, rows, opts)` builds a card on a stage. */
  constructor(scene: Scene, colors: Palette, rows: readonly CardRow[], options: PlacedOptions<CardOptions> = {}) {
    super();
    const api = (this.api = options.api ?? 'card()');
    this.direction = layoutDirection(options, 'ltr', api);
    const edge = this.direction === 'ltr' ? 1 : -1;
    const labelAnchor = edge === 1 ? 'start' : 'end';
    const valueAnchor = edge === 1 ? 'end' : 'start';
    this.scene = scene;
    this.title = options.title;
    const size = (this.size = options.size ?? 0.24);
    // Without a panel there is nothing to pad: the rows sit at the card's edges.
    const pad = options.panel === false ? 0.04 : PAD;
    // A label may repeat (a card can list parts by kind), but then it names no single row.
    const names = rows.map(([l]) => l);
    this.repeated = new Set(names.filter((l, i) => names.indexOf(l) !== i));
    this.columns = options.columns ?? [];
    const n = this.columns.length;
    if (options.columns && !n) throw new Error(`${api}: a card with columns needs at least one column`);
    for (const [label, ...vs] of rows)
      if (vs.length !== 1 && vs.length !== n)
        throw new TypeError(n ? `${api}: the row ${JSON.stringify(label)} has ${vs.length} values for ${n} columns; give one per column, or one to span them` : `${api}: the row ${JSON.stringify(label)} has ${vs.length} values; pass columns to show more than one`);
    const valueText = (v: unknown) => this.scene.text(String(v), { fontSize: size * 1.04, font: 'mono', color: colors.ink, anchor: valueAnchor });
    const labels = rows.map(([l]) => this.scene.text(l, { fontSize: size, color: soft(colors), anchor: labelAnchor }));
    const cells = rows.map(([, ...vs]) => vs.map(valueText));
    const spans = (i: number) => cells[i]!.length === 1 && n !== 1;
    const headings = this.columns.map((c) => this.scene.text(c, { fontSize: size, color: colors.accent, weight: 'bold', anchor: valueAnchor }));
    const titleText = options.title
      ? this.scene.text(options.title, { fontSize: size * 1.05, color: colors.accent, weight: 'bold', anchor: labelAnchor })
      : null;
    const gap = size * COLUMN_GAP;
    // A column is as wide as its heading or its widest value (at least a glyph), plus the gap before it.
    const naturalColumns = this.columns.map((_, j) =>
      Math.max(size, headings[j]!.width(), ...cells.filter((_, i) => !spans(i)).map((c) => c[j]!.width())) + gap);
    const across = naturalColumns.reduce((a, b) => a + b, 0);
    const at = typeof options.at === 'string' ? regionBox(options.at) : (options.at ?? [0, 0]);
    const cap = at.length === 4 ? at[2] - at[0] : Infinity;
    const natural =
      Math.max(
        titleText ? titleText.width() : 0,
        // Headings need a row of their own, even with one column or only spanning values.
        n ? across - gap + size * 2.5 : 0,
        ...rows.map((_, i) => labels[i]!.width() + size * 2.5 + (n > 1 && !spans(i) ? across - gap : cells[i]![0]!.width())),
      ) +
      2 * pad;
    const width = Math.min(options.width ?? Math.max(3.2, natural), cap);
    const pitch = size * ROW;
    const height = (rows.length + (n ? 1 : 0) + (titleText ? 1.15 : 0)) * pitch + 2 * pad - size * 0.55;
    this.panel = options.panel === false
      ? new Rectangle({ width, height, cornerRadius: 0.1, fill: raised(colors), fillOpacity: 0, stroke: 'none' })
      : panelRect(colors, width, height);
    this.bar = tint(emphasis(colors), width - 0.12, pitch * 0.92).setOpacity(0);
    this.add(this.panel, this.bar);
    const left = edge * (-width / 2 + pad);
    this.valueEdge = edge * (width / 2 - pad);
    let y = height / 2 - pad - size * 0.5;
    if (titleText) {
      // A title wider than a capped card shrinks to fit, as values do.
      const room = width - 2 * pad;
      if (titleText.width() > room && room > 0) titleText.scale(room / titleText.width());
      titleText.moveTo([left, y], [-edge, 0]);
      this.add(titleText);
      y -= pitch * 1.15;
    }
    this.maxValue = width - 2 * pad - size * 1.5;
    // Room for at least a glyph's width beside its label; less than that cannot hold a row.
    if (!(this.maxValue >= size)) throw new RangeError(`${api}: a card ${width.toFixed(2)} wide has no room for its rows; make it wider, or its text smaller`);
    // Labels keep their natural width and columns get the rest of the row. When that is
    // less than the columns' natural width, each column squeezes towards a glyph and its
    // gap, taking room from the labels only down to a quarter of the row; a card that
    // cannot give every column that much has no room for its rows.
    const columnLabels = Math.max(0, ...rows.map((_, i) => (n > 1 && !spans(i) ? labels[i]!.width() : 0)));
    const avail = Math.max(this.maxValue - columnLabels, Math.min(across - gap, this.maxValue * 0.75));
    const least = size + gap, extra = naturalColumns.reduce((a, w) => a + w - least, 0);
    if (n && avail < n * least - gap) throw new RangeError(`${api}: a card ${width.toFixed(2)} wide has no room for its rows; make it wider, or its text smaller`);
    const k = extra > 0 ? Math.min(1, (avail - (n * least - gap)) / extra) : 1;
    // Spare width goes to the columns, evenly, so later and longer values keep room.
    const spare = Math.max(0, avail + gap - across) / (n || 1);
    const columnWidth = naturalColumns.map((w) => least + (w - least) * k + spare);
    this.columnRoom = columnWidth.map((w) => w - gap);
    // Column j's values end where the columns after it begin.
    const columnEdge = columnWidth.map((_, j) => edge * (width / 2 - pad - columnWidth.slice(j + 1).reduce((a, b) => a + b, 0)));
    const columnsAcross = columnWidth.reduce((a, b) => a + b, 0) - gap;
    let headed = !n;
    rows.forEach(([label], i) => {
      // The headings sit just above the first row with a value per column.
      if (!headed && !spans(i)) {
        headings.forEach((h, j) => {
          h.moveTo([columnEdge[j]!, y], [edge, 0]);
          fitValue(h, this.columnRoom[j]!, edge);
          this.add(h);
        });
        headed = true;
        y -= pitch;
      }
      const l = labels[i]!.moveTo([left, y], [-edge, 0]);
      const row = cells[i]!;
      if (row.length === 1 && (n <= 1 || spans(i))) {
        row[0]!.moveTo([this.valueEdge, y], [edge, 0]);
        fitRow(l, row[0]!, this.maxValue, edge);
      } else {
        const labelRoom = this.maxValue - columnsAcross;
        if (l.width() > labelRoom) l.scale(Math.max(labelRoom, 0) / l.width(), { aboutEdge: [-edge, 0] });
        row.forEach((c, j) => {
          c.moveTo([columnEdge[j]!, y], [edge, 0]);
          fitValue(c, this.columnRoom[j]!, edge);
        });
      }
      this.labels.set(label, l);
      this.values.set(label, row.at(-1)!);
      this.cells.set(label, row);
      this.rows.push({ label, cells: row, labelWidth: l.width() });
      this.add(l, ...row);
      y -= pitch;
    });
    if (!headed) {
      // Every row spans: the headings still name the columns, under the rows.
      headings.forEach((h, j) => {
        h.moveTo([columnEdge[j]!, y], [edge, 0]);
        fitValue(h, this.columnRoom[j]!, edge);
        this.add(h);
      });
    }
    if (options.key) {
      const k = options.key;
      this.key = k;
      this.panel.key = `${k}:panel`;
      this.bar.key = `${k}:bar`;
      if (titleText) titleText.key = `${k}:title`;
      headings.forEach((h, j) => (h.key = `${k}:column:${j}`));
      // By row: a repeated label names no single row, so the label map holds only its last.
      this.rows.forEach((row, i) => {
        labels[i]!.key = `${k}:row:${i}`;
        row.cells.forEach((c, j) => (c.key = `${k}:row:${i}:${j}:${c.text}`));
      });
    }
    place(this, at, height, options.align);
    if (options.lit != null) {
      // The bar runs across the panel, on the row's last value.
      this.bar.moveTo([this.panel.center()[0], this.row(options.lit.row).cells.at(-1)!.anchorPoint()[1]]).setOpacity(1);
      this.lit = { label: options.lit.row, as: options.lit.as ?? wordsOf(scene).marked };
    }
  }

  // What the lit row shows, its values included: the same row lit with new values is new emphasis.
  [emphasisSource](): Emphasis {
    return this.lit ? [[this.bar, `row ${this.lit.label}: ${this.row(this.lit.label).cells.map((c) => c.text).join(', ')}`]] : [];
  }
  [seenSource](): Description { return this.describe(); }

  protected override rebindReferences(source: Mobject, copies: ReadonlyMap<Mobject, Mobject>): void {
    const from = source as Card;
    const text = (m: Text) => (copies.get(m) ?? m) as Text;
    const cells = new Map(from.rows.map(row => [row.cells, row.cells.map(text)]));
    Object.assign(this, {
      panel: copies.get(from.panel) ?? from.panel,
      bar: copies.get(from.bar) ?? from.bar,
      values: new Map([...from.values].map(([key, value]) => [key, text(value)])),
      labels: new Map([...from.labels].map(([key, value]) => [key, text(value)])),
      cells: new Map([...from.cells].map(([key, row]) => [key, cells.get(row) ?? row.map(text)])),
    });
    this.rows = from.rows.map(row => ({...row, cells: cells.get(row.cells)!}));
    this.columnRoom = [...from.columnRoom];
  }

  /** The rows as a reader sees them, the lit one with its word. */
  describe(): Description {
    const w = wordsOf(this.scene);
    // A value in a column is named by its row and its column: "Hits (LRU): 0".
    const parts = this.rows.flatMap((r) =>
      r.cells.map((c, j) => ({
        name: w.pair(r.cells.length > 1 ? `${r.label} (${this.columns[j]})` : r.label, c.text),
        ...(r.label === this.lit?.label ? { mark: this.lit.as } : {}),
      })),
    );
    const n = w.count(parts.length, w.labelledValue);
    return { what: this.title ? `${w.quote(this.title)}, ${n}` : n, parts };
  }

  private row(label: string): { label: string; cells: Text[]; labelWidth: number } {
    if (this.repeated.has(label)) throw new Error(`${this.api}: lit names the row ${JSON.stringify(label)}, which is not unique; lit needs a label that names one row`);
    const r = this.rows.find((r) => r.label === label);
    if (!r) throw new RangeError(`${this.api}: lit names no row of the card, ${JSON.stringify(label)}; its rows are ${[...this.values.keys()].join(', ')}`);
    return r;
  }


}

export interface CodeBlockOptions {
  /** As for cards: a centre point, or a region/box to centre in (`'start'` and `'end'` follow the stage's direction). */
  at?: Vec | Box | Region | 'start' | 'end';
  align?: 'center' | 'top';
  size?: number;
  title?: string;
  /** Lines beginning `+ ` or `- ` get added/removed bars (the marker is kept). */
  diff?: boolean;
  /** Lines (by index) that get an added bar without a `+ ` in their text: what an edit drawn from state introduced. */
  added?: readonly number[];
  /** A fixed panel width, so a panel drawn from state keeps its width as its lines change. */
  width?: number;
  /** In a box: shrink the code so the panel fits the box's height too. */
  fitHeight?: boolean;
  /**
   * The lit bar on line i, or on lines [a, b] inclusive, and `as`, the word the description gives
   * them (default "focused", in the scene's language): part of the picture, described and
   * emphasised. A panel whose lit lines move is drawn by a view from state.
   */
  lit?: { lines: number | readonly [number, number]; as?: string } | null;
  /**
   * Key the panel and its parts under this name, for a panel drawn in a view: `view.sync()` then moves the
   * lit bar, keeps each line that stays (paired by its
   * text, wherever it moves), fades a changed line out as its replacement fades in, and brings in
   * the `added` bars. A line already keyed keeps its key.
   */
  key?: string;
}
/** A bar behind an added or removed line. */
interface LineMark {
  line: number;
  kind: 'added' | 'removed';
  mob: Group;
}

/**
 * Code on a panel in the stage's colours, with a lit bar that stays where it was put, built by
 * the kit's `code(s, source, opts)` and entered by `s.code`. A native Group around the engine's
 * `Code`, which draws plain highlighted code text with no panel.
 */
export class CodeBlock extends Group {
  private readonly scene: Scene;
  /** The call an error names: the kit's `code()` or the stage's `s.code()`. */
  private readonly api: string;
  readonly code: Code;
  readonly panel: Rectangle;
  readonly bar: Rectangle;
  private readonly colors: Palette;
  /** Added/removed bars behind lines (from `diff`, or `added`). */
  readonly marks: readonly LineMark[];
  private lit: { lines: readonly [number, number]; as: string } | null = null;
  private fontSize: number;
  private scaled = 1;
  private readonly title: string | undefined;

  /** @internal The kit's `code(s, source, opts)` builds a code panel on a stage. */
  constructor(scene: Scene, colors: Palette, lines: readonly string[], options: PlacedOptions<CodeBlockOptions> = {}) {
    super();
    const api = (this.api = options.api ?? 'code()');
    this.scene = scene;
    this.colors = colors;
    const fontSize = (this.fontSize = options.size ?? 0.25);
    if (!lines.length) throw new Error(`${api}: a code panel needs at least one line`);
    this.code = new Code(lines, {fontSize, color: colors.ink, shaping: scene.textShaping});
    const at = typeof options.at === 'string' ? regionBox(options.at) : (options.at ?? [0, 0]);
    const box = at.length === 4 ? (at as Box) : null;
    this.title = options.title;
    const pad = 0.3;
    const head = options.title
      ? this.scene.text(options.title, { fontSize: 0.2, color: soft(colors), anchor: 'start' })
      : null;
    if (box) {
      const room = (options.width ?? box[2] - box[0]) - 0.7;
      // Room for at least a glyph's width of code beside the padding.
      if (!(room >= fontSize)) throw new RangeError(`${api}: a box ${(box[2] - box[0]).toFixed(2)} wide has no room for code; give a wider box`);
      if (this.code.width() > room) {
        this.scaled = room / this.code.width();
        this.code.scale(this.scaled);
      }
      // Taller than the box: shrink so the panel fits it.
      const tall = box[3] - box[1] - 2 * pad - (head ? 0.42 : 0) - 1e-4;
      if (options.fitHeight && tall > 0 && this.code.height() > tall) {
        const k = tall / this.code.height();
        this.code.scale(k);
        this.scaled *= k;
      }
    }
    const width = Math.max(options.width ?? 0, this.code.width() + 2 * pad + 0.1),
      height = this.code.height() + 2 * pad + (head ? 0.42 : 0);
    this.panel = panelRect(colors, width, height);
    this.code.moveTo([0, head ? -0.21 : 0]);
    // Code reads from the left: in a panel wider than it needs (a fixed `width`), the code keeps
    // its left padding rather than floating to the middle.
    this.code.shift([-width / 2 + pad + 0.05 - this.code.box()![0], 0]);
    // A title wider than the panel shrinks to fit it, as a card's does.
    if (head && head.width() > width - 2 * pad) head.scale((width - 2 * pad) / head.width());
    if (head) head.moveTo([-width / 2 + pad, height / 2 - 0.3], [-1, 0]);
    this.bar = tint(emphasis(colors), width - 0.14, 0.1).setOpacity(0);
    this.add(this.panel);
    const marks: LineMark[] = [];
    this.marks = marks;
    if (options.diff)
      lines.forEach((line, i) => {
        if (!/^[+-] /.test(line)) return;
        const mark = this.lineMark(i, line[0] === '+' ? 'added' : 'removed');
        marks.push(mark);
        this.add(mark.mob);
      });
    for (const i of options.added ?? []) {
      if (!Number.isInteger(i) || i < 0 || i >= lines.length) throw new RangeError(`${api}: added names line ${i}, which is not a line of this panel`);
      if (this.marks.some((m) => m.line === i)) continue;
      const mark = this.lineMark(i, 'added');
      marks.push(mark);
      this.add(mark.mob);
    }
    this.add(this.bar, this.code);
    if (head) this.add(head);
    place(this, at, height, options.align);
    if (options.lit != null) {
      const [a, b] = this.lines(options.lit.lines);
      const to = this.lineBar(a, b);
      this.bar.subpaths = to.subpaths.map((p) => p.slice());
      this.bar.closed = [...to.closed];
      this.bar.invalidateBox();
      this.bar.setOpacity(1);
      this.lit = { lines: [a, b], as: options.lit.as ?? wordsOf(scene).focused };
    }
    if (options.key) {
      const k = options.key;
      this.key = k;
      this.panel.key = `${k}:panel`;
      this.bar.key = `${k}:bar`;
      this.code.key ??= `${k}:code`;
      // A line is keyed by its text and which occurrence of that text it is, so a line that moves
      // (one inserted above it) pairs with itself, and its added or removed bar moves with it.
      const seen = new Map<string, number>();
      const lineKeys = this.code.lines.map((line) => {
        const n = (seen.get(line.text) ?? 0) + 1;
        seen.set(line.text, n);
        return `${line.text}#${n}`;
      });
      this.code.lines.forEach((line, i) => (line.key ??= `${k}:line:${lineKeys[i]}`));
      this.marks.forEach((m) => (m.mob.key ??= `${k}:mark:${lineKeys[m.line]}:${m.kind}`));
    }
  }

  [seenSource](): Description { return this.describe(); }

  /** Lines i, or [a, b] inclusive, checked against the code. */
  private lines(lines: number | readonly [number, number]): [number, number] {
    const [a, b] = typeof lines === 'number' ? [lines, lines] : lines;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= this.code.lines.length || a > b)
      throw new RangeError(`${this.api}: lit names lines ${a}..${b}, which are not lines of this panel; its lines are 0..${this.code.lines.length - 1}`);
    return [a, b];
  }

  [emphasisSource](): Emphasis {
    return [
      // The lit lines with their text: a bar that stays while its lines change is new emphasis.
      ...(this.lit ? [[this.bar, `lines ${this.lit.lines.join('-')}: ${this.code.lines.slice(this.lit.lines[0], this.lit.lines[1] + 1).map((l) => l.text).join(' / ')}`] as const] : []),
      ...this.marks.map((m) => [m.mob, `${m.kind} ${m.line}`] as const),
    ];
  }

  protected override rebindReferences(source: Mobject, copies: ReadonlyMap<Mobject, Mobject>): void {
    const from = source as CodeBlock;
    Object.assign(this, {
      code: copies.get(from.code) ?? from.code,
      panel: copies.get(from.panel) ?? from.panel,
      bar: copies.get(from.bar) ?? from.bar,
      marks: from.marks.map(mark => ({...mark, mob: (copies.get(mark.mob) ?? mark.mob) as Rectangle})),
    });
  }

  /** The lines as a reader sees them, with the lit, added and removed ones named. */
  describe(): Description {
    const w = wordsOf(this.scene);
    const kinds = new Map(this.marks.map((m) => [m.line, w[m.kind]]));
    const f = this.lit;
    const n = this.code.lines.length;
    return {
      what: `${w.code}${this.title ? ` ${w.quote(this.title)}` : ''}, ${w.count(n, w.line)}`,
      parts: this.code.lines.map((l, i) => {
        const words = [...new Set([...(f && i >= f.lines[0] && i <= f.lines[1] ? [f.as] : []), ...(kinds.has(i) ? [kinds.get(i)!] : [])])];
        return { name: w.pair(String(i + 1), l.text), ...(words.length ? { mark: words.join(', ') } : {}) };
      }),
    };
  }

  /** Line pitch as laid out (the block may have been scaled to fit its box). */
  private get pitch(): number {
    return this.fontSize * 1.5 * this.scaled;
  }

  private lineBar(
    a: number,
    b: number,
    lines: readonly Text[] = this.code.lines,
    panel: Rectangle = this.panel,
  ): Rectangle {
    const pitch = this.pitch;
    const y0 = lines[a]!.anchorPoint()[1] + pitch / 2,
      y1 = lines[b]!.anchorPoint()[1] - pitch / 2;
    return tint(emphasis(this.colors), panel.width() - 0.14, Math.abs(y0 - y1)).moveTo([panel.center()[0], (y0 + y1) / 2]);
  }

  /**
   * A tinted bar behind line i, with a solid edge in the gutter: the edge marks
   * the line by shape as well as by colour.
   */
  private lineMark(i: number, kind: LineMark['kind'], lines?: readonly Text[], panel?: Rectangle): LineMark {
    const color = kind === 'added' ? good(this.colors) : bad(this.colors);
    const back = this.lineBar(i, i, lines, panel).setStyle({ fill: color });
    const [x0, y0, , y1] = back.box()!;
    const edge = new Rectangle({ width: 0.06, height: y1 - y0, fill: color, stroke: 'none' }).moveTo([x0 + 0.03, (y0 + y1) / 2]);
    return { line: i, kind, mob: new Group(back, edge) };
  }
}
