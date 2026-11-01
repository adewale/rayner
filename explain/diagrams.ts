import type {TextShaping} from '../src/text-context.ts';
import {
  Group,
  VMobject,
  FadeIn,
  FadeOut,
  Create,
  Transform,
  Dot,
  MoveAlongPath,
  AnimationGroup,
  linear,
  Rectangle,
  Text,
} from '../src/index.ts';
import type { Scene, Mobject, Box, Vec, Style, PathFunc } from '../src/index.ts';
import { regionBox, boxCenter, raised, emphasis, dimOpacity, emphasises } from './look.ts';
import type { Region } from './look.ts';
import { diagramsOf, findingsOf, SVG_PX_PER_UNIT } from '../integrations/agentic-mermaid/snapshot.ts';
import { outlineText } from '../integrations/agentic-mermaid/text.ts';
import { recordWalk } from './trace.ts';
import { wordsOf, wordsFor, familyNames } from './words.ts';
import type { Words } from './words.ts';
import type { Seen, SeenPart } from './trace.ts';
import { lerpColor, parseColor } from '../src/color.ts';
import type {
  DiagramSpec,
  DiagramSnapshot,
  SnapshotPart,
  SnapshotShape,
  MutationOp,
} from '../integrations/agentic-mermaid/snapshot.ts';

export interface ShowOptions {
  /** Where the diagram fits: a stage region name or [minX, minY, maxX, maxY]. */
  box?: Box | Region;
  build?: 'all' | 'frame';
  runTime?: number;
}
interface Part {
  info: SnapshotPart;
  mob: Group;
  route?: VMobject;
}
export type NoteSide = 'above' | 'below' | 'left' | 'right';
interface Note {
  id: string;
  side: NoteSide;
  text: string;
  mob: Group;
}
const connectorPart = Symbol('diagram connector part');
/** Whether a drawn path belongs to a diagram connector (not a glyph or node). */
export function isDiagramConnector(m: Mobject): boolean {
  for (let a: Mobject | null = m; a; a = a.parent)
    if ((a as Mobject & { [connectorPart]?: boolean })[connectorPart]) return true;
  return false;
}
/** Route tokens: the dot that travels a link, and how fast it appears and goes. */
const TOKEN = { radius: 0.08, fade: 0.18 };
/**
 * Parts that frame a family (axes, lifelines, lanes, branches, an architecture group around its
 * services, a junction that only routes edges) rather than say something.
 */
const isScaffold = (info: SnapshotPart) =>
  info.id === '__frame' ||
  /axis|lifeline|lane|grid|participant|actor|section|rail|plate|chrome|group|junction/.test(info.role) ||
  info.id.startsWith('branch:') ||
  info.id.startsWith('quadrant-label:');
/**
 * Parts capture draws on their own that belong to another, by family: the pattern a part's id
 * matches and its owner's id prefix. An ER relationship `rel:<rel>` owns its cardinality markers
 * (`card:<rel>:1` at its first entity, `card:<rel>:2` at its second) and its label's background
 * (`rel-label:<rel>:bg`); a radar curve `curve:<curve>` owns its vertex dots (`dot:<curve>:<i>`).
 */
const OWNED: Readonly<Record<string, readonly [RegExp, string]>> = {
  er: [/^(?:card:(.+):[12]|rel-label:(.+):bg)$/, 'rel:'],
  radar: [/^dot:(.+):\d+$/, 'curve:'],
};
/**
 * The snapshot's parts with those owners set: an owned part reveals, dims, marks and moves with
 * its owner, and draws under it (an ER label's background under the label, not over it).
 */
function partsOf(snapshot: DiagramSnapshot): readonly SnapshotPart[] {
  const rule = Object.hasOwn(OWNED, snapshot.family) ? OWNED[snapshot.family] : undefined;
  if (!rule) return snapshot.parts;
  const ids = new Set(snapshot.parts.map((p) => p.id));
  return snapshot.parts.map((p) => {
    const m = rule[0].exec(p.id),
      owner = m && rule[1] + (m[1] ?? m[2]);
    return owner && !p.owner && ids.has(owner) ? { ...p, owner } : p;
  });
}
/** Up to three names joined with commas, then how many more: "Jan, Feb, Mar and 2 more". */
function few(w: Words, names: readonly string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} ${w.more(names.length - 3)}` : names.join(', ');
}
/**
 * A series by its lowest and highest values and where they fall ("Line: lowest 0 (Jan, Dec),
 * highest 24 (Jun, Jul)"), or by its one value; `at[i]` names where `values[i]` falls.
 */
function extremes(w: Words, name: string, values: readonly number[], at: readonly string[]): string {
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  if (lo === hi) return w.flat(name, w.number(lo));
  const where = (v: number) => few(w, at.filter((_, i) => values[i] === v));
  return w.extremes(name, w.number(lo), where(lo), w.number(hi), where(hi));
}
/**
 * A radar-beta source's axes and curves as written: `axis id["Label"], …` lines, `curve id["Label"]{1, 2}`
 * (or keyed, `{id: 1, …}`) lines, and `min`/`max` (Mermaid's defaults: 0, and the largest value).
 * Capture keeps no chart data for a radar, so its words come from the source.
 */
export function radarData(source: string): {
  axes: { id: string; label: string }[];
  curves: { id: string; label: string; values: number[] }[];
  min: number;
  max: number;
} {
  const axes: { id: string; label: string }[] = [];
  const curves: { id: string; label: string; values: number[] }[] = [];
  let min = 0,
    max: number | undefined;
  for (const line of source.split('\n')) {
    const [, word, rest = ''] = /^\s*(axis|curve|min|max)\b\s*(.*)$/.exec(line) ?? [];
    if (word === 'axis') for (const m of rest.matchAll(/([^\s,[{]+)\s*(?:\["([^"]*)"\])?/g)) axes.push({ id: m[1]!, label: m[2] ?? m[1]! });
    else if (word === 'curve')
      for (const m of rest.matchAll(/([^\s,[{]+)\s*(?:\["([^"]*)"\])?\s*\{([^}]*)\}/g)) {
        const entries = m[3]!.split(',').map((e) => e.trim()).filter(Boolean);
        const keyed = new Map(entries.filter((e) => e.includes(':')).map((e) => [e.split(':')[0]!.trim(), Number(e.split(':')[1])]));
        const values = keyed.size ? axes.map((a) => keyed.get(a.id) ?? NaN) : entries.map(Number);
        curves.push({ id: m[1]!, label: m[2] ?? m[1]!, values });
      }
    else if (word === 'min') min = Number(rest);
    else if (word === 'max') max = Number(rest);
  }
  return { axes, curves, min, max: max ?? Math.max(...curves.flatMap((c) => c.values).filter(Number.isFinite)) };
}
/** An ER source's attributes by entity, as declared: `type name [PK, FK] ["comment"]` lines in `NAME { … }`. */
function erAttributes(source: string): Map<string, { type: string; name: string; keys: string[] }[]> {
  const out = new Map<string, { type: string; name: string; keys: string[] }[]>();
  let entity: string | null = null;
  for (const line of source.split('\n')) {
    const open = /^\s*([A-Za-z_][\w-]*)\s*(?:\[[^\]]*\])?\s*\{\s*$/.exec(line);
    if (open) out.set((entity = open[1]!), []);
    else if (/^\s*\}\s*$/.test(line)) entity = null;
    else if (entity) {
      const a = /^\s*(\S+)\s+(\S+)((?:\s*,?\s*\b(?:PK|FK|UK)\b)*)/.exec(line);
      if (a) out.get(entity)!.push({ type: a[1]!, name: a[2]!, keys: a[3]!.match(/PK|FK|UK/g) ?? [] });
    }
  }
  return out;
}
/** How a family names its own kinds of part; undefined leaves a part to the general rules. */
type Namer = (n: { w: Words; snapshot: DiagramSnapshot; info: SnapshotPart; words: string; end: (id: string) => string }) => string | undefined;
/**
 * ER words, as the source declares them: an entity with its attributes ("TRIP: trip_id (id, PK), …"),
 * a relationship with its label and what each marker says ("TRIP → STOP_TIME: trip_id (each TRIP has
 * one or more STOP_TIME, each STOP_TIME has exactly one TRIP)"). Undefined for any other part.
 */
const erName: Namer = ({ w, snapshot, info, words, end }) => {
  if (info.id.startsWith('entity:')) {
    const attrs = erAttributes(snapshot.spec.source).get(info.id.slice('entity:'.length));
    return attrs?.length ? w.pair(end(info.id), attrs.map((a) => `${a.name} (${[a.type, ...a.keys].join(', ')})`).join(', ')) : undefined;
  }
  if (!info.id.startsWith('rel:') || !info.from || !info.to) return undefined;
  // What a crow's-foot marker says, by the category capture gives it (Mermaid's `||`, `|o`, `}o`, `}|`).
  const marker = (at: 1 | 2) => {
    const category = (snapshot.parts.find((p) => p.id === `card:${info.id.slice(4)}:${at}`)?.channels as { category?: unknown } | undefined)?.category;
    return typeof category === 'string' && Object.hasOwn(w.cardinality, category) ? w.cardinality[category] : undefined;
  };
  const [from, to] = [end(info.from), end(info.to)];
  const [atFrom, atTo] = [marker(1), marker(2)];
  const says = [atTo && w.eachHas(from, atTo, to), atFrom && w.eachHas(to, atFrom, from)].filter(Boolean);
  const link = w.arrow(from, to);
  return `${words ? w.pair(link, words) : link}${says.length ? ` (${says.join(', ')})` : ''}`;
};

/** Mermaid's journey scores tasks from 1 to 5; a task's `channels.value` is its score over 5. */
const JOURNEY_TOP = 5;
const journeyScore = (info: SnapshotPart) => Math.round(Number((info.channels as { value?: unknown } | undefined)?.value) * JOURNEY_TOP);
/** A part's own text, or its first `n` runs of it. */
const textOf = (info: SnapshotPart, n?: number) =>
  info.shapes
    .map((s) => s.text?.trim())
    .filter(Boolean)
    .slice(0, n)
    .join(' ');
/**
 * Journey words. A task is said with its score, which the chart draws only as the height of a face
 * ("4 Undo the move: score 1 of 5"); the experience curve by its lowest and highest tasks. Undefined
 * for any other part.
 */
const journeyName: Namer = ({ w, snapshot, info, words }) => {
  if (info.role === 'task') {
    const score = journeyScore(info);
    return words && Number.isFinite(score) ? w.pair(words, w.score(w.number(score), w.number(JOURNEY_TOP))) : undefined;
  }
  if (info.id !== 'experience-curve') return undefined;
  const tasks = snapshot.parts.filter((p) => p.role === 'task' && Number.isFinite(journeyScore(p)));
  return tasks.length ? extremes(w, w.curve, tasks.map(journeyScore), tasks.map((t) => textOf(t))) : undefined;
};
const NAMERS: Readonly<Record<string, Namer>> = { er: erName, journey: journeyName };
/** A journey's actors, as its task lines name them (`Task: 3: Alice, Bob`), in order of first mention. */
function journeyActors(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split('\n')) {
    const m = /^\s*(?!title\b|section\b)[^:]+:\s*\d+\s*:(.*)$/.exec(line);
    for (const a of m?.[1]!.split(',').map((x) => x.trim()) ?? []) if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

/** The words and size of a label: a native Text, or a diagram label imported as outlines. */
export interface LabelInfo {
  text: string;
  fontSize: number;
  /** Original font size per unit of ink height. Use readingLabelSize after transforming a label. */
  emRatio: number;
}
/** A label's words and size, or undefined for a mobject that is not a label. */
export function labelOf(m: Mobject): LabelInfo | undefined {
  if (m instanceof Text) return { text: m.text, fontSize: m.run.fontSize, emRatio: m.run.fontSize / (m.run.ascent + m.run.descent) };
  const info = m as Partial<LabelInfo>;
  return typeof info.text === 'string' && info.emRatio ? (info as LabelInfo) : undefined;
}

/** The smaller affine scale: rotation preserves size; squash and shear reduce it. */
function smallestScale(a: number, b: number, c: number, d: number): number {
  const x = a * a + b * b, y = c * c + d * d;
  const largest = Math.sqrt((x + y + Math.hypot(x - y, 2 * (a * c + b * d))) / 2);
  return largest > 0 ? Math.abs(a * d - b * c) / largest : 0;
}

/** A canonical one-em parallelogram, centred on the label. Its point order
 * matches Text's frame indexing, but its dimensions are always one font em. */
function emFrame(center: Vec, a: number, b: number, c: number, d: number): Float32Array {
  const x = center[0] - (a + c) / 2, y = center[1] - (b + d) / 2;
  return new Float32Array([x, y, x + a + c, y + b + d, x + c, y + d, x + a, y + b]);
}
function nativeEmBasis(text: Text): [number, number, number, number] {
  const f = text.frameBox, height = text.run.ascent + text.run.descent, size = text.run.fontSize;
  if (!(height > 0 && size > 0 && Number.isFinite(height) && Number.isFinite(size))) return [0, 0, 0, 0];
  const c = (f[4]! - f[0]!) / height, d = (f[5]! - f[1]!) / height;
  const a = text.run.width > 0 ? (f[6]! - f[0]!) / text.run.width : d;
  const b = text.run.width > 0 ? (f[7]! - f[1]!) / text.run.width : -c;
  return [a * size, b * size, c * size, d * size];
}
/** Imported glyphs have no Text advance box. A separate one-em basis follows
 * affine maps and animation, including captured SVG transforms and forced
 * text widths, without contributing to glyph geometry or any layout bounds. */
class ImportedLabel extends Group implements LabelInfo {
  text: string;
  fontSize: number;
  emRatio: number;
  private basis: Float32Array = new Float32Array();

  constructor(paths: VMobject[], shape: SnapshotShape, shaping?: TextShaping) {
    super(...paths);
    this.text = shape.text!;
    this.fontSize = shape.fontSize!;
    this.emRatio = this.fontSize / Math.max(0.001, this.height());
    const run = shape.textRun;
    let [a, b, c, d] = [this.fontSize, 0, 0, this.fontSize];
    if (run) {
      const advance = !run.natural && run.width != null ? new Text(run.text, {fontSize: run.size, shaping}).advance() : 0;
      const width = advance ? run.width! / advance : 1;
      // outlineText maps SVG's downward y axis into the scene's upward y axis.
      a = run.matrix[0]! * run.size * width / SVG_PX_PER_UNIT;
      b = -run.matrix[1]! * run.size * width / SVG_PX_PER_UNIT;
      c = -run.matrix[2]! * run.size / SVG_PX_PER_UNIT;
      d = run.matrix[3]! * run.size / SVG_PX_PER_UNIT;
    }
    this.basis = emFrame(this.center(), a, b, c, d);
  }
  override pointArrays(): Float32Array[] { return [this.basis]; }
  override boundingPointArrays(): Float32Array[] { return []; }
  override pointKind(): string { return 'imported-label-basis'; }
  override copyData(src: Mobject): void { this.basis = new Float32Array((src as ImportedLabel).basis); }
  override matchingFrameFor(source: Mobject): Mobject {
    if (!(source instanceof Text)) return this;
    if (!(source.run.fontSize > 0 && Number.isFinite(source.run.fontSize))) return this;
    const p = this.basis, frame = source.copy(), run = source.run;
    const width = run.width / run.fontSize, height = (run.ascent + run.descent) / run.fontSize;
    frame.frameBox = emFrame(this.center(), (p[6]! - p[0]!) * width, (p[7]! - p[1]!) * width,
      (p[4]! - p[0]!) * height, (p[5]! - p[1]!) * height);
    frame.invalidateBox();
    return frame;
  }
  override interpolateData(a: Mobject, b: Mobject, alpha: number, pathFunc: PathFunc | null): void {
    super.interpolateData(a, b, alpha, pathFunc);
    if (a instanceof ImportedLabel && (b instanceof ImportedLabel || b instanceof Text)) {
      if (b instanceof Text) {
        // Text's advance frame is a different kind of point data. Only this
        // imported label opts into it; native Text interpolation stays intact.
        const target = emFrame(b.center(), ...nativeEmBasis(b));
        for (let i = 0; i < this.basis.length; i += 2) {
          const from: Vec = [a.basis[i]!, a.basis[i + 1]!], to: Vec = [target[i]!, target[i + 1]!];
          const point = pathFunc ? pathFunc(from, to, alpha) :
            alpha === 0 ? from : alpha === 1 ? to : [from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha];
          this.basis[i] = point[0]!; this.basis[i + 1] = point[1]!;
        }
      }
      if (alpha >= 1) {
        const label = labelOf(b)!;
        this.text = label.text; this.fontSize = label.fontSize; this.emRatio = label.emRatio;
      }
    }
  }
  readingSize(): number {
    if (!this.basis.length) return 0;
    const p = this.basis;
    const x = p[6]! - p[0]!, y = p[7]! - p[1]!, z = p[4]! - p[0]!, w = p[5]! - p[1]!;
    return smallestScale(x, y, z, w);
  }
}

/** Conservative font em in world units, for native and imported labels; undefined for other artwork. */
export function readingLabelSize(m: Mobject): number | undefined {
  if (m instanceof ImportedLabel) return m.readingSize();
  if (m instanceof Text) return smallestScale(...nativeEmBasis(m));
  const label = labelOf(m);
  return label ? m.height() * label.emRatio : undefined;
}
const OPPOSITE: Record<NoteSide, NoteSide> = { above: 'below', below: 'above', left: 'right', right: 'left' };
/**
 * Where a note sits beside a box. If the frame would push it back onto the
 * part it describes, try the opposite side, then above and below.
 */
function notePosition(note: Mobject, box: Box, side: NoteSide, frame: Box): Vec {
  const w = note.width() / 2,
    h = note.height() / 2;
  const clear = ([x, y]: Vec) => x + w <= box[0] || x - w >= box[2] || y + h <= box[1] || y - h >= box[3];
  const tries = [...new Set<NoteSide>([side, OPPOSITE[side], 'above', 'below'])].map((s) =>
    clampedPosition(note, box, s, frame),
  );
  return tries.find(clear) ?? tries[0]!;
}
function clampedPosition(note: Mobject, box: Box, side: NoteSide, frame: Box): Vec {
  const w = note.width(),
    h = note.height(),
    gap = 0.14;
  let [x, y] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  if (side === 'above') y = box[3] + gap + h / 2;
  else if (side === 'below') y = box[1] - gap - h / 2;
  else if (side === 'left') x = box[0] - gap - w / 2;
  else x = box[2] + gap + w / 2;
  x = Math.min(Math.max(x, frame[0] + w / 2 + 0.05), frame[2] - w / 2 - 0.05);
  y = Math.min(Math.max(y, frame[1] + h / 2 + 0.05), frame[3] - h / 2 - 0.05);
  return [x, y];
}
class GrowFromEdge extends FadeIn {
  axis: 0 | 1;
  edge: Vec;
  constructor(mob: Mobject, axis: 0 | 1, edge: Vec, runTime: number) {
    super(mob, { runTime });
    this.axis = axis;
    this.edge = edge;
  }
  override createStartingMobject(): Mobject {
    return super.createStartingMobject().stretch(0.001, this.axis, { aboutEdge: this.edge });
  }
}
class MessageToken extends MoveAlongPath {
  override interpolate(alpha: number): void {
    super.interpolate(alpha);
    this.mobject.setOpacity(Math.sin(Math.PI * alpha));
  }
}
/** Scale a style's lengths (stroke width, dashes) by k, as artwork scaled by k needs. */
function scaleStyle(style: Style, k: number): void {
  if (style.strokeWidth != null) style.strokeWidth *= k;
  // Dash patterns are SVG lists: numbers split by spaces and/or commas.
  if (style.dashArray)
    style.dashArray = style.dashArray
      .split(/[ ,]+/)
      .filter((v) => v !== '')
      .map((v) => Number(v) * k)
      .join(' ');
  if (style.dashOffset) style.dashOffset *= k;
}
function scaleArtwork(mob: Mobject, k: number, at: Vec = [0, 0]): void {
  mob.scale(k, { aboutPoint: at });
  for (const m of mob.family()) scaleStyle(m.style, k);
}
/** A copy of `m` scaled by k about `from`, then moved so `from` lands on `to`: one move of the diagram's own view. */
function moved(m: Group, k: number, from: Vec, to: Vec): Group {
  const target = m.copy();
  scaleArtwork(target, k, from);
  target.shift([to[0] - from[0], to[1] - from[1]]);
  return target;
}
/** The stage: the camera's home box, and the most it shows. */
const STAGE: Box = [-8, -4.5, 8, 4.5];
const atHome = (frame: Mobject) => frame.box()!.every((v, i) => Math.abs(v - STAGE[i]!) < 1e-6);
/**
 * The 16:9 camera box around `box` with `margin` on every side, `zoom` times
 * closer, kept inside the stage so the paper always fills the view.
 */
export function cameraBox(box: Readonly<Box>, margin = 0.5, zoom = 1): Box {
  const aspect = (STAGE[2] - STAGE[0]) / (STAGE[3] - STAGE[1]);
  const fit = Math.max(box[2] - box[0] + 2 * margin, (box[3] - box[1] + 2 * margin) * aspect);
  const w = Math.min(STAGE[2] - STAGE[0], fit / zoom),
    h = w / aspect;
  const clamp = (c: number, half: number, lo: number, hi: number) => Math.min(Math.max(c, lo + half), hi - half);
  const cx = clamp((box[0] + box[2]) / 2, w / 2, STAGE[0], STAGE[2]),
    cy = clamp((box[1] + box[3]) / 2, h / 2, STAGE[1], STAGE[3]);
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

export class Diagram {
  readonly scene: Scene;
  spec: DiagramSpec;
  snapshot: DiagramSnapshot;
  root = new Group();
  parts = new Map<string, Part>();
  visible = new Set<string>();
  order: string[];
  frameBox: Box;
  accent: string;
  private home = new Group();
  /** Unemphasised styles of each top-level part's family, at the home frame (captured when built). */
  private base = new Map<string, Style[]>();
  /** How far the diagram's own view has scaled the artwork from home; stroke widths and dashes follow it. */
  private zoom = 1;
  /** The top-level parts last focused on, for the description; null when the diagram is seen whole. */
  private focused: string[] | null = null;
  /** Where a camera focus left the camera; once the camera is elsewhere, the parts are no longer in focus. */
  private focusView: Box | null = null;
  /** Marked parts: their colour, and the word a description gives the mark. */
  private marks = new Map<string, { color: string; as: string }>();
  private kept: Set<string> | null = null;
  /** How opaque dimmed parts stay on this diagram's paper. */
  private dimmed: number;
  /** The last walk, by step name, for the description. */
  private walked: { step: string | undefined; hops: string[]; trail: boolean } | null = null;
  notes: Note[] = [];

  constructor(
    scene: Scene,
    spec: DiagramSpec,
    snapshot: DiagramSnapshot,
    { box: where = 'full' }: ShowOptions = {},
  ) {
    const box = regionBox(where);
    this.scene = scene;
    this.spec = spec;
    this.snapshot = snapshot;
    this.frameBox = box;
    this.root.clipBox = [...box];
    this.accent = emphasis(snapshot.palette);
    this.dimmed = dimOpacity(snapshot.palette);
    emphasises(scene, () => this.emphasised());
    for (const info of partsOf(snapshot)) {
      const mob = new Group();
      mob.key = info.id;
      if (info.from != null && info.to != null) Object.assign(mob, { [connectorPart]: true });
      for (const shape of info.shapes) {
        const paths = shape.textRun ? outlineText(shape.textRun, shape.style, scene.textShaping) : [new VMobject(shape.style)];
        if (!shape.textRun) {
          paths[0]!.subpaths = shape.subpaths.map((a) => new Float32Array(a));
          paths[0]!.closed = [...shape.closed];
        }
        // A text run is one label of many outlines: it moves and checks as a unit.
        const drawn = shape.text != null ? new ImportedLabel(paths, shape, scene.textShaping) : paths[0]!;
        if (shape.textRun) drawn.mergeLeaves = true;
        mob.add(drawn);
      }
      // Connector lettering needs a paper gap, not just an outline around each
      // glyph: a marked route otherwise remains visible through the counters.
      const owner = info.owner && snapshot.parts.find((p) => p.id === info.owner);
      if (owner && owner.from != null && owner.to != null) {
        const labels = mob.children.filter((m) => labelOf(m));
        for (const label of labels) {
          const b = label.box();
          if (!b) continue;
          const gap = Math.max(0.12, (labelOf(label)?.fontSize ?? 0) * 0.6);
          const paper = new Rectangle({
            width: b[2] - b[0] + gap * 2, height: b[3] - b[1] + gap * 2,
            fill: snapshot.palette.paper, stroke: 'none',
          }).moveTo([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
          // Keep the plate with the label through reveals, dimming and focus.
          const i = mob.children.indexOf(label);
          mob.add(paper);
          mob.children.splice(mob.children.indexOf(paper), 1);
          mob.children.splice(i, 0, paper);
        }
      }
      let route: VMobject | undefined;
      if (info.route?.length) {
        route = new VMobject({ fill: 'none', stroke: 'none', opacity: 0 });
        route.startNewPath(info.route[0]!);
        for (const p of info.route.slice(1)) route.addLineTo(p);
        mob.add(route);
      }
      this.parts.set(info.id, { info, mob, ...(route ? { route } : {}) });
      this.root.add(mob);
    }
    // Some renderer labels overhang the declared SVG canvas (notably XY ticks).
    // Fit all artwork as well as that canvas, rather than clipping those labels.
    const [w, h] = [snapshot.width / SVG_PX_PER_UNIT, snapshot.height / SVG_PX_PER_UNIT];
    const artwork = this.root.box() ?? [0, -h, w, 0];
    const bounds: Box = [
      Math.min(0, artwork[0]),
      Math.min(-h, artwork[1]),
      Math.max(w, artwork[2]),
      Math.max(0, artwork[3]),
    ];
    const inset = Math.min(0.12, (box[2] - box[0]) / 20, (box[3] - box[1]) / 20);
    const k = Math.min(
      (box[2] - box[0] - 2 * inset) / (bounds[2] - bounds[0]),
      (box[3] - box[1] - 2 * inset) / (bounds[3] - bounds[1]),
    );
    scaleArtwork(this.root, k);
    this.root.shift([
      (box[0] + box[2]) / 2 - ((bounds[0] + bounds[2]) * k) / 2,
      (box[1] + box[3]) / 2 - ((bounds[1] + bounds[3]) * k) / 2,
    ]);
    this.home = this.root.copy();
    for (const p of this.parts.values()) if (p.info.owner) this.parts.get(p.info.owner)!.mob.add(p.mob);
    // Hidden marks stay in the addressable map, not in the rendered tree.
    for (const p of [...this.root.children]) this.root.remove(p);
    // Family reading: preserve message/task/commit order; graph nodes precede outgoing links.
    const all = [...this.parts.values()].filter((p) => !p.info.owner);
    const graph = ['flowchart', 'state', 'mindmap', 'class', 'architecture'].includes(snapshot.family);
    const nodes = all.filter((p) => p.info.from == null && p.info.id !== '__frame');
    if (graph) {
      const rank = new Map<string, number>();
      // Links may name their ends by bare id ('lb' for 'service:lb', 'Scene' for 'class:Scene').
      const edges = all
        .filter((p) => p.info.from && p.info.to)
        .map((p) => ({ id: p.info.id, from: this.end(p.info.from!), to: this.end(p.info.to!) }));
      for (let i = 0; i < nodes.length; i++)
        for (const { from, to } of edges) if (from !== to && !rank.has(to)) rank.set(to, (rank.get(from) ?? 0) + 1);
      // A mind map reads as its outline: depth first, children in source order, so each topic's
      // subtopics follow it. Rank then height would interleave the root's two sides (1.1, 2.1, 1.2, …).
      const outline = new Map<string, number>();
      if (snapshot.family === 'mindmap') {
        const visit = (id: string) => {
          if (outline.has(id)) return;
          outline.set(id, outline.size);
          for (const e of edges) if (e.from === id) visit(e.to);
        };
        for (const n of nodes) if (!edges.some((e) => e.to === n.info.id)) visit(n.info.id);
        for (const n of nodes) visit(n.info.id);
      }
      nodes.sort((a, b) =>
        snapshot.family === 'mindmap'
          ? outline.get(a.info.id)! - outline.get(b.info.id)!
          : (rank.get(a.info.id) ?? 0) - (rank.get(b.info.id) ?? 0) ||
            b.mob.center()[1] - a.mob.center()[1] ||
            a.mob.center()[0] - b.mob.center()[0],
      );
      this.order = nodes.flatMap((n) => [n.info.id, ...edges.filter((e) => e.from === n.info.id).map((e) => e.id)]);
      this.order.push(...all.map((p) => p.info.id).filter((id) => !this.order.includes(id)));
    } else this.order = all.map((p) => p.info.id);
    if (snapshot.family === 'gitgraph')
      this.order.sort((a, b) => this.get(a).center()[0] - this.get(b).center()[0]);
    for (const p of all) this.base.set(p.info.id, p.mob.family().map((m) => ({ ...m.style })));
  }

  /** The verifier's warnings for this diagram, each with the `part` id it names (see `findingsOf`). */
  findings() {
    return findingsOf(this.snapshot);
  }

  /**
   * The one way an id names a part: its own id, or a participant's, class's or
   * architecture service's bare name ('A' for 'actor:A', 'lb' for 'service:lb'),
   * the name links use for their endpoints.
   */
  private find(id: string): Part | undefined {
    return (
      this.parts.get(id) ??
      ['actor:', 'class:', 'service:', 'junction:', 'group:', 'entity:'].map((kind) => this.parts.get(kind + id)).find((p) => p)
    );
  }
  get(id: string): Group {
    const part = this.find(id);
    if (!part) throw new Error(`No diagram mark ${id}. Available: ${[...this.parts.keys()].join(', ')}`);
    return part.mob;
  }
  /** The top-level part an id belongs to (an owned label resolves to its owner); throws for an unknown id. */
  private top(id: string): string {
    this.get(id);
    let part = this.find(id)!;
    while (part.info.owner) part = this.parts.get(part.info.owner)!;
    return part.info.id;
  }
  /** As `top`, but an endpoint that names no part stands for itself. */
  private end(id: string): string {
    return this.find(id) ? this.top(id) : id;
  }
  /** Put the root on stage. Hidden marks are never added: opacity on a Group does not mask its descendants in the engine. */
  private attach(): void {
    if (!this.scene.mobjects.includes(this.root)) this.scene.add(this.root);
  }
  /** A route token at the start of a link. */
  private token(route: VMobject, color: string): Dot {
    const dot = new Dot({ radius: TOKEN.radius, color }).moveTo(route.pointFromProportion(0));
    this.root.add(dot);
    return dot;
  }
  async build(mode: 'all' | 'frame' = 'all', runTime = 0.65): Promise<this> {
    this.attach();
    await this.reveal(this.order.filter((id) => isScaffold(this.parts.get(id)!.info)), { runTime });
    if (mode === 'all') await this.reveal('rest', { runTime });
    return this;
  }
  async reveal(which: number | readonly string[] | 'rest', { runTime = 0.65 } = {}): Promise<void> {
    const pending = this.order.filter((id) => !this.visible.has(id));
    if (typeof which === 'number' && (!Number.isInteger(which) || which < 0))
      throw new Error('reveal count must be a non-negative integer');
    const requested =
      which === 'rest' ? pending : typeof which === 'number' ? pending.slice(0, which) : [...which];
    const arriving = [...new Set(requested.map((id) => this.top(id)))].filter((id) => !this.visible.has(id));
    const messages: Part[] = [];
    // Arrive in the current look (dimmed if dimming is on, marked if marked, at the camera's zoom).
    this.looks(arriving, 0, false);
    const anims = arriving.map((id) => {
        const p = this.parts.get(id)!;
        this.visible.add(id);
        this.attach();
        for (const child of this.parts.values()) if (child.info.owner === id) this.visible.add(child.info.id);
        this.root.add(p.mob);
        if (p.info.role === 'message' && p.info.from && p.info.to && p.route) {
          const token = this.token(p.route, this.accent);
          messages.push(p);
          return new AnimationGroup(
            [
              new Create(p.mob, { runTime, lagRatio: 0 }),
              new MessageToken(token, p.route, { runTime, rateFunc: linear, remover: true }),
            ],
            { rateFunc: linear },
          );
        }
        if (p.info.role === 'bar') return new GrowFromEdge(p.mob, 1, [0, -1], runTime);
        if (p.info.role === 'task') return new GrowFromEdge(p.mob, 0, [-1, 0], runTime);
        return p.info.from
          ? new Create(p.mob, { runTime, lagRatio: 0 })
          : new FadeIn(p.mob, { runTime, shift: [0, 0.08] });
      });
    if (anims.length) {
      // Draw in snapshot order, sorted once (by rank, not a search per comparison). Transient
      // route tokens (and notes) stay above artwork; the sort is stable among them.
      const rank = new Map(this.snapshot.parts.map((p, i) => [p.id, i]));
      const at = (m: Mobject) => rank.get(m.key!) ?? this.snapshot.parts.length;
      this.root.children.sort((a, b) => at(a) - at(b));
      await this.scene.play(new AnimationGroup(anims, { lagRatio: 0.12, rateFunc: linear }));
    }
    // Land exactly on that look: drawing animations can end a rounding away from it.
    this.looks(arriving, 0, false);
    for (const p of messages)
      recordWalk(this.scene, {
        step: this.scene.currentStep?.name,
        from: p.info.from!,
        to: p.info.to!,
        edge: p.info.id,
      });
  }
  /** A part's words: its own text and its labels' (an edge's label is a part it owns; a quadrant point's is `<id>:label`). */
  private words(id: string): string {
    return [...this.parts.values()]
      .filter((p) => p.info.id === id || p.info.owner === id || p.info.id === `${id}:label`)
      .flatMap((p) => p.info.shapes.map((s) => s.text?.trim()).filter((t): t is string => !!t))
      .join(' ');
  }
  /** What a reader calls a part: its words, a link as "from → to: label", a bar or line by its data. */
  private nameOf(id: string): string {
    const p = this.find(id);
    if (!p) return id;
    const w = wordsOf(this.scene),
      words = this.words(p.info.id);
    const namer = Object.hasOwn(NAMERS, this.snapshot.family) ? NAMERS[this.snapshot.family] : undefined;
    const own = namer?.({ w, snapshot: this.snapshot, info: p.info, words, end: (e) => this.endName(e) });
    if (own) return own;
    if (p.info.from && p.info.to) {
      const link = w.arrow(this.endName(p.info.from), this.endName(p.info.to));
      return words ? w.pair(link, words) : link;
    }
    return words || this.datum(p.info.id);
  }
  /**
   * What a link calls one of its ends: the end's label, or the id the source gives it when it
   * has none. A box drawn with compartments (a class, an ER entity) is called by its name, the
   * first compartment, not by its members.
   */
  private endName(id: string): string {
    const p = this.find(id);
    const name = p && (/^(?:class-box|entity)$/.test(p.info.role) ? textOf(p.info, 1) : this.nameOf(p.info.id));
    return name || id;
  }
  /** A bar's category and value, or a line's range, from the chart's data as written. */
  private datum(id: string): string {
    const bar = /^bar:(\d+):(.*)$/s.exec(id),
      line = /^series:line-(\d+)$/.exec(id);
    // A quadrant point too close to another to be labelled is named by its id, the name in the source.
    if (id.startsWith('point:')) return id.slice(6);
    // An architecture junction is drawn as a dot with no label; it is named by its id in the source.
    if (id.startsWith('junction:')) return wordsOf(this.scene).junction(id.slice(9));
    // A pie slice is said by its name and its legend line's data, "Name [value] (share)" with showData,
    // "Name (share)" without; its own label is only a rounded share, and is said with it.
    if (id.startsWith('slice:')) {
      const legend = this.words(`legend-label:${id.slice(6)}`);
      const data = /(?:\[([^\]]+)\]\s*)?\(([^)]+)\)\s*$/.exec(legend);
      return data ? wordsOf(this.scene).pair(id.slice(6), data[1] ? `${data[1]} (${data[2]})` : data[2]!) : id.slice(6);
    }
    // A radar curve is said by its legend name and its value on each spoke, from the source; its dots are its own.
    if (id.startsWith('curve:') && this.snapshot.family === 'radar') {
      const w = wordsOf(this.scene);
      const { axes, curves } = radarData(this.snapshot.spec.source);
      const curve = curves.find((c) => c.id === id.slice(6));
      if (!curve) return id.slice(6);
      const said = curve.values.flatMap((v, i) => (Number.isFinite(v) ? [w.valueAt(w.number(v), axes[i]?.label ?? String(i + 1))] : []));
      return said.length ? w.pair(curve.label, said.join(', ')) : curve.label;
    }
    if (!bar && !line) return '';
    const categories = this.snapshot.chart?.categories ?? [];
    // Bars and lines are numbered within their kind: bar:1:… is the second bar series.
    const series = (this.snapshot.chart?.series ?? []).filter((s) => s.kind === (bar ? 'bar' : 'line'));
    const k = +(bar ?? line)![1]!;
    const values = series[k]?.values ?? [];
    const w = wordsOf(this.scene);
    if (bar) {
      const value = values[categories.indexOf(bar[2]!)];
      const name = `${bar[2]}${series.length > 1 ? ` (${w.bars(k + 1)})` : ''}`;
      return value != null ? w.pair(name, w.number(value)) : name;
    }
    const name = w.series(series.length > 1 ? k + 1 : undefined);
    return values.length ? extremes(w, name, values, values.map((_, i) => categories[i] ?? String(i + 1))) : name;
  }
  /** The chart's axes, as a reader would read them: titles, the value range and the categories. */
  private axes(): string {
    const ticks = [...this.parts.keys()]
      .filter((id) => id.startsWith('axis:y:label:'))
      .map((id) => Number(this.words(id)))
      .filter(Number.isFinite);
    const w = wordsOf(this.scene);
    const y = this.words('axis:y:title') || w.values;
    const range = ticks.length ? ` ${w.span(w.number(Math.min(...ticks)), w.number(Math.max(...ticks)))}` : '';
    const categories = this.snapshot.chart?.categories ?? [];
    const x = this.words('axis:x:title');
    const over = categories.length
      ? `, ${w.count(categories.length, w.category)} ${w.span(categories[0]!, categories.at(-1)!)}`
      : '';
    return `${y}${range}${x ? ` ${w.by(x)}` : ''}${over}`;
  }
  /** The parts in focus: a camera focus holds only while the camera stays where it put it. */
  private inFocus(): string[] | null {
    const view = this.scene.frame.box();
    return this.focusView && !(view && view.every((v, i) => Math.abs(v - this.focusView![i]!) < 1e-6)) ? null : this.focused;
  }
  /** What the diagram emphasises now, for the player's phone close-ups (`emphasises` in look.ts). */
  private emphasised(): [Mobject, string][] {
    const part = (id: string) => this.parts.get(id)?.mob;
    return [
      ...[...this.marks].flatMap(([id, m]): [Mobject, string][] => (part(id) ? [[part(id)!, `mark ${m.color} ${m.as}`]] : [])),
      ...(this.inFocus() ?? []).flatMap((id): [Mobject, string][] => (part(id) ? [[part(id)!, 'focus']] : [])),
      ...this.notes.map((n): [Mobject, string] => [n.mob, `note ${n.text}`]),
    ];
  }
  /**
   * What a reader sees of this diagram: what it is and how big, then each shown part
   * by its words in reading order (participants and lanes first), with its emphasis,
   * and the notes on it. Parts drawn with no words are reported as blank.
   */
  describe(): Seen {
    const w = wordsOf(this.scene);
    const [family, thing, link] = familyNames(w, this.snapshot.family);
    // Blank parts are reported to the author, in English.
    const [english] = familyNames(wordsFor('en'), this.snapshot.family);
    const parts: SeenPart[] = [];
    const blank: string[] = [];
    const journey = this.snapshot.family === 'journey';
    let things = 0,
      links = 0;
    const step = this.scene.steps.at(-1)?.name;
    // A trail already marks the path; a walk without one names it.
    const walked = this.walked;
    const focused = this.inFocus();
    if (walked && walked.step === step && !walked.trail) parts.push({ name: walked.hops.join(', '), mark: w.path });
    for (const n of this.notes) parts.push({ name: w.beside(n.text, this.nameOf(n.id)), mark: w.note });
    const order = [...this.order].sort((a, b) => +!isScaffold(this.parts.get(a)!.info) - +!isScaffold(this.parts.get(b)!.info));
    for (const id of order) {
      const info = this.parts.get(id)!.info;
      // Axes, titles and legends are summed up in what the chart is.
      if (!this.visible.has(id) || /axis|title|legend/.test(info.role)) continue;
      // A point's label is said with its point.
      if (id.endsWith(':label') && this.visible.has(id.slice(0, -6))) continue;
      // A slice's share label is said with its slice.
      if (id.startsWith('slice-label:') && this.visible.has('slice:' + id.slice(12))) continue;
      // A journey's score guide is its scale, said in what the chart is.
      if (id === 'score-guide') continue;
      const name = this.nameOf(id);
      if (!name) {
        if (!isScaffold(info)) blank.push(`${english} part ${id}`);
        continue;
      }
      if (info.from && info.to) links++;
      // A line through the things (a journey's experience curve) is not one of them.
      else if ((!isScaffold(info) || info.role === 'actor') && info.role !== 'series') things++;
      // A part in focus is said to be, unless a mark says more.
      const mark = this.marks.get(id)?.as ?? (focused?.includes(id) ? w.focused : undefined);
      const dimmed = !!this.kept && !this.kept.has(id) && !isScaffold(info);
      parts.push({ name, ...(mark ? { mark } : {}), ...(dimmed ? { dimmed } : {}) });
    }
    const title = this.words('title');
    // A journey's scale is its score guide's digits; its actors are the ones its tasks name.
    const scale = journey ? this.words('score-guide').split(' ').map(Number).filter(Number.isFinite) : [];
    const actors = journey ? journeyActors(this.snapshot.spec.source) : [];
    // A radar's spokes and its scale, from the centre out, as its source gives them.
    const radar = this.snapshot.family === 'radar' ? radarData(this.snapshot.spec.source) : undefined;
    const spokes = radar?.axes.length ? `${w.count(radar.axes.length, w.axis)} ${w.span(w.number(radar.min), w.number(radar.max))}` : '';
    const size =
      this.snapshot.family === 'xychart'
        ? this.axes()
        : [
            things && w.count(things, thing),
            links && w.count(links, link),
            things && scale.length > 1 && w.scale(w.number(Math.min(...scale)), w.number(Math.max(...scale))),
            things && actors.length && w.actors(actors.length, actors.join(', ')),
            spokes,
          ]
            .filter(Boolean)
            .join(', ');
    const what = `${family}${title ? ` ${w.quote(title)}` : ''}`;
    return { what: size ? w.pair(what, size) : what, parts, ...(blank.length ? { blank } : {}) };
  }
  /**
   * Animations that bring each part to its current look: base style, then the
   * mark colour, then dimming. Parts not on screen change in place.
   */
  private looks(ids: Iterable<string>, runTime: number, animate = true): Transform[] {
    const anims: Transform[] = [];
    for (const id of new Set(ids)) {
      const p = this.parts.get(id)!;
      const fam = p.mob.family();
      const base = this.base.get(id)!;
      const color = this.marks.get(id)?.color;
      const dim = this.kept != null && !this.kept.has(id) && !isScaffold(p.info);
      const connector = !!(p.info.from && p.info.to);
      const within = (m: Mobject, test: (a: Mobject) => boolean) => {
        for (let a: Mobject | null = m; a && a !== p.mob; a = a.parent) if (test(a)) return true;
        return false;
      };
      const styles = fam.map((m, i) => {
        const b = base[i]!,
          st: Style = { ...b };
        if (this.zoom !== 1) scaleStyle(st, this.zoom);
        const text = within(m, (a) => !!labelOf(a));
        // Labels and other owned subjects keep their look. Cardinality marks
        // and explicitly captured marker carriers take their connector's mark.
        const owned = within(m, (a) => a.key != null && a.key !== id && !a.key.startsWith('card:') &&
          !this.parts.get(a.key)?.info.markerCarrier);
        const marker = p.info.markerCarrier || within(m, (a) => !!a.key && !!this.parts.get(a.key)?.info.markerCarrier);
        // Paper inside an aggregation diamond or inheritance triangle denotes
        // a hollow marker. Colour its outline without turning it solid.
        const paper = parseColor(this.snapshot.palette.paper);
        const hollow = marker && parseColor(st.fill)?.every((v, i) => v === paper?.[i]);
        if (color && !owned && !text) {
          if (st.stroke && st.stroke !== 'none' && (st.strokeWidth ?? 0) > 0) {
            st.stroke = color;
            st.strokeWidth = (st.strokeWidth ?? 0) * 1.8;
          }
          if (st.fill && st.fill !== 'none' && (st.fillOpacity ?? 1) > 0 && !hollow) {
            st.fill = connector ? color : lerpColor(st.fill, color, 0.2);
            // A shape drawn by fill alone (a bar, a task) gains an outline: the mark shows by shape, not only hue.
            if (!connector && !(st.stroke && st.stroke !== 'none' && (st.strokeWidth ?? 0) > 0)) {
              Object.assign(st, { stroke: color, strokeOpacity: 1, strokeWidth: 0.04 * this.zoom });
            }
          }
        }
        if (dim) st.opacity = (b.opacity ?? 1) * this.dimmed;
        return st;
      });
      if (fam.every((m, i) => JSON.stringify(m.style) === JSON.stringify(styles[i]))) continue;
      if (animate && this.root.children.includes(p.mob) && this.scene.familyMembers().includes(p.mob)) {
        const target = p.mob.copy();
        target.family().forEach((m, i) => (m.style = { ...styles[i]! } as typeof m.style));
        anims.push(new Transform(p.mob, target, { runTime }));
      } else fam.forEach((m, i) => (m.style = { ...styles[i]! } as typeof m.style));
    }
    return anims;
  }
  /**
   * Colour parts (and links' arrowheads) and thicken their outlines until unmarked. Labels keep
   * their ink. `as` is the word the description gives the mark ("rejected"), when marks are kinds.
   */
  async mark(
    ids: readonly string[],
    { color = this.accent, as = wordsOf(this.scene).marked, runTime = 0.45 }: { color?: string; as?: string; runTime?: number } = {},
  ): Promise<void> {
    const tops = ids.map((id) => this.top(id));
    for (const id of tops) this.marks.set(id, { color, as });
    const anims = this.looks(tops, runTime);
    if (anims.length) await this.scene.play(...anims);
  }
  async unmark(ids?: readonly string[], { runTime = 0.45 } = {}): Promise<void> {
    const tops = ids ? ids.map((id) => this.top(id)) : [...this.marks.keys()];
    for (const id of tops) this.marks.delete(id);
    const anims = this.looks(tops, runTime);
    if (anims.length) await this.scene.play(...anims);
  }
  /**
   * Fade everything except these parts (and links between them, and the
   * family's scaffolding such as lifelines and axes). `null` restores.
   */
  async dim(keep: readonly string[] | null, { runTime = 0.5 } = {}): Promise<void> {
    if (keep == null) this.kept = null;
    else {
      const kept = new Set(keep.map((id) => this.top(id)));
      for (const p of this.parts.values())
        if (!p.info.owner && p.info.from && p.info.to && !kept.has(p.info.id)) {
          if ([p.info.from, p.info.to].every((n) => kept.has(this.end(n)))) kept.add(p.info.id);
        }
      this.kept = kept;
    }
    const anims = this.looks(
      [...this.parts.values()].filter((p) => !p.info.owner).map((p) => p.info.id),
      runTime,
    );
    if (anims.length) await this.scene.play(...anims);
  }
  /**
   * A short label beside a part, at a readable size whatever the diagram's
   * scale. It follows the part through `focus` (and, with `camera`, stays beside it,
   * since the camera moves no part), and leaves with `hide`/`morph`.
   */
  async note(
    id: string,
    text: string,
    { side = 'above', color = this.accent, size = 0.22 }: { side?: NoteSide; color?: string; size?: number } = {},
  ): Promise<Group> {
    const anchor = this.get(id);
    const label = this.scene.text(text, {fontSize: size, color});
    const bg = new Rectangle({
      width: label.width() + size * 1.4,
      height: size * 1.85,
      fill: raised(this.snapshot.palette),
      stroke: color,
      strokeWidth: 0.014,
      cornerRadius: 0.08,
    });
    label.moveTo(bg.center());
    const g = new Group(bg, label);
    g.moveTo(notePosition(g, anchor.box()!, side, this.frameBox));
    this.root.add(g);
    this.attach();
    this.notes.push({ id, side, text, mob: g });
    await this.scene.play(new FadeIn(g, { runTime: 0.35, shift: [0, -0.06] }));
    return g;
  }
  async clearNotes({ runTime = 0.3 } = {}): Promise<void> {
    const notes = this.notes;
    this.notes = [];
    if (notes.length) await this.scene.play(...notes.map((n) => new FadeOut(n.mob, { runTime })));
  }
  /**
   * Tokens travel the diagram's own links. Consecutive hops that join up are
   * one journey with one token. `trail` leaves the travelled links marked, so
   * the step's resting frame still shows the path.
   */
  async walk(
    hops: readonly (readonly [string, string])[],
    {
      runTime = 0.8,
      color = this.accent,
      parallel = false,
      trail = false,
    }: { runTime?: number; color?: string; parallel?: boolean; trail?: boolean | string } = {},
  ): Promise<void> {
    // Endpoints resolve as `get` resolves ids (so 'actor:A' and 'A' name the same participant).
    const path = hops.map(([from, to]) => {
      const [a, b] = [this.end(from), this.end(to)];
      const edge = [...this.parts.values()].find(
        (p) => p.info.from != null && p.info.to != null && this.end(p.info.from) === a && this.end(p.info.to) === b,
      );
      if (!edge?.route || !edge.route.numCurves())
        throw new Error(`walk(): ${from} -> ${to} is not a real link`);
      if (!this.visible.has(edge.info.id)) throw new Error(`walk(): reveal ${edge.info.id} first`);
      return { edge, from, to, a, b };
    });
    const trailColor = trail === true ? color : trail || null;
    const lay = (ids: string[]) => {
      if (!trailColor) return [];
      for (const id of ids) this.marks.set(id, { color: trailColor, as: wordsOf(this.scene).travelled });
      return this.looks(ids, runTime);
    };
    const record = ({ edge, from, to }: (typeof path)[number]) =>
      recordWalk(this.scene, { step: this.scene.currentStep?.name, from, to, edge: edge.info.id });
    this.walked = {
      step: this.scene.currentStep?.name,
      hops: path.map(({ edge }) => wordsOf(this.scene).arrow(this.endName(edge.info.from!), this.endName(edge.info.to!))),
      trail: !!trailColor,
    };
    if (parallel && path.length) {
      const tokens = path.map(({ edge }) => this.token(edge.route!, color));
      await this.scene.play(...tokens.map((token) => new FadeIn(token, { runTime: TOKEN.fade })));
      await this.scene.play(
        ...tokens.map(
          (token, i) => new MoveAlongPath(token, path[i]!.edge.route!, { runTime, rateFunc: linear }),
        ),
        ...lay(path.map((p) => p.edge.info.id)),
      );
      path.forEach(record);
      await this.scene.play(...tokens.map((token) => new FadeOut(token, { runTime: TOKEN.fade })));
      return;
    }
    let token: Dot | null = null;
    for (let i = 0; i < path.length; i++) {
      const hop = path[i]!;
      if (!token) {
        token = this.token(hop.edge.route!, color);
        await this.scene.play(new FadeIn(token, { runTime: TOKEN.fade }));
      }
      await this.scene.play(
        new MoveAlongPath(token, hop.edge.route!, { runTime, rateFunc: linear }),
        ...lay([hop.edge.info.id]),
      );
      record(hop);
      if (path[i + 1]?.a !== hop.b) {
        await this.scene.play(new FadeOut(token, { runTime: TOKEN.fade }));
        token = null;
      }
    }
  }
  /** Transforms that take the shown parts and their notes to `targetFor`'s copies; hidden parts move at once. */
  private partMoves(mobs: Group[], targetFor: (m: Group) => Group, runTime: number): Transform[] {
    const shown: Transform[] = [];
    const targets = new Map<Mobject, Group>();
    for (const m of mobs) {
      const target = targetFor(m);
      targets.set(m, target);
      const animation = new Transform(m, target, { runTime });
      if (this.visible.has(m.key!)) shown.push(animation);
      else {
        animation.begin();
        animation.finish();
      }
    }
    for (const n of this.notes) {
      let top: Mobject = this.get(n.id);
      while (top.parent && top.parent !== this.root) top = top.parent;
      const moved = targets.get(top);
      if (!moved) continue;
      const box = moved.family()[top.family().indexOf(this.get(n.id))]!.box()!;
      const target = n.mob.copy();
      target.moveTo(notePosition(target, box, n.side, this.frameBox));
      shown.push(new Transform(n.mob, target, { runTime }));
    }
    return shown;
  }
  /**
   * Look closer at these parts, or back at the whole diagram with `'all'`. The description
   * names the parts in focus.
   *
   * By default the diagram's own view moves: inside its box (which clips it) the artwork
   * scales `zoom` times past a fit of the parts, notes follow, and whatever stands beside
   * the box (cards, code, a column of text) stays where it is.
   *
   * With `camera: true` the stage's camera (`scene.frame`) moves instead, onto the parts,
   * their notes and any native objects in `also`, with `margin` scene units around them;
   * `zoom` above 1 goes closer, below 1 shows more. No point moves: labels keep their size
   * in the world and the camera enlarges them on screen, which is how `rayner check` and
   * the player's close-ups measure them. The view never leaves the 16 × 9 stage, but it
   * shows less of it: the heading, cards and code are world objects too, so keep what the
   * step's last frame needs inside the view with `also`.
   *
   * `'all'` undoes both: the artwork returns to its box and the camera goes home, in one
   * play. `s.clear()` also brings the camera home.
   */
  async focus(
    ids: readonly string[] | 'all',
    {
      zoom = 1,
      camera = false,
      margin = 0.5,
      also = [],
      runTime = 0.9,
    }: { zoom?: number; camera?: boolean; margin?: number; also?: readonly Mobject[]; runTime?: number } = {},
  ): Promise<void> {
    if (!(zoom > 0 && Number.isFinite(zoom))) throw new Error(`focus() zoom must be a positive number, not ${zoom}`);
    if (!camera && also.length) throw new Error('focus(): `also` frames native objects with the camera; pass camera: true');
    const frame = this.scene.frame;
    const mobs = [...this.parts.values()].filter((p) => !p.info.owner).map((p) => p.mob);
    const whole = new Group(...mobs.map((m) => m.copy()));
    if (ids === 'all') {
      this.focused = this.focusView = null;
      const anims: Transform[] = atHome(frame) ? [] : [new Transform(frame, frame.copy().reset(), { runTime })];
      // Apply one global affine map from current full diagram bounds to its authored frame.
      const home = this.home.box(),
        now = whole.box();
      // The map is uniform, so either extent gives k; the longer one is measured more precisely
      // (a thin diagram's short side is mostly float32 rounding once zoomed).
      const wide = !!home && home[2] - home[0] >= home[3] - home[1];
      const k = !home || !now ? NaN : wide ? (home[2] - home[0]) / (now[2] - now[0]) : (home[3] - home[1]) / (now[3] - now[1]);
      // Nothing drawn, or a diagram fitted down to a point (an absurd canvas size): no extent to restore.
      const restore = Number.isFinite(k) && k > 0;
      if (restore) {
        const a: Vec = [(now![0] + now![2]) / 2, (now![1] + now![3]) / 2],
          b: Vec = [(home![0] + home![2]) / 2, (home![1] + home![3]) / 2];
        anims.push(...this.partMoves(mobs, (m) => moved(m, k, a, b), runTime));
      }
      if (anims.length) await this.scene.play(...anims);
      if (restore) this.rezoom(1);
      return;
    }
    if (!ids.length) throw new Error("focus() needs at least one part, or 'all'");
    const tops = [...new Set(ids.map((id) => this.top(id)))];
    if (camera) {
      const notes = this.notes.filter((n) => tops.includes(this.top(n.id))).map((n) => n.mob);
      const boxes = [...ids.map((id) => this.get(id)), ...notes, ...also]
        .map((m) => m.box())
        .filter((b): b is Box => b != null);
      if (!boxes.length) throw new Error('focus(): nothing to look at');
      const box: Box = [
        Math.min(...boxes.map((b) => b[0])),
        Math.min(...boxes.map((b) => b[1])),
        Math.max(...boxes.map((b) => b[2])),
        Math.max(...boxes.map((b) => b[3])),
      ];
      this.focused = tops;
      await this.scene.play(frame.animate.fit(cameraBox(box, margin, zoom), { margin: 0 }), { runTime });
      this.focusView = [...frame.box()!] as Box;
      return;
    }
    const chosen = new Group(...ids.map((id) => this.get(id).copy()));
    const center = chosen.center(),
      box = this.frameBox;
    const k =
      Math.min(
        (box[2] - box[0]) / Math.max(0.1, chosen.width()),
        (box[3] - box[1]) / Math.max(0.1, chosen.height()),
      ) *
      0.78 *
      zoom;
    this.focused = tops;
    this.focusView = null;
    const anims = this.partMoves(mobs, (m) => moved(m, k, center, boxCenter(box)), runTime);
    if (anims.length) await this.scene.play(...anims);
    this.rezoom(this.zoom * k);
  }
  /**
   * The diagram's view has moved: re-derive every look from the home styles at the new zoom (the move
   * already animated it), so a look depends only on zoom, marks and dimming, never on the order
   * of calls, and returning to 'all' restores the home styles exactly.
   */
  private rezoom(zoom: number): void {
    this.zoom = zoom;
    this.looks(this.base.keys(), 0, false);
  }
  /**
   * Same-id marks glide to their next place; arrivals fade in, departures fade
   * out. Marks, dimming and notes are reset: the next diagram starts plain.
   * The next diagram keeps this one's style unless it names its own.
   */
  async morph(
    next: DiagramSpec,
    { ops, runTime = 1.1 }: { ops?: readonly MutationOp[]; runTime?: number } = {},
  ): Promise<void> {
    if (next.style == null && this.spec.style != null) next = { ...next, style: this.spec.style };
    const resolver = diagramsOf(this.scene);
    if (ops && resolver.morph) await resolver.morph(this.spec, next, ops);
    const snapshot = await resolver.diagram(next);
    const target = new Diagram(this.scene, next, snapshot, { box: this.frameBox });
    const animations = [];
    for (const [id, p] of this.parts)
      if (!p.info.owner && this.visible.has(id)) {
        const q = target.parts.get(id);
        animations.push(q ? new Transform(p.mob, q.mob, { runTime }) : new FadeOut(p.mob, { runTime }));
      }
    for (const [id, q] of target.parts)
      if (!q.info.owner && !this.visible.has(id)) animations.push(new FadeIn(q.mob, { runTime }));
    for (const n of this.notes) animations.push(new FadeOut(n.mob, { runTime: Math.min(runTime, 0.4) }));
    this.notes = [];
    if (animations.length) await this.scene.play(...animations);
    // Exact handoff to the freshly read tree, retaining semantic route references.
    this.scene.remove(this.root);
    for (const p of target.parts.values())
      if (!p.info.owner) {
        this.scene.remove(p.mob);
        target.root.add(p.mob);
      }
    this.scene.add(target.root);
    this.parts = target.parts;
    this.order = target.order;
    this.root = target.root;
    this.home = target.home;
    this.visible = new Set(this.parts.keys());
    this.spec = next;
    this.snapshot = snapshot;
    // A new style brings its own emphasis colour and dimming.
    this.accent = target.accent;
    this.dimmed = target.dimmed;
    this.base = target.base;
    this.zoom = 1;
    this.plain();
  }
  /** No marks, dimming or walk: the state a fresh or morphed diagram starts in. */
  private plain(): void {
    this.marks.clear();
    this.kept = null;
    this.walked = null;
    this.focused = this.focusView = null;
  }
  /** Fade the whole diagram (and its notes) out. `reveal` can bring parts back. */
  async hide(): Promise<void> {
    const shown = [...this.visible]
      .filter((id) => !this.parts.get(id)!.info.owner)
      .map((id) => this.parts.get(id)!.mob);
    const notes = this.notes.map((n) => n.mob);
    if (shown.length || notes.length)
      await this.scene.play(...[...shown, ...notes].map((m) => new FadeOut(m, { runTime: 0.4 })));
    this.forget();
  }
  /** Reset to unrevealed and unemphasised, without animating (the stage has faded it). */
  forget(): void {
    this.plain();
    this.looks(this.base.keys(), 0, false);
    this.notes = [];
    this.visible.clear();
    for (const child of [...this.root.children]) this.root.remove(child);
    // Off stage, so the description stops naming it; `reveal` attaches it again.
    this.scene.remove(this.root);
  }
}
