import { Group, Rectangle, Text, Code, FadeIn, FadeOut, Transform } from '../src/index.ts';
import type { Scene, Vec, Box, Mobject } from '../src/index.ts';
import type { Palette } from '../integrations/agentic-mermaid/snapshot.ts';
import { soft, raised, rule, boxCenter, emphasis, good, bad, regionBox, REGIONS, emphasisSource } from './look.ts';
import type { Region, Emphasis } from './look.ts';
import type { Seen } from './trace.ts';
import { wordsOf } from './words.ts';
import { layoutDirection } from './layout-direction.ts';
import type { LayoutDirection } from './layout-direction.ts';

/** A label and its value; with `columns`, one value per column or a single value that spans them. */
export type CardRow = readonly [label: string, value: unknown, ...more: unknown[]];
export interface CardOptions {
  /**
   * Centre of the card, or a region/box to centre it in. The box's width caps
   * the card's, and a card never rises above the box's top.
   */
  at?: Vec | Box | Region;
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
  fontSize?: number;
  /** Field arrangement only: RTL puts labels on the right and values on the left. */
  direction?: LayoutDirection;
}
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
/** A tinted bar behind a row or lines: the one shape for card marks, code focus and diff lines. */
const tint = (color: string, width: number, height: number) =>
  new Rectangle({ width, height, cornerRadius: 0.05, fill: color, fillOpacity: 0.2, stroke: 'none' });
/**
 * Move a panel's highlight bar onto `to`'s place, fading it in if it is hidden;
 * `null` fades it out. The bar stays, so a step's resting frame shows it.
 */
async function moveBar(scene: Scene, bar: Rectangle, to: Rectangle | null, runTime: number): Promise<void> {
  const shown = (bar.style.opacity ?? 1) > 0;
  if (!to) {
    if (shown) await scene.play(bar.animate.setOpacity(0), { runTime });
  } else if (shown) await scene.play(new Transform(bar, to.setStyle({ ...bar.style }), { runTime }));
  else {
    bar.subpaths = to.subpaths.map((a) => a.slice());
    bar.closed = [...to.closed];
    bar.invalidateBox();
    await scene.play(new FadeIn(bar.setOpacity(1), { runTime }));
  }
}
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
 * Labelled values on a panel. A native Group: move, fade or transform it like
 * any engine object. `set` crossfades changed values and `mark` keeps a row
 * lit, so the resting frame of a step shows what changed.
 */
export class Card extends Group {
  readonly scene: Scene;
  readonly colors: Palette;
  /** Each row's value; for a row with a value per column, its last column's. */
  readonly values = new Map<string, Text>();
  /** Each row's values, one per column (or one that spans them). */
  readonly cells = new Map<string, Text[]>();
  readonly labels = new Map<string, Text>();
  readonly columns: readonly string[];
  readonly fontSize: number;
  readonly direction: LayoutDirection;
  panel: Rectangle;
  bar: Rectangle;
  private valueEdge: number;
  private maxValue: number;
  /** Three non-collinear panel points recover its affine map even with empty text. */
  private panelAxes: { right: number; bottom: number; width: number; across: number; down: number };
  /** The row `mark` lit and its word, for the description. */
  private lit: { label: string; as: string } | null = null;
  private repeated: Set<string>;
  private readonly title: string | undefined;
  /** Rows in order (labels may repeat), for the description. */
  private rows: { label: string; cells: Text[]; labelWidth: number }[] = [];
  /** Room for each column's values; empty without columns. */
  private columnRoom: number[] = [];

  constructor(scene: Scene, colors: Palette, rows: readonly CardRow[], options: CardOptions = {}) {
    super();
    this.direction = layoutDirection(options);
    const edge = this.direction === 'ltr' ? 1 : -1;
    const labelAnchor = edge === 1 ? 'start' : 'end';
    const valueAnchor = edge === 1 ? 'end' : 'start';
    this.scene = scene;
    this.colors = colors;
    this.title = options.title;
    const size = (this.fontSize = options.fontSize ?? 0.24);
    // A label may repeat (a card can list parts by kind), but then it names no single row.
    const names = rows.map(([l]) => l);
    this.repeated = new Set(names.filter((l, i) => names.indexOf(l) !== i));
    this.columns = options.columns ?? [];
    const n = this.columns.length;
    if (options.columns && !n) throw new Error('A card with columns needs at least one column');
    for (const [label, ...vs] of rows)
      if (vs.length !== 1 && vs.length !== n)
        throw new Error(n ? `Card row ${label} has ${vs.length} values for ${n} columns: give one per column, or one to span them` : `Card row ${label} has ${vs.length} values; pass columns to show more than one`);
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
      2 * PAD;
    const width = Math.min(options.width ?? Math.max(3.2, natural), cap);
    const pitch = size * ROW;
    const height = (rows.length + (n ? 1 : 0) + (titleText ? 1.15 : 0)) * pitch + 2 * PAD - size * 0.55;
    this.panel = panelRect(colors, width, height);
    this.bar = tint(emphasis(colors), width - 0.12, pitch * 0.92).setOpacity(0);
    this.add(this.panel, this.bar);
    const left = edge * (-width / 2 + PAD);
    this.valueEdge = edge * (width / 2 - PAD);
    let y = height / 2 - PAD - size * 0.5;
    if (titleText) {
      // A title wider than a capped card shrinks to fit, as values do.
      const room = width - 2 * PAD;
      if (titleText.width() > room && room > 0) titleText.scale(room / titleText.width());
      titleText.moveTo([left, y], [-edge, 0]);
      this.add(titleText);
      y -= pitch * 1.15;
    }
    this.maxValue = width - 2 * PAD - size * 1.5;
    // Room for at least a glyph's width beside its label; less than that cannot hold a row.
    if (!(this.maxValue >= size)) throw new Error(`A card ${width.toFixed(2)} wide has no room for its rows`);
    // Labels keep their natural width and columns get the rest of the row. When that is
    // less than the columns' natural width, each column squeezes towards a glyph and its
    // gap, taking room from the labels only down to a quarter of the row; a card that
    // cannot give every column that much has no room for its rows.
    const columnLabels = Math.max(0, ...rows.map((_, i) => (n > 1 && !spans(i) ? labels[i]!.width() : 0)));
    const avail = Math.max(this.maxValue - columnLabels, Math.min(across - gap, this.maxValue * 0.75));
    const least = size + gap, extra = naturalColumns.reduce((a, w) => a + w - least, 0);
    if (n && avail < n * least - gap) throw new Error(`A card ${width.toFixed(2)} wide has no room for its rows`);
    const k = extra > 0 ? Math.min(1, (avail - (n * least - gap)) / extra) : 1;
    // Spare width goes to the columns, evenly, so later and longer values keep room.
    const spare = Math.max(0, avail + gap - across) / (n || 1);
    const columnWidth = naturalColumns.map((w) => least + (w - least) * k + spare);
    this.columnRoom = columnWidth.map((w) => w - gap);
    // Column j's values end where the columns after it begin.
    const columnEdge = columnWidth.map((_, j) => edge * (width / 2 - PAD - columnWidth.slice(j + 1).reduce((a, b) => a + b, 0)));
    const columnsAcross = columnWidth.reduce((a, b) => a + b, 0) - gap;
    const points = this.panel.subpaths[0]!;
    let right = 0, bottom = 0;
    for (let i = 2; i < points.length; i += 2) {
      if (points[i + 1] === points[1] && points[i]! > points[right]!) right = i;
      if (points[i + 1]! < points[bottom + 1]!) bottom = i;
    }
    this.panelAxes = {
      right, bottom, width: points[right]! - points[0]!,
      across: points[bottom]! - points[0]!, down: points[bottom + 1]! - points[1]!,
    };
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
    place(this, at, height, options.align);
  }

  [emphasisSource](): Emphasis { return this.lit ? [[this.bar, `row ${this.lit.label}`]] : []; }

  override rebindReferences(source: Mobject, copies: ReadonlyMap<Mobject, Mobject>): void {
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
    this.panelAxes = {...from.panelAxes};
  }

  /** The rows as a reader sees them, the lit one with its word. */
  describe(): Seen {
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
    if (this.repeated.has(label)) throw new Error(`Card row ${label} is not unique: set and mark need a label that names one row`);
    const r = this.rows.find((r) => r.label === label);
    if (!r) throw new Error(`No card row ${label}. Rows: ${[...this.values.keys()].join(', ')}`);
    return r;
  }

  /** Recover both spatial axes from the panel, independently of label advance. */
  private basis(): { ex: Vec; ey: Vec } {
    const p = this.panel.subpaths[0]!, { right, bottom, width, across, down } = this.panelAxes;
    const ex: Vec = [(p[right]! - p[0]!) / width, (p[right + 1]! - p[1]!) / width];
    const ey: Vec = [(p[bottom]! - p[0]! - across * ex[0]) / down, (p[bottom + 1]! - p[1]! - across * ex[1]) / down];
    return { ex, ey };
  }

  /**
   * Crossfade changed values in one play; unchanged values do not move. A row with
   * a value per column takes an array of them.
   */
  async set(changes: Readonly<Record<string, unknown>>, { runTime = 0.45 } = {}): Promise<void> {
    const anims = [];
    // Check every label and shape before drawing anything, so a bad call changes nothing.
    const wanted = Object.entries(changes).map(([label, value]) => {
      const row = this.row(label);
      if (row.cells.length === 1) return { row, values: [value] };
      if (!Array.isArray(value) || value.length !== row.cells.length)
        throw new Error(`Card row ${label} has ${row.cells.length} columns: set it to an array of ${row.cells.length} values`);
      return { row, values: value as unknown[] };
    });
    for (const { row, values } of wanted)
      for (const [j, value] of values.entries()) {
        const old = row.cells[j]!;
        if (old.text === String(value)) continue;
        const columned = row.cells.length > 1;
        const room = columned ? this.columnRoom[j]! : this.maxValue - row.labelWidth;
        const next = this.replacement(old, value, room, columned ? room : this.maxValue - this.labels.get(row.label)!.width());
        this.add(next);
        row.cells[j] = next;
        this.values.set(row.label, row.cells.at(-1)!);
        anims.push(
          new FadeOut(old, { shift: [0, 0.12], runTime }),
          new FadeIn(next, { shift: [0, 0.12], runTime }),
        );
      }
    if (anims.length) await this.scene.play(...anims);
  }

  /**
   * A new value drawn where `old` is. `room` is its width in card units; `roomNow`
   * the same measured on the card as it stands, for an untransformed card.
   */
  private replacement(old: Text, value: unknown, room: number, roomNow: number): Text {
    const edge = this.direction === 'ltr' ? 1 : -1;
    // Recover the card's affine basis from its nondegenerate panel.
    // A replacement therefore follows moved, scaled or rotated panels too.
    const { ex, ey } = this.basis();
    const next = this.scene.text(String(value), {
      fontSize: this.fontSize * 1.04,
      font: 'mono',
      color: this.colors.ink,
      anchor: edge === 1 ? 'end' : 'start',
    });
    const unchangedBasis = Math.abs(ex[0]! - 1) < 1e-5 && Math.abs(ex[1]!) < 1e-5 && Math.abs(ey[0]!) < 1e-5 && Math.abs(ey[1]! - 1) < 1e-5;
    // Keep the existing untransformed path (and its float32 rounding) intact.
    if (unchangedBasis) {
      next.moveTo(old.anchorPoint(), [edge, 0]);
      fitValue(next, roomNow, edge);
    } else {
      fitValue(next, room, edge);
      next.applyAffine(ex[0]!, ex[1]!, ey[0]!, ey[1]!, 0, 0, { aboutPoint: [0, 0] });
      const a = old.anchorPoint(), b = next.anchorPoint();
      next.shift([a[0] - b[0], a[1] - b[1]]);
    }
    // A faded card stays faded: the new value arrives at the old one's opacity.
    next.setOpacity(old.style.opacity);
    return next;
  }

  /**
   * Light one row (null clears). The bar stays until moved, so it shows in the step's
   * resting frame. `as` is the word the description gives it (default "marked", in the scene's language).
   */
  async mark(label: string | null, { as = wordsOf(this.scene).marked, runTime = 0.4 } = {}): Promise<void> {
    // The row's last value sits on the value edge, where the bar is measured from.
    const anchor = label == null ? null : this.row(label).cells.at(-1)!.anchorPoint();
    let target: Rectangle | null = null;
    if (label != null && anchor) {
      const { ex, ey } = this.basis();
      const centre: Vec = Math.abs(ex[1]) < 1e-5 && Math.abs(ey[0]) < 1e-5
        ? [this.panel.center()[0], anchor[1]]
        : [anchor[0] - this.valueEdge * ex[0], anchor[1] - this.valueEdge * ex[1]];
      target = this.bar.copy().moveTo(centre);
    }
    this.lit = label == null ? null : { label, as };
    await moveBar(this.scene, this.bar, target, runTime);
  }
}

export interface CodeOptions {
  /** As for cards: a centre point, or a region/box to centre in. */
  at?: Vec | Box | Region;
  align?: 'center' | 'top';
  fontSize?: number;
  title?: string;
  /** Lines beginning `+ ` or `- ` get added/removed bars (the marker is kept). */
  diff?: boolean;
}
/** A bar behind an added or removed line. */
interface LineMark {
  line: number;
  kind: 'added' | 'removed';
  mob: Group;
}

/**
 * Code on a panel in the stage's colours, with a focus bar that stays where
 * it was put. A native Group around the engine's `Code`.
 */
export class CodeBlock extends Group {
  readonly scene: Scene;
  readonly code: Code;
  readonly panel: Rectangle;
  readonly bar: Rectangle;
  readonly colors: Palette;
  /** Added/removed bars behind lines (from `diff`, or from `morph` with `markAdded`). */
  marks: LineMark[] = [];
  private focused: { lines: readonly [number, number]; as: string } | null = null;
  private fontSize: number;
  private scaled = 1;
  /** The box the block was placed in; `morph` grows only within it (the stage, if placed at a point). */
  private region: Box;
  private readonly title: string | undefined;
  /** The title's text, which `morph` moves with the panel's top-left corner. */
  private head: Text | null;

  constructor(scene: Scene, colors: Palette, lines: readonly string[], options: CodeOptions = {}) {
    super();
    this.scene = scene;
    this.colors = colors;
    const fontSize = (this.fontSize = options.fontSize ?? 0.25);
    if (!lines.length) throw new Error('A code block needs at least one line');
    this.code = new Code(lines, {fontSize, color: colors.ink, shaping: scene.textShaping});
    const at = typeof options.at === 'string' ? regionBox(options.at) : (options.at ?? [0, 0]);
    const box = at.length === 4 ? (at as Box) : null;
    this.region = box ? [...box] : regionBox('full');
    this.title = options.title;
    if (box) {
      const room = box[2] - box[0] - 0.7;
      // Room for at least a glyph's width of code beside the padding.
      if (!(room >= fontSize)) throw new Error(`A box ${(box[2] - box[0]).toFixed(2)} wide has no room for code`);
      if (this.code.width() > room) {
        this.scaled = room / this.code.width();
        this.code.scale(this.scaled);
      }
    }
    const pad = 0.3;
    const head = options.title
      ? this.scene.text(options.title, { fontSize: 0.2, color: soft(colors), anchor: 'start' })
      : null;
    const width = this.code.width() + 2 * pad + 0.1,
      height = this.code.height() + 2 * pad + (head ? 0.42 : 0);
    this.panel = panelRect(colors, width, height);
    this.code.moveTo([0, head ? -0.21 : 0]);
    // A title wider than the panel shrinks to fit it, as a card's does.
    if (head && head.width() > width - 2 * pad) head.scale((width - 2 * pad) / head.width());
    if (head) head.moveTo([-width / 2 + pad, height / 2 - 0.3], [-1, 0]);
    this.head = head;
    this.bar = tint(emphasis(colors), width - 0.14, 0.1).setOpacity(0);
    this.add(this.panel);
    if (options.diff)
      lines.forEach((line, i) => {
        if (!/^[+-] /.test(line)) return;
        const mark = this.lineMark(i, line[0] === '+' ? 'added' : 'removed');
        this.marks.push(mark);
        this.add(mark.mob);
      });
    this.add(this.bar, this.code);
    if (head) this.add(head);
    place(this, at, height, options.align);
  }

  [emphasisSource](): Emphasis {
    return [
      ...(this.focused ? [[this.bar, `lines ${this.focused.lines.join('-')}`] as const] : []),
      ...this.marks.map((m) => [m.mob, `${m.kind} ${m.line}`] as const),
    ];
  }

  override rebindReferences(source: Mobject, copies: ReadonlyMap<Mobject, Mobject>): void {
    const from = source as CodeBlock;
    Object.assign(this, {
      code: copies.get(from.code) ?? from.code,
      panel: copies.get(from.panel) ?? from.panel,
      bar: copies.get(from.bar) ?? from.bar,
    });
    this.head = from.head ? (copies.get(from.head) ?? from.head) as Text : null;
    this.marks = from.marks.map(mark => ({...mark, mob: (copies.get(mark.mob) ?? mark.mob) as Rectangle}));
    this.region = [...from.region];
  }

  /** The lines as a reader sees them, with the focused, added and removed ones named. */
  describe(): Seen {
    const w = wordsOf(this.scene);
    const kinds = new Map(this.marks.map((m) => [m.line, w[m.kind]]));
    const f = this.focused;
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

  /**
   * Put the focus bar on line i, or lines [a, b] inclusive; null hides it. `as` is the
   * word the description gives the lines (default "focused", in the scene's language).
   */
  async focus(
    lines: number | readonly [number, number] | null,
    { as = wordsOf(this.scene).focused, runTime = 0.4 } = {},
  ): Promise<void> {
    if (lines == null) {
      this.focused = null;
      return moveBar(this.scene, this.bar, null, runTime);
    }
    const [a, b] = typeof lines === 'number' ? [lines, lines] : lines;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= this.code.lines.length || a > b)
      throw new Error(`No code lines ${a}..${b}`);
    this.focused = { lines: [a, b], as };
    await moveBar(this.scene, this.bar, this.lineBar(a, b), runTime);
  }

  /**
   * Turn the code into `next`, pairing lines by their text (longest common
   * subsequence): lines that survive glide to their new rows, removed lines
   * fade out, and added lines fade in, optionally with a bar that stays.
   */
  async morph(next: readonly string[], { runTime = 0.9, markAdded = false } = {}): Promise<void> {
    if (!next.length) throw new Error('A code block needs at least one line');
    const old = this.code.lines;
    const target = new Code(next, {fontSize: this.fontSize, color: this.colors.ink, shaping: this.scene.textShaping});
    // Pair lines as Code shows them (tabs expanded), the form the old lines carry.
    const keep = matchLines(
      old.map((l) => l.text),
      target.lines.map((l) => l.text),
    );
    // The block keeps its centre and top: it grows downward and evenly sideways,
    // and only as far as its region allows (it shrinks the code to fit).
    const [panelLeft, , panelRight, top] = this.panel.box()!;
    const region = this.region;
    const regionWidth = region[2] - region[0],
      regionHeight = region[3] - region[1];
    this.scaled = Math.min(this.scaled, (regionWidth - 0.7) / Math.max(1e-9, target.width()));
    target.scale(this.scaled);
    const firstRow = old[0]!.anchorPoint()[1];
    const place = () => {
      const width = Math.max(Math.min(panelRight - panelLeft, regionWidth), target.width() + 0.7);
      let left = (panelLeft + panelRight) / 2 - width / 2;
      left = Math.min(Math.max(left, region[0]), region[2] - width);
      target.shift([left + 0.35 - target.box()![0], firstRow - target.lines[0]!.anchorPoint()[1]]);
      return [left, left + width] as const;
    };
    let [left, right] = place();
    // Taller than the region allows: shrink so the panel fits (placing by the first row moves
    // the text a little as it shrinks, so settle in a few passes).
    // A region too short for even a shrunken line bounds only the width; the stage bounds the height.
    const tallRegion = regionHeight >= 1;
    // (A 1e-4 margin: text geometry is float32, so an exact fit can land a rounding outside.)
    const fitHeight = regionHeight - 1e-4;
    for (let pass = 0; tallRegion && pass < 4 && top - (target.box()![1] - 0.3) > fitHeight; pass++) {
      const k = (fitHeight - (top - target.box()![3]) - 0.3) / target.height();
      target.scale(k * (1 - 1e-6), { aboutEdge: [-1, 1] });
      this.scaled *= k * (1 - 1e-6);
      [left, right] = place();
    }
    let bottom = target.box()![1] - 0.3;
    // Growing downward must not leave the region: lift the block by any overflow.
    const lift = Math.max(0, (tallRegion ? region : REGIONS.full)[1] - bottom);
    target.shift([0, lift]);
    bottom += lift;
    const panel = panelRect(this.colors, right - left, top + lift - bottom).moveTo([
      (left + right) / 2,
      (top + lift + bottom) / 2,
    ]);
    const anims = [new Transform(this.panel, panel, { runTime })];
    if (this.head) {
      // The title keeps its place at the panel's top-left, shrinking if the panel narrowed.
      const head = this.head.copy();
      const room = right - left - 0.6;
      if (head.width() > room) head.scale(room / head.width());
      anims.push(new Transform(this.head, head.moveTo([left + 0.3, top + lift - 0.3], [-1, 0]), { runTime }));
    }
    const lines: Text[] = [];
    next.forEach((_, j) => {
      const i = keep.get(j);
      if (i == null) {
        const line = target.lines[j]!;
        this.code.add(line);
        anims.push(new FadeIn(line, { runTime, shift: [0, -0.06] }));
        lines.push(line);
        return;
      }
      // Same text, so the same glyphs: the old line becomes its target row (at the new scale).
      const line = old[i]!;
      anims.push(new Transform(line, target.lines[j]!.copy(), { runTime }));
      lines.push(line);
    });
    const kept = new Set(keep.values());
    old.forEach((line, i) => {
      if (!kept.has(i)) anims.push(new FadeOut(line, { runTime: runTime * 0.6, shift: [-0.12, 0] }));
    });
    for (const mark of this.marks) anims.push(new FadeOut(mark.mob, { runTime: runTime * 0.6 }));
    // Hide the focus bar in place: a FadeOut would take it out of the block.
    if (this.focused) anims.push(new Transform(this.bar, this.bar.copy().setOpacity(0), { runTime: runTime * 0.6 }));
    const added: LineMark[] = [];
    if (markAdded)
      next.forEach((_, j) => {
        if (keep.has(j)) return;
        const mark = this.lineMark(j, 'added', target.lines, panel);
        added.push(mark);
        anims.push(new FadeIn(mark.mob, { runTime }));
      });
    // Bars draw behind the text: put them just after the panel.
    for (const { mob } of added) {
      mob.parent = this;
      this.children.splice(this.children.indexOf(this.panel) + 1, 0, mob);
    }
    await this.scene.play(...anims);
    for (const line of [...this.code.children]) this.code.remove(line);
    this.code.add(...lines);
    this.code.lines = lines;
    this.marks = added;
    this.focused = null;
    this.bar.setOpacity(0);
    this.invalidateBox();
  }

  /** Fade out the added/removed bars. */
  async clearMarks({ runTime = 0.4 } = {}): Promise<void> {
    const marks = this.marks;
    this.marks = [];
    if (marks.length) await this.scene.play(...marks.map((m) => new FadeOut(m.mob, { runTime })));
  }
}

/** Pairs of (new index → old index) for the longest common subsequence of equal lines. */
function matchLines(before: readonly string[], after: readonly string[]): Map<number, number> {
  const n = before.length,
    m = after.length;
  const table = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i]![j] = before[i] === after[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const pairs = new Map<number, number>();
  for (let i = 0, j = 0; i < n && j < m; )
    if (before[i] === after[j]) pairs.set(j++, i++);
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  return pairs;
}
