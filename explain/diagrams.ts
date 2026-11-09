import {
  Group,
  VMobject,
  FadeIn,
  FadeOut,
  Create,
  Transform,
  Dot,
  GrowFromEdge,
  PulseAlongPath,
  AnimationGroup,
  linear,
  Rectangle,
} from '../src/index.ts';
import { MoveAlongPath } from '../src/animation.ts';
import { Text } from '../src/text.ts';
import { Action } from './action.ts';
import { ImportedLabel, labelOf } from './labels.ts';
import type { Beat, Plan } from './action.ts';
import type { Scene, Mobject, Box, Vec, Style, ScheduledAnimation } from '../src/index.ts';
import { center, unionBoxes } from '../src/box.ts';
import { paintsFill } from '../src/mobject.ts';
import { regionBox, boxCenter, raised, emphasis, dimOpacity, emphasises, selfDescribed } from './look.ts';
import type { Region } from './look.ts';
import { resolverOf, diagramKey, diagramFindings, SVG_PX_PER_UNIT } from './diagram-snapshot.ts';
import { outlineText } from './diagram-text.ts';
import { recordWalk } from './trace.ts';
import { wordsOf, wordsFor, familyNames } from './words.ts';
import type { Words } from './words.ts';
import type { Description, DescriptionPart } from './trace.ts';
import { blendPaint, parseColor } from '../src/color.ts';
import type {
  DiagramSpec,
  DiagramSnapshot,
  SnapshotPart,
  MutationOp,
} from './diagram-snapshot.ts';

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
  /** The part's own drawn shapes and labels, in drawing order (see Diagram.shapes and Diagram.labels). */
  shapes: VMobject[];
  labels: ImportedLabel[];
}
export type NoteSide = 'above' | 'below' | 'left' | 'right';
/** What a picture of a diagram shows besides its parts: its marks with their words, and the parts dimming keeps. */
interface PictureShows {
  marks: ReadonlyMap<string, { color: string; as: string }>;
  kept: ReadonlySet<string> | null;
  /** False for a picture describing itself apart from the diagram (a second copy, say): the live walk is not its. */
  walk?: boolean;
}
const pictureShows = Symbol('pictureShows');
/** A note in a diagram's picture: a short label beside part `id`, at a readable size whatever the diagram's scale. */
export interface PictureNote { id: string; text: string; side?: NoteSide; color?: string; size?: number }
/**
 * How a diagram is on the stage now: not at all (`detached`, before it is built and after `d.hide()` or
 * `s.clear()`), as its live parts (`live`), or by a view that draws a picture of it while the live
 * diagram is off the stage (`viewed`, set by `s.diagramView` or `d.showBy`). A live diagram that
 * took a view's place (`s.liveDiagram`) names that view as `replaced`, so the stage can show the
 * diagram by it again; otherwise `replaced` is null.
 *
 * The rule: only the diagram's and the stage's calls change it (`s.show`, a reveal, a morph,
 * `d.hide`, `s.clear`, `s.diagramView`, `s.liveDiagram`, `d.showBy`), and `d.root` cannot be
 * replaced. A scene may take the live root or the view off the stage itself (`this.remove`, a
 * FadeOut): the presentation stays, and the stage describes the diagram again once it is back. A
 * scene must not put on the stage what the presentation says is off it, the live root while a view
 * shows the diagram, or the view it replaced beside a live diagram: each key would be drawn twice,
 * and the stage refuses it when it next describes the diagram.
 */
export type DiagramPresentation =
  | { readonly kind: 'detached' }
  | { readonly kind: 'live'; readonly replaced: Mobject | null }
  | { readonly kind: 'viewed'; readonly view: Mobject };
const DETACHED: DiagramPresentation = Object.freeze({ kind: 'detached' });
const LIVE: DiagramPresentation = Object.freeze({ kind: 'live', replaced: null });
/** Whether `m` is on `scene`: its outermost ancestor is one of the scene's top-level mobjects. */
const onStage = (scene: Scene, m: Mobject): boolean => {
  let top = m;
  while (top.parent) top = top.parent;
  return scene.mobjects.includes(top);
};
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
/** Whether a state diagram part is a `[*]` dot, which capture marks with a `start` or `end` status. */
const pseudostate = (info: SnapshotPart): 'start' | 'end' | undefined => {
  const status = (info.channels as { status?: unknown } | undefined)?.status;
  return status === 'start' || status === 'end' ? status : undefined;
};
/**
 * State words for the `[*]` dots, which have no label. Their ids name the state they belong to,
 * then its region when it has several: `_start`, `on_end`, `on__r2_start`. Each is named that
 * way, "start of on, region 2", so descriptions and walks never fall back to the id. Undefined
 * for any other part.
 */
const stateName: Namer = ({ w, info, end }) => {
  const status = pseudostate(info);
  if (!status) return undefined;
  const m = /^(.*?)(?:__r(\d+))?_(?:start|end)$/s.exec(info.id);
  if (!m) return undefined;
  return w.pseudostate(status, m[1] ? end(m[1]) : undefined, m[2] ? Number(m[2]) : undefined);
};
const NAMERS: Readonly<Record<string, Namer>> = { er: erName, journey: journeyName, state: stateName };
/** A journey's actors, as its task lines name them (`Task: 3: Alice, Bob`), in order of first mention. */
function journeyActors(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split('\n')) {
    const m = /^\s*(?!title\b|section\b)[^:]+:\s*\d+\s*:(.*)$/.exec(line);
    for (const a of m?.[1]!.split(',').map((x) => x.trim()) ?? []) if (a && !out.includes(a)) out.push(a);
  }
  return out;
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
  let [x, y] = center(box);
  if (side === 'above') y = box[3] + gap + h / 2;
  else if (side === 'below') y = box[1] - gap - h / 2;
  else if (side === 'left') x = box[0] - gap - w / 2;
  else x = box[2] + gap + w / 2;
  x = Math.min(Math.max(x, frame[0] + w / 2 + 0.05), frame[2] - w / 2 - 0.05);
  y = Math.min(Math.max(y, frame[1] + h / 2 + 0.05), frame[3] - h / 2 - 0.05);
  return [x, y];
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
/** How many diagrams each scene has made, by the scene. */
const made = new WeakMap<Scene<any, any>, number>();
/**
 * @internal How many diagrams have been made on `scene`: the command reads it on each scene a
 * project ran (and each one exploration ran) to know whether its page needs diagram code, wherever
 * the diagrams' snapshots came from. Kept per scene, so runs of other projects in the same process
 * never count.
 */
export const diagramsOn = (scene: Scene<any, any>): number => made.get(scene) ?? 0;

/** A copy of `m` scaled by k about `from`, then moved so `from` lands on `to`: one move of the diagram's own view. */
function moved(m: Group, k: number, from: Vec, to: Vec): Group {
  const target = m.copy();
  scaleArtwork(target, k, from);
  target.shift([to[0] - from[0], to[1] - from[1]]);
  return target;
}
export class Diagram {
  readonly scene: Scene;
  /** The spec it was drawn from (after a morph, the morph's). */
  get spec(): DiagramSpec { return this.#spec; }
  #spec: DiagramSpec;
  /** The snapshot its geometry comes from (after a morph, the morph's). */
  get snapshot(): DiagramSnapshot { return this.#snapshot; }
  #snapshot: DiagramSnapshot;
  /**
   * The group that holds the diagram's artwork, which the diagram and the stage put on the stage
   * and take off it (see DiagramPresentation). It cannot be replaced. A scene may take it off the
   * stage itself; it may not put it on while a view shows the diagram.
   */
  get root(): Group { return this.#root; }
  #root = new Group();
  /** Each part's id in the snapshot, by its mobject (a part's key is its id, but for the frame's). */
  private partIds = new WeakMap<Mobject, string>();
  /**
   * The frame's key. Every family that draws a frame calls it `__frame`, so it is keyed by the
   * diagram as first shown instead: the frames of two diagrams on one stage are two parts, and a
   * morph keeps the frame's key.
   */
  private frameKey: string;
  /** Each part by its id. */
  get parts(): ReadonlyMap<string, Part> { return this.#parts; }
  #parts = new Map<string, Part>();
  /** The top-level parts revealed so far: reveal and hide change it. */
  get visible(): ReadonlySet<string> { return this.#visible; }
  #visible = new Set<string>();
  /** The top-level parts in reading order: what reveal brings in next. */
  get order(): readonly string[] { return this.#order; }
  #order: string[];
  /** @internal The box the diagram was laid out in. */
  frameBox: Box;
  /** The diagram's emphasis colour: its style's accent when that has a hue, else a warm orange, as the stage's `look.emphasis`. */
  get emphasis(): string { return this.#emphasis; }
  #emphasis: string;
  private home = new Group();
  /** Unemphasised styles of each top-level part's family, at the home frame (captured when built). */
  private base = new Map<string, Style[]>();
  /** How far the diagram's own view has scaled the artwork from home; stroke widths and dashes follow it. */
  private zoom = 1;
  /** The top-level parts last focused on, for the description; null when the diagram is seen whole. */
  private focused: string[] | null = null;
  /** How opaque dimmed parts stay on this diagram's paper, in a picture that dims (see picture). */
  private dimmed: number;
  /** The last walk, by step name, for the description. */
  private walked: { step: string | undefined; hops: string[]; edges: string[] } | null = null;
  /** Notes notePicture built, for the description while they are on stage. */
  private drawnNotes = new Map<Mobject, { id: string; text: string }>();

  constructor(
    scene: Scene,
    spec: DiagramSpec,
    snapshot: DiagramSnapshot,
    { box: where = 'full' }: ShowOptions = {},
  ) {
    made.set(scene, diagramsOn(scene) + 1);
    const box = regionBox(where);
    this.scene = scene;
    this.frameKey = `frame:${diagramKey(spec)}`;
    this.#spec = spec;
    this.#snapshot = snapshot;
    this.frameBox = box;
    this.#root.clipBox = [...box];
    this.#emphasis = emphasis(snapshot.palette);
    this.dimmed = dimOpacity(snapshot.palette);
    emphasises(scene, () => this.emphasised());
    for (const info of partsOf(snapshot)) {
      const mob = new Group();
      this.partIds.set(mob, info.id);
      mob.key = info.id === '__frame' ? this.frameKey : info.id;
      if (info.id === '__frame') mob.role = 'frame';
      if (info.from != null && info.to != null) Object.assign(mob, { [connectorPart]: true });
      const shapes: VMobject[] = [], labels: ImportedLabel[] = [];
      for (const shape of info.shapes) {
        const paths = shape.textRun ? outlineText(shape.textRun, shape.style, scene.textShaping) : [new VMobject(shape.style)];
        if (!shape.textRun) {
          paths[0]!.subpaths = shape.subpaths.map((a) => new Float32Array(a));
          paths[0]!.closed = [...shape.closed];
        }
        // A text run is one label of many outlines: it moves and checks as a unit.
        const drawn = shape.text != null ? new ImportedLabel(paths, shape, scene.textShaping) : paths[0]!;
        if (shape.textRun) drawn.mergeLeaves = true;
        if (drawn instanceof ImportedLabel) labels.push(drawn);
        else shapes.push(drawn);
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
          }).moveTo(center(b));
          // Keep the plate with the label through reveals, dimming and focus.
          mob.insert(mob.children.indexOf(label), paper);
        }
      }
      let route: VMobject | undefined;
      if (info.route?.length) {
        route = new VMobject({ fill: 'none', stroke: 'none', opacity: 0 });
        route.startNewPath(info.route[0]!);
        for (const p of info.route.slice(1)) route.addLineTo(p);
        mob.add(route);
      }
      this.#parts.set(info.id, { info, mob, shapes, labels, ...(route ? { route } : {}) });
      this.#root.add(mob);
    }
    // Some renderer labels overhang the declared SVG canvas (notably XY ticks).
    // Fit all artwork as well as that canvas, rather than clipping those labels.
    const [w, h] = [snapshot.width / SVG_PX_PER_UNIT, snapshot.height / SVG_PX_PER_UNIT];
    const artwork = this.#root.box() ?? [0, -h, w, 0];
    const bounds = unionBoxes([[0, -h, w, 0], artwork])!;
    const inset = Math.min(0.12, (box[2] - box[0]) / 20, (box[3] - box[1]) / 20);
    const k = Math.min(
      (box[2] - box[0] - 2 * inset) / (bounds[2] - bounds[0]),
      (box[3] - box[1] - 2 * inset) / (bounds[3] - bounds[1]),
    );
    scaleArtwork(this.#root, k);
    const [to, from] = [center(box), center(bounds)];
    this.#root.shift([to[0] - from[0] * k, to[1] - from[1] * k]);
    this.home = this.#root.copy();
    for (const p of this.#parts.values()) if (p.info.owner) this.#parts.get(p.info.owner)!.mob.add(p.mob);
    // Hidden marks stay in the addressable map, not in the rendered tree.
    for (const p of [...this.#root.children]) this.#root.remove(p);
    // Family reading: preserve message/task/commit order; graph nodes precede outgoing links.
    const all = [...this.#parts.values()].filter((p) => !p.info.owner);
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
      this.#order = nodes.flatMap((n) => [n.info.id, ...edges.filter((e) => e.from === n.info.id).map((e) => e.id)]);
      this.#order.push(...all.map((p) => p.info.id).filter((id) => !this.#order.includes(id)));
    } else this.#order = all.map((p) => p.info.id);
    if (snapshot.family === 'gitgraph')
      this.#order.sort((a, b) => this.get(a).center()[0] - this.get(b).center()[0]);
    for (const p of all) this.base.set(p.info.id, p.mob.family().map((m) => ({ ...m.style })));
  }

  /** The verifier's warnings for this diagram, each with the `part` id it names (see `diagramFindings`). */
  findings() {
    return diagramFindings(this.#snapshot);
  }

  /**
   * The one way an id names a part: its own id, or a participant's, class's or
   * architecture service's bare name ('A' for 'actor:A', 'lb' for 'service:lb'),
   * the name links use for their endpoints.
   */
  private find(id: string): Part | undefined {
    return (
      this.#parts.get(id) ??
      ['actor:', 'class:', 'service:', 'junction:', 'group:', 'entity:'].map((kind) => this.#parts.get(kind + id)).find((p) => p)
    );
  }
  get(id: string): Group {
    return this.part(id, 'd.get()').mob;
  }
  /**
   * Part `id`'s own drawn shapes, in drawing order: a node's outline, a link's line and arrowhead, a
   * task's bar. Its labels, the plates behind them, its route and the parts it owns are not among them.
   */
  shapes(id: string): VMobject[] {
    return [...this.part(id, 'd.shapes()').shapes];
  }
  /** Part `id`'s own labels, in drawing order, each with the `text` it reads. */
  labels(id: string): (Mobject & { readonly text: string })[] {
    return [...this.part(id, 'd.labels()').labels];
  }
  private part(id: string, api: string): Part {
    const part = this.find(id);
    if (!part) throw new RangeError(`${api}: the diagram has no part ${JSON.stringify(id)}; its parts are ${[...this.#parts.keys()].join(', ')}`);
    return part;
  }
  /** The top-level part an id belongs to (an owned label resolves to its owner); throws for an unknown id. */
  private top(id: string, api: string): string {
    this.part(id, api);
    let part = this.find(id)!;
    while (part.info.owner) part = this.#parts.get(part.info.owner)!;
    return part.info.id;
  }
  /** As `top`, but an endpoint that names no part stands for itself. */
  private end(id: string): string {
    return this.find(id) ? this.top(id, 'd.link()') : id;
  }
  /** Put the root on stage: the diagram is live. Hidden marks are never added: opacity on a Group does not mask its descendants in the engine. */
  private attach(api: string): void {
    this.mustBeLive(api);
    if (!this.scene.mobjects.includes(this.#root)) this.scene.add(this.#root);
    this.goLive();
  }
  /** Live, if it was not: a diagram live already keeps the view it replaced. */
  private goLive(): void {
    if (this.presented.kind !== 'live') this.presented = LIVE;
  }
  /**
   * A call that moves the live parts (a reveal, an enlargement, a morph) refuses a diagram a view
   * shows: the parts it moves are off the stage, and bringing them back beside the view would put
   * every key on stage twice.
   */
  private mustBeLive(api: string): void {
    if (this.presented.kind === 'viewed')
      throw new Error(`${api}: the diagram is shown by a view, so its live parts are off the stage; call s.liveDiagram(d) first`);
  }
  /** A route token at the start of a link. */
  private token(route: VMobject, color: string): Dot {
    const dot = new Dot({ radius: TOKEN.radius, color }).moveTo(route.pointFromProportion(0));
    this.#root.add(dot);
    return dot;
  }
  /** @internal Build the diagram in: its scaffolding, then with 'all' the rest in reading order (s.show's `build` option). */
  build(mode: 'all' | 'frame' = 'all', runTime = 0.65): Action<this> {
    return new Action(this.scene, 'd.build()', () => this.buildPlan(mode, runTime));
  }
  /** @internal What `build` does, decided now: s.show plays it as its own. */
  buildPlan(mode: 'all' | 'frame' = 'all', runTime = 0.65): Plan<this> {
    const scaffold = this.revealBeat(this.#order.filter((id) => isScaffold(this.#parts.get(id)!.info)), runTime, 'd.build()');
    const rest = mode === 'all' ? [this.revealBeat('rest', runTime, 'd.build()', new Set(scaffold.arriving)).beat] : [];
    return { value: this, start: () => this.attach('d.build()'), beats: [scaffold.beat, ...rest] };
  }
  /** Bring in the next `n` parts in reading order, named parts, or the rest, in one play. */
  reveal(which: number | readonly string[] | 'rest', { runTime = 0.65 } = {}): Action {
    return new Action(this.scene, 'd.reveal()', () => {
      this.mustBeLive('d.reveal()');
      return { value: undefined, beats: [this.revealBeat(which, runTime, 'd.reveal()').beat] };
    });
  }
  /**
   * A reveal's play, decided now: the parts that arrive (pending now, and not in `coming`, which
   * an earlier beat of the same action reveals), and what each does when its turn comes.
   */
  private revealBeat(which: number | readonly string[] | 'rest', runTime: number, name: string, coming: ReadonlySet<string> = new Set()): { beat: Beat; arriving: string[] } {
    const shown = (id: string) => this.#visible.has(id) || coming.has(id);
    const pending = this.#order.filter((id) => !shown(id));
    if (typeof which === 'number' && (!Number.isInteger(which) || which < 0))
      throw new RangeError(`${name}: a count of parts must be a whole number, 0 or more, not ${which}`);
    const requested =
      which === 'rest' ? pending : typeof which === 'number' ? pending.slice(0, which) : [...which];
    const arriving = [...new Set(requested.map((id) => this.top(id, name)))].filter((id) => !shown(id));
    // The members start 0.12 of a run time apart, as the play's group lays them out.
    let last = 0;
    for (let i = 1; i < arriving.length; i++) last += 0.12 * runTime;
    const messages: Part[] = [];
    const play = (): ScheduledAnimation[] => {
      const early = arriving.find((id) => this.#visible.has(id));
      if (early) throw new Error(`${name}: ${early} was revealed after this reveal was made; make the reveal once the one before it has played`);
      // Arrive in the current look (dimmed if dimming is on, marked if marked, at the camera's zoom).
      this.restyle(arriving);
      const anims = arriving.map((id) => {
          const p = this.#parts.get(id)!;
          this.#visible.add(id);
          this.attach(name);
          for (const child of this.#parts.values()) if (child.info.owner === id) this.#visible.add(child.info.id);
          this.#root.add(p.mob);
          if (p.info.role === 'message' && p.info.from && p.info.to && p.route) {
            const token = this.token(p.route, this.#emphasis);
            messages.push(p);
            return new AnimationGroup(
              [
                new Create(p.mob, { runTime, lagRatio: 0 }),
                new PulseAlongPath(token, p.route, { runTime, rateFunc: linear }),
              ],
              { rateFunc: linear },
            );
          }
          if (p.info.role === 'bar') return new GrowFromEdge(p.mob, [0, -1], { runTime });
          if (p.info.role === 'task') return new GrowFromEdge(p.mob, [-1, 0], { runTime });
          return p.info.from
            ? new Create(p.mob, { runTime, lagRatio: 0 })
            : new FadeIn(p.mob, { runTime, shift: [0, 0.08] });
        });
      if (!anims.length) return [];
      // Draw in snapshot order, sorted once (by rank, not a search per comparison). Transient
      // route tokens (and notes) stay above artwork; the sort is stable among them.
      const rank = new Map(this.#snapshot.parts.map((p, i) => [p.id, i]));
      const at = (m: Mobject) => rank.get(this.partIds.get(m)!) ?? this.#snapshot.parts.length;
      this.#root.add(...[...this.#root.children].sort((a, b) => at(a) - at(b)));
      return [new AnimationGroup(anims, { lagRatio: 0.12, rateFunc: linear })];
    };
    const after = () => {
      // Land exactly on that look: drawing animations can end a rounding away from it.
      this.restyle(arriving);
      for (const p of messages)
        recordWalk(this.scene, {
          step: this.scene.currentStep?.name,
          from: p.info.from!,
          to: p.info.to!,
          edge: p.info.id,
        });
    };
    return { beat: { runTime: arriving.length ? last + runTime : 0, play, after }, arriving };
  }
  /** A part's words: its own text and its labels' (an edge's label is a part it owns; a quadrant point's is `<id>:label`). */
  private words(id: string): string {
    return [...this.#parts.values()]
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
    const namer = Object.hasOwn(NAMERS, this.#snapshot.family) ? NAMERS[this.#snapshot.family] : undefined;
    const own = namer?.({ w, snapshot: this.#snapshot, info: p.info, words, end: (e) => this.endName(e) });
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
    if (id.startsWith('curve:') && this.#snapshot.family === 'radar') {
      const w = wordsOf(this.scene);
      const { axes, curves } = radarData(this.#snapshot.spec.source);
      const curve = curves.find((c) => c.id === id.slice(6));
      if (!curve) return id.slice(6);
      const said = curve.values.flatMap((v, i) => (Number.isFinite(v) ? [w.valueAt(w.number(v), axes[i]?.label ?? String(i + 1))] : []));
      return said.length ? w.pair(curve.label, said.join(', ')) : curve.label;
    }
    if (!bar && !line) return '';
    const categories = this.#snapshot.chart?.categories ?? [];
    // Bars and lines are numbered within their kind: bar:1:… is the second bar series.
    const series = (this.#snapshot.chart?.series ?? []).filter((s) => s.kind === (bar ? 'bar' : 'line'));
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
    const ticks = [...this.#parts.keys()]
      .filter((id) => id.startsWith('axis:y:label:'))
      .map((id) => Number(this.words(id)))
      .filter(Number.isFinite);
    const w = wordsOf(this.scene);
    const y = this.words('axis:y:title') || w.values;
    const range = ticks.length ? ` ${w.span(w.number(Math.min(...ticks)), w.number(Math.max(...ticks)))}` : '';
    const categories = this.#snapshot.chart?.categories ?? [];
    const x = this.words('axis:x:title');
    const over = categories.length
      ? `, ${w.count(categories.length, w.category)} ${w.span(categories[0]!, categories.at(-1)!)}`
      : '';
    return `${y}${range}${x ? ` ${w.by(x)}` : ''}${over}`;
  }
  /** What the diagram emphasises now, for the player's phone close-ups (`emphasises` in look.ts). */
  private emphasised(): [Mobject | string, string][] {
    // While a view shows the diagram, the live one is off the stage: a part is named by its key,
    // which names the view's copy of it on the stage.
    const viewed = this.presented.kind === 'viewed';
    const part = (id: string): Mobject | string | undefined => {
      const mob = this.#parts.get(id)?.mob;
      return mob && viewed ? mob.key : mob;
    };
    // Marks and notes are drawn in a picture (see picture), which says what it emphasises itself.
    return (this.focused ?? []).flatMap((id): [Mobject | string, string][] => (part(id) ? [[part(id)!, 'focus']] : []));
  }
  /**
   * What a reader sees of this diagram: what it is and how big, then each shown part
   * by its words in reading order (participants and lanes first), with its emphasis,
   * and the notes on it. Parts drawn with no words are reported as blank.
   */
  describe(as: PictureShows | null = this.shown()): Description {
    const w = wordsOf(this.scene);
    const marks = as?.marks ?? new Map<string, { color: string; as: string }>(),
      kept = as?.kept ?? null;
    const [family, thing, link] = familyNames(w, this.#snapshot.family);
    // Blank parts are reported to the author, in English.
    const [english] = familyNames(wordsFor('en'), this.#snapshot.family);
    const parts: DescriptionPart[] = [];
    const blank: string[] = [];
    const journey = this.#snapshot.family === 'journey',
      stateFamily = this.#snapshot.family === 'state';
    let things = 0,
      links = 0;
    const step = this.scene.steps.at(-1)?.name;
    // A trail drawn from state (travelled marks) already says the path; a walk without one names it.
    const walked = this.walked;
    const focused = this.focused;
    const trailed = walked?.edges.every((id) => marks.get(id)?.as === w.travelled);
    if (walked && walked.step === step && !trailed && as?.walk !== false) parts.push({ name: walked.hops.join(', '), mark: w.path });
    // Notes drawn from state, in the order the stage draws them; ones no longer on stage are forgotten.
    const present = this.scene.familyMembers();
    const onStage = new Set(present);
    for (const m of [...this.drawnNotes.keys()]) if (!onStage.has(m)) this.drawnNotes.delete(m);
    for (const m of present) {
      const n = this.drawnNotes.get(m);
      if (n) parts.push({ name: w.beside(n.text, this.nameOf(n.id)), mark: w.note });
    }
    const order = [...this.#order].sort((a, b) => +!isScaffold(this.#parts.get(a)!.info) - +!isScaffold(this.#parts.get(b)!.info));
    for (const id of order) {
      const info = this.#parts.get(id)!.info;
      // Axes, titles and legends are summed up in what the chart is.
      if (!this.#visible.has(id) || /axis|title|legend/.test(info.role)) continue;
      // A point's label is said with its point.
      if (id.endsWith(':label') && this.#visible.has(id.slice(0, -6))) continue;
      // A slice's share label is said with its slice.
      if (id.startsWith('slice-label:') && this.#visible.has('slice:' + id.slice(12))) continue;
      // A journey's score guide is its scale, said in what the chart is.
      if (id === 'score-guide') continue;
      const name = this.nameOf(id);
      if (!name) {
        if (!isScaffold(info)) blank.push(`${english} part ${id}`);
        continue;
      }
      if (info.from && info.to) links++;
      // A line through the things (a journey's experience curve) is not one of them. In a state
      // diagram a composite (drawn as a group) is a state, and a `[*]` dot is not.
      else if (
        (!isScaffold(info) || info.role === 'actor' || (stateFamily && info.role === 'group')) &&
        info.role !== 'series' &&
        !(stateFamily && pseudostate(info))
      )
        things++;
      // A part in focus is said to be, unless a mark says more.
      const mark = marks.get(id)?.as ?? (focused?.includes(id) ? w.focused : undefined);
      const dimmed = !!kept && !kept.has(id) && !isScaffold(info);
      parts.push({ name, ...(mark ? { mark } : {}), ...(dimmed ? { dimmed } : {}) });
    }
    const title = this.words('title');
    // A journey's scale is its score guide's digits; its actors are the ones its tasks name.
    const scale = journey ? this.words('score-guide').split(' ').map(Number).filter(Number.isFinite) : [];
    const actors = journey ? journeyActors(this.#snapshot.spec.source) : [];
    // A radar's spokes and its scale, from the centre out, as its source gives them.
    const radar = this.#snapshot.family === 'radar' ? radarData(this.#snapshot.spec.source) : undefined;
    const spokes = radar?.axes.length ? `${w.count(radar.axes.length, w.axis)} ${w.span(w.number(radar.min), w.number(radar.max))}` : '';
    const size =
      this.#snapshot.family === 'xychart'
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
  /** Each family member's style for part `id` as the diagram draws it, marked in `color` and dimmed or not. */
  private styled(id: string, color: string | undefined, dim: boolean): Style[] {
      const p = this.#parts.get(id)!;
      const fam = p.mob.family();
      const base = this.base.get(id)!;
      const connector = !!(p.info.from && p.info.to);
      const within = (m: Mobject, test: (a: Mobject) => boolean) => {
        for (let a: Mobject | null = m; a && a !== p.mob; a = a.parent) if (test(a)) return true;
        return false;
      };
      return fam.map((m, i) => {
        const b = base[i]!,
          st: Style = { ...b };
        if (this.zoom !== 1) scaleStyle(st, this.zoom);
        const text = within(m, (a) => !!labelOf(a));
        // Labels and other owned subjects keep their look. Cardinality marks
        // and explicitly captured marker carriers take their connector's mark.
        const partId = (a: Mobject) => this.partIds.get(a);
        const owned = within(m, (a) => partId(a) != null && partId(a) !== id && !partId(a)!.startsWith('card:') &&
          !this.#parts.get(partId(a)!)?.info.markerCarrier);
        const marker = p.info.markerCarrier || within(m, (a) => !!partId(a) && !!this.#parts.get(partId(a)!)?.info.markerCarrier);
        // Paper inside an aggregation diamond or inheritance triangle denotes
        // a hollow marker. Colour its outline without turning it solid.
        const paper = parseColor(this.#snapshot.palette.paper);
        const hollow = marker && parseColor(st.fill)?.every((v, i) => v === paper?.[i]);
        if (color && !owned && !text) {
          // Any stroke with a width takes the mark, whatever its opacity now (not paintsStroke):
          // a mark recolours the outline the part has, shown or not.
          if (st.stroke && st.stroke !== 'none' && (st.strokeWidth ?? 0) > 0) {
            st.stroke = color;
            st.strokeWidth = (st.strokeWidth ?? 0) * 1.8;
          }
          if (paintsFill(st) && !hollow) {
            st.fill = connector ? color : blendPaint(st.fill!, color, 0.2);
            // A shape drawn by fill alone (a bar, a task) gains an outline: the mark shows by shape, not only hue.
            if (!connector && !(st.stroke && st.stroke !== 'none' && (st.strokeWidth ?? 0) > 0)) {
              Object.assign(st, { stroke: color, strokeOpacity: 1, strokeWidth: 0.04 * this.zoom });
            }
          }
        }
        if (dim) st.opacity = (b.opacity ?? 1) * this.dimmed;
        return st;
      });
  }
  /** Put each of these parts in its plain look at the current zoom, in place. */
  private restyle(ids: Iterable<string>): void {
    for (const id of new Set(ids)) {
      const fam = this.#parts.get(id)!.mob.family();
      const styles = this.styled(id, undefined, false);
      fam.forEach((m, i) => (m.style = { ...styles[i]! } as typeof m.style));
    }
  }
  /** How the diagram is on the stage now: detached, live (with the view it replaced), or viewed by a view (see DiagramPresentation). */
  private presented: DiagramPresentation = DETACHED;
  get presentation(): DiagramPresentation {
    return this.presented;
  }
  /**
   * Show this diagram by `view`, a picture drawn from it (see picture()) that the scene shows: the
   * live diagram leaves the stage, and the stage describes the diagram as the view shows it.
   * `s.diagramView` calls it; a scene that draws its own view calls it after adding the view.
   * A reveal, an enlargement or a morph then needs `s.liveDiagram(d)` first.
   */
  showBy(view: Mobject): this {
    if (view === this.#root) throw new Error('d.showBy(): the live diagram cannot be its own view; give the view that draws a picture of it');
    this.scene.remove(this.#root);
    this.presented = { kind: 'viewed', view };
    return this;
  }
  /** @internal The live diagram back on the stage in its view's place (the stage's liveDiagram); gives the view it replaces. */
  showLive(): Mobject {
    const p = this.presented;
    if (p.kind !== 'viewed') throw new Error('s.liveDiagram(): the diagram is not shown by a view; show it with s.diagramView(d, draw) first');
    this.scene.remove(p.view);
    this.scene.add(this.#root);
    this.presented = { kind: 'live', replaced: p.view };
    return p.view;
  }
  /**
   * The marks a walk's trail leaves along these hops, for a picture drawn from state (see picture,
   * and stage.diagramView): each link travelled, in `color` (the diagram's emphasis colour), said as travelled.
   */
  trail(hops: readonly (readonly [string, string])[], color: string = this.#emphasis): Record<string, { color: string; as: string }> {
    return Object.fromEntries(hops.map(([from, to]) => [this.link(from, to).id, { color, as: wordsOf(this.scene).travelled }]));
  }
  /** The link from `from` to `to`, its endpoints resolved as walk resolves them: its id, its part and its route. */
  link(from: string, to: string): { id: string; mob: Group; route: VMobject } {
    const [a, b] = [this.end(from), this.end(to)];
    const edge = [...this.#parts.values()].find(
      (p) => p.info.from != null && p.info.to != null && this.end(p.info.from) === a && this.end(p.info.to) === b,
    );
    if (!edge?.route || !edge.route.numCurves()) throw new RangeError(`d.link(): ${from} -> ${to} is not a link of this diagram`);
    return { id: edge.info.id, mob: edge.mob, route: edge.route };
  }
  /**
   * The whole diagram, copied, with the parts in `marks` (id to colour) in the look a mark gives
   * them: a picture of the diagram that a view can draw from state, so marks such as a trail are
   * part of that state. It carries the diagram's keys; once a view shows it, take the live
   * diagram off the stage and call showBy(view), so each key is on stage once.
   *
   * `notes` adds a note beside each named part, as `note` draws and places one (see notePicture):
   * the picture is then a Group of the diagram and its notes, which sit over it unclipped. `dim`
   * fades every part but these, as `dim` does. `prefix` goes in front of every key in the picture
   * (a note's is `note:<id>`), so two pictures
   * of one diagram can be on stage together. Marks, notes and dimming name parts by their ids in
   * the diagram, unprefixed.
   *
   * While a view shows the picture (see showBy), the stage describes the diagram as the picture
   * shows it, as it describes the live diagram: its notes and its dimming, and each mark given as
   * `{ color, as }` by its word (a mark given as a colour alone is drawn, not said).
   */
  picture(
    marks: Readonly<Record<string, string | { color: string; as?: string }>> = {},
    { notes = [], dim, prefix = '' }: { notes?: readonly PictureNote[]; dim?: readonly string[] | null; prefix?: string } = {},
  ): Group {
    const copy = this.#root.copy();
    const live = this.#root.family(), drawn = copy.family();
    const at = new Map(live.map((m, i) => [m, i] as const));
    // A mark given as a colour alone is said as marked, in the scene's language.
    const word = wordsOf(this.scene).marked;
    for (const n of notes) this.top(n.id, 'd.picture()');
    const marked = new Map(Object.entries(marks).map(([id, m]) => [this.top(id, 'd.picture()'), typeof m === 'string' ? { color: m, as: word } : { as: word, ...m }] as const));
    const kept = dim ? this.keptOf(dim) : null;
    // Every part in the diagram's own look, whatever the live diagram shows now: revealed parts as
    // drawn or marked, the rest unseen.
    for (const [id, part] of this.#parts) {
      // An owned part (a link's label) is styled with its owner's family.
      if (!this.base.has(id)) continue;
      const dimmed = !!kept && !kept.has(id) && !isScaffold(part.info);
      const styles = this.styled(id, marked.get(id)?.color, dimmed), shown = this.#visible.has(id);
      part.mob.family().forEach((m, k) => {
        const i = at.get(m);
        if (i === undefined) return;
        drawn[i]!.style = { ...styles[k]! } as typeof m.style;
        if (!shown) drawn[i]!.style.opacity = 0;
      });
    }
    copy.setStyle({ opacity: 1 }, false);
    if (prefix) for (const m of copy.family()) if (m.key !== undefined) m.key = prefix + m.key;
    const pictured = notes.length ? new Group(copy, ...notes.map((n) => this.notePicture(n.id, n.text, { ...n, key: `${prefix}note:${n.id}` }))) : copy;
    const said = new Map([...marked].flatMap(([id, m]) => (m.as ? [[id, { color: m.color, as: m.as }] as const] : [])));
    Object.assign(pictured, { [pictureShows]: { marks: said, kept } });
    // What it marks is emphasis, as the live diagram's marks are: each marked part by its key here.
    const emphasis: [string, string][] = [...marked].flatMap(([id, m]): [string, string][] => {
      const key = this.#parts.get(id)?.mob.key;
      return key === undefined ? [] : [[prefix + key, m.as ? `mark ${m.color} ${m.as}` : `mark ${m.color}`]];
    });
    // Described with the diagram while it shows it; on its own, as the diagram it pictures.
    // Read from the part it is called on, so a picture that takes this one's fields (a view landing
    // it with become) answers for itself, not for the copy it was drawn as.
    const diagram = this;
    return selfDescribed(
      pictured,
      function (this: Mobject) { return diagram.shows(this) ? { what: '', parts: [] } : diagram.describe({ marks: said, kept, walk: false }); },
      () => emphasis,
    );
  }
  /**
   * @internal Whether the stage describes this diagram now: it is live, or viewed by a view that is
   * on stage. Being on stage is the scene's fact, read now, not a copy kept here: a scene can take
   * the live root or the view off the stage itself (`this.remove`, a FadeOut, `clear()`), and the
   * diagram is told of none of those.
   */
  described(): boolean {
    const p = this.presented;
    // The stage describes the diagram as a step ends (the trace reads what it shows then) and as the
    // next begins, so the refusal names this.step().
    // The one record of how the diagram is presented is `presented`; the scene's membership says only whether that is on stage now.
    if (p.kind === 'viewed' && onStage(this.scene, this.#root))
      throw new Error(`this.step(): the diagram's root is on the stage while a view shows the diagram, so each of its keys is drawn twice; take it off, or call s.liveDiagram(d) to show the live diagram in the view's place`);
    if (p.kind === 'live' && p.replaced && onStage(this.scene, p.replaced) && onStage(this.scene, this.#root))
      throw new Error(`this.step(): the diagram's root is on the stage beside the view it replaced, so each of its keys is drawn twice; take the view off, or call s.diagramView(d) to show the diagram by it again`);
    return p.kind === 'live' ? onStage(this.scene, this.#root) : p.kind === 'viewed' && onStage(this.scene, p.view);
  }
  /** Whether `m` is, or is inside, the view that shows this diagram, while that is on stage. */
  private shows(m: Mobject): boolean {
    const p = this.presented;
    if (p.kind !== 'viewed' || !onStage(this.scene, p.view)) return false;
    for (let x: Mobject | null = m; x; x = x.parent) if (x === p.view) return true;
    return false;
  }
  /** The picture of this diagram that shows it now, when a view shows it: what it marks and dims. */
  private shown(): PictureShows | null {
    const p = this.presented;
    if (p.kind !== 'viewed') return null;
    for (const m of p.view.family()) {
      const shows = (m as Mobject & { [pictureShows]?: PictureShows })[pictureShows];
      if (shows) return shows;
    }
    return null;
  }
  /**
   * A note beside part `id` as `note` draws and places one, without drawing it in: for a view's
   * draw to build from state. It describes itself (“text” beside the part) and says that it
   * emphasises it, as a note does; keyed `note:<id>` unless `key` says otherwise.
   */
  notePicture(
    id: string,
    text: string,
    { side = 'above', color = this.#emphasis, size = 0.22, key = `note:${id}` }: { side?: NoteSide; color?: string; size?: number; key?: string } = {},
  ): Group {
    const g = this.noteLook(text, color, size);
    g.moveTo(notePosition(g, this.part(id, 'd.notePicture()').mob.box()!, side, this.frameBox));
    g.key = key;
    const w = wordsOf(this.scene);
    this.drawnNotes.set(g, { id, text });
    // While the diagram is described, the note is one of its parts, as a live note is; otherwise it says itself.
    return selfDescribed(
      g,
      () => (this.described() ? { what: '', parts: [] } : { what: w.note, parts: [{ name: w.beside(text, this.nameOf(id)) }] }),
      function (this: Mobject) { return [[this, `note ${text}`]] as const; },
    );
  }
  /** A note's label on its raised, outlined paper, at the origin. */
  private noteLook(text: string, color: string, size: number): Group {
    const label = new Text(text, { fontSize: size, color, shaping: this.scene.textShaping });
    const bg = new Rectangle({
      width: label.width() + size * 1.4,
      height: size * 1.85,
      fill: raised(this.#snapshot.palette),
      stroke: color,
      strokeWidth: 0.014,
      cornerRadius: 0.08,
    });
    label.moveTo(bg.center());
    return new Group(bg, label);
  }
  /** The parts a picture's `dim` keeps: these, what a kept group draws inside it, and the links between kept parts. */
  private keptOf(keep: readonly string[]): Set<string> {
    const kept = new Set(keep.map((id) => this.top(id, 'd.picture()')));
    // Members are not recorded on a group's parts, but the layout draws them inside its box.
    const within = (inner: Box, outer: Box) =>
      inner[0] >= outer[0] - 1e-6 && inner[1] >= outer[1] - 1e-6 && inner[2] <= outer[2] + 1e-6 && inner[3] <= outer[3] + 1e-6;
    for (const id of [...kept]) {
      const group = this.#parts.get(id)!;
      const outer = group.info.role === 'group' ? group.mob.box() : null;
      if (outer)
        for (const p of this.#parts.values()) {
          const box = !p.info.owner && p !== group && !(p.info.from && p.info.to) ? p.mob.box() : null;
          if (box && within(box, outer)) kept.add(p.info.id);
        }
    }
    for (const p of this.#parts.values())
      if (!p.info.owner && p.info.from && p.info.to && !kept.has(p.info.id)) {
        if ([p.info.from, p.info.to].every((n) => kept.has(this.end(n)))) kept.add(p.info.id);
      }
    return kept;
  }
  /**
   * Tokens travel the diagram's own links. Consecutive hops that join up are
   * one journey with one token. To leave the path marked for the step's resting
   * frame, draw `trail(hops)` in the diagram's picture (see stage.diagramView).
   */
  walk(
    hops: readonly (readonly [string, string])[],
    {
      runTime = 0.8,
      color = this.#emphasis,
      parallel = false,
    }: { runTime?: number; color?: string; parallel?: boolean } = {},
  ): Action {
    return new Action(this.scene, 'd.walk()', () => this.walkPlan(hops, runTime, color, parallel));
  }
  /** A walk, decided now: its hops' links, checked to be real; that they are revealed is checked when it plays. */
  private walkPlan(hops: readonly (readonly [string, string])[], runTime: number, color: string, parallel: boolean): Plan<void> {
    // A token travels the live diagram's routes, where a picture of it draws them too.
    // Endpoints resolve as `get` resolves ids (so 'actor:A' and 'A' name the same participant).
    const path = hops.map(([from, to]) => {
      const [a, b] = [this.end(from), this.end(to)];
      const edge = [...this.#parts.values()].find(
        (p) => p.info.from != null && p.info.to != null && this.end(p.info.from) === a && this.end(p.info.to) === b,
      );
      if (!edge?.route || !edge.route.numCurves())
        throw new RangeError(`d.walk(): ${from} -> ${to} is not a link of this diagram`);
      return { edge, from, to, a, b };
    });
    const record = ({ edge, from, to }: (typeof path)[number]) =>
      recordWalk(this.scene, { step: this.scene.currentStep?.name, from, to, edge: edge.info.id });
    const start = () => {
      for (const { edge } of path) if (!this.#visible.has(edge.info.id)) throw new Error(`d.walk(): the link ${edge.info.id} is not revealed; reveal it first`);
      this.walked = {
        step: this.scene.currentStep?.name,
        hops: path.map(({ edge }) => wordsOf(this.scene).arrow(this.endName(edge.info.from!), this.endName(edge.info.to!))),
        edges: path.map(({ edge }) => edge.info.id),
      };
    };
    const fade = TOKEN.fade;
    if (parallel && path.length) {
      let tokens: Dot[] = [];
      return {
        value: undefined,
        start,
        beats: [
          { runTime: fade, play: () => (tokens = path.map(({ edge }) => this.token(edge.route!, color))).map((token) => new FadeIn(token, { runTime: fade })) },
          {
            runTime,
            play: () => tokens.map((token, i) => new MoveAlongPath(token, path[i]!.edge.route!, { runTime, rateFunc: linear })),
            after: () => path.forEach(record),
          },
          { runTime: fade, play: () => tokens.map((token) => new FadeOut(token, { runTime: fade })) },
        ],
      };
    }
    // Consecutive hops that join up are one journey: its token fades in before the first and out after the last.
    let token: Dot | null = null;
    const beats: Beat[] = [];
    path.forEach((hop, i) => {
      if (i === 0 || path[i - 1]!.b !== hop.a)
        beats.push({ runTime: fade, play: () => [new FadeIn((token = this.token(hop.edge.route!, color)), { runTime: fade })] });
      beats.push({ runTime, play: () => [new MoveAlongPath(token!, hop.edge.route!, { runTime, rateFunc: linear })], after: () => record(hop) });
      if (path[i + 1]?.a !== hop.b)
        beats.push({ runTime: fade, play: () => [new FadeOut(token!, { runTime: fade })], after: () => { token = null; } });
    });
    return { value: undefined, start, beats };
  }
  /** Transforms that take the shown parts to `targetFor`'s copies; hidden parts move at once. */
  private partMoves(mobs: Group[], targetFor: (m: Group) => Group, runTime: number): Transform[] {
    const shown: Transform[] = [];
    const targets = new Map<Mobject, Group>();
    for (const m of mobs) {
      const target = targetFor(m);
      targets.set(m, target);
      const animation = new Transform(m, target, { runTime });
      if (this.#visible.has(this.partIds.get(m)!)) shown.push(animation);
      else {
        animation.begin();
        animation.finish();
      }
    }
    return shown;
  }
  /**
   * Enlarge these parts, or put the whole diagram back with `'all'`. The description names the
   * enlarged parts as focused.
   *
   * The diagram's own view moves: inside its box (which clips it) the artwork scales `zoom` times
   * past a fit of the parts, notes follow, and whatever stands beside the box (cards, code, a
   * column of text) stays where it is. The camera does not move; `s.focus` moves it.
   */
  enlarge(ids: readonly string[] | 'all', { zoom = 1, runTime = 0.9 }: { zoom?: number; runTime?: number } = {}): Action {
    return new Action(this.scene, 'd.enlarge()', () => this.enlargePlan(ids, zoom, runTime));
  }
  /** An enlargement, decided now; the parts move, and hidden ones jump, when it plays. */
  private enlargePlan(ids: readonly string[] | 'all', zoom: number, runTime: number): Plan<void> {
    this.mustBeLive('d.enlarge()');
    if (!(zoom > 0 && Number.isFinite(zoom))) throw new RangeError(`d.enlarge(): zoom must be a positive number, not ${zoom}`);
    const mobs = this.topMobs();
    // Whether the play has anything to show: a shown part moves (partMoves moves hidden ones at once).
    const shows = mobs.some((m) => this.#visible.has(this.partIds.get(m)!));
    if (ids === 'all') {
      const back = this.homeward(mobs);
      return {
        value: undefined,
        beats: [{
          runTime: back && shows ? runTime : 0,
          play: () => {
            this.focused = null;
            return back ? this.partMoves(mobs, (m) => moved(m, back.k, back.from, back.to), runTime) : [];
          },
          after: () => { if (back) this.rezoom(1); },
        }],
      };
    }
    if (!ids.length) throw new RangeError("d.enlarge(): it needs at least one part, or 'all'");
    const tops = [...new Set(ids.map((id) => this.top(id, 'd.enlarge()')))];
    const chosen = new Group(...ids.map((id) => this.part(id, 'd.enlarge()').mob.copy()));
    const center = chosen.center(),
      box = this.frameBox;
    const k =
      Math.min(
        (box[2] - box[0]) / Math.max(0.1, chosen.width()),
        (box[3] - box[1]) / Math.max(0.1, chosen.height()),
      ) *
      0.78 *
      zoom;
    return {
      value: undefined,
      beats: [{
        runTime: shows ? runTime : 0,
        play: () => {
          this.focused = tops;
          return this.partMoves(mobs, (m) => moved(m, k, center, boxCenter(box)), runTime);
        },
        after: () => this.rezoom(this.zoom * k),
      }],
    };
  }
  /** The top-level parts' mobjects. */
  private topMobs(): Group[] {
    return [...this.#parts.values()].filter((p) => !p.info.owner).map((p) => p.mob);
  }
  /**
   * The move that puts the diagram's own view back home: one uniform map from the parts' bounds now
   * to the authored frame, or null when there is no extent to restore.
   */
  private homeward(mobs: Group[]): { k: number; from: Vec; to: Vec } | null {
    const home = this.home.box(),
      now = new Group(...mobs.map((m) => m.copy())).box();
    if (!home || !now) return null;
    // The map is uniform, so either extent gives k; the longer one is measured more precisely
    // (a thin diagram's short side is mostly float32 rounding once zoomed).
    const wide = home[2] - home[0] >= home[3] - home[1];
    const k = wide ? (home[2] - home[0]) / (now[2] - now[0]) : (home[3] - home[1]) / (now[3] - now[1]);
    // A diagram fitted down to a point (an absurd canvas size) has no extent to restore.
    if (!(Number.isFinite(k) && k > 0)) return null;
    return { k, from: [(now[0] + now[2]) / 2, (now[1] + now[3]) / 2], to: [(home[0] + home[2]) / 2, (home[1] + home[3]) / 2] };
  }
  /** Undo an enlargement at once, without animating: every part back in the authored frame, at zoom 1. */
  private unzoom(): void {
    if (this.zoom === 1) return;
    const mobs = this.topMobs(), back = this.homeward(mobs);
    if (back)
      for (const m of mobs) {
        const jump = new Transform(m, moved(m, back.k, back.from, back.to));
        jump.begin();
        jump.finish();
      }
    this.zoom = 1;
  }
  /**
   * The diagram's view has moved: re-derive every look from the home styles at the new zoom (the move
   * already animated it), so a look depends only on zoom, never on the order
   * of calls, and returning to 'all' restores the home styles exactly.
   */
  private rezoom(zoom: number): void {
    this.zoom = zoom;
    this.restyle(this.base.keys());
  }
  /**
   * Same-id parts glide to their next place; arrivals fade in, departures fade
   * out. The next diagram starts plain, with no walk or focus.
   * The next diagram keeps this one's style unless it names its own.
   */
  morph(
    next: DiagramSpec,
    { ops, runTime = 1.1 }: { ops?: readonly MutationOp[]; runTime?: number } = {},
  ): Action {
    this.mustBeLive('d.morph()');
    if (next.style == null && this.#spec.style != null) next = { ...next, style: this.#spec.style };
    // The next diagram's layout is read now; a play waits for it.
    const before = this.#spec, spec = next;
    let snapshot: DiagramSnapshot | null = null;
    const reading = (async () => {
      const resolver = resolverOf(this.scene, 'd.morph()');
      if (ops && resolver.morph) await resolver.morph(before, spec, ops);
      snapshot = await resolver.diagram(spec);
    })();
    let target: Diagram | null = null;
    return new Action(this.scene, 'd.morph()', () => ({
      value: undefined,
      beats: [{
        runTime,
        play: () => {
          this.mustBeLive('d.morph()');
          target = new Diagram(this.scene, spec, snapshot!, { box: this.frameBox });
          // The frame keeps its key through the morph.
          const frame = target.#parts.get('__frame');
          if (frame) frame.mob.key = target.frameKey = this.frameKey;
          const animations = [];
          for (const [id, p] of this.#parts)
            if (!p.info.owner && this.#visible.has(id)) {
              const q = target.#parts.get(id);
              animations.push(q ? new Transform(p.mob, q.mob, { runTime }) : new FadeOut(p.mob, { runTime }));
            }
          for (const [id, q] of target.#parts)
            if (!q.info.owner && !this.#visible.has(id)) animations.push(new FadeIn(q.mob, { runTime }));
          return animations;
        },
        after: () => this.takeOver(target!, spec, snapshot!),
      }],
    }), { ready: reading });
  }
  /** Exact handoff to the freshly read tree a morph built, retaining semantic route references. */
  private takeOver(target: Diagram, next: DiagramSpec, snapshot: DiagramSnapshot): void {
    this.scene.remove(this.#root);
    for (const p of target.#parts.values())
      if (!p.info.owner) {
        this.scene.remove(p.mob);
        target.root.add(p.mob);
      }
    this.scene.add(target.root);
    this.goLive();
    this.#parts = target.#parts;
    this.partIds = target.partIds;
    this.#order = target.#order;
    this.#root = target.#root;
    this.home = target.home;
    this.#visible = new Set(this.#parts.keys());
    this.#spec = next;
    this.#snapshot = snapshot;
    // A new style brings its own emphasis colour and dimming.
    this.#emphasis = target.#emphasis;
    this.dimmed = target.dimmed;
    this.base = target.base;
    this.zoom = 1;
    this.plain();
  }
  /** No walk or focus: the state a fresh or morphed diagram starts in. */
  private plain(): void {
    this.walked = null;
    this.focused = null;
  }
  /** Fade the whole diagram out. `reveal` can bring parts back. */
  hide(): Action {
    return new Action(this.scene, 'd.hide()', () => {
      // Shown by a view, with the live diagram off the stage: the view fades, as the live parts would.
      const p = this.presented;
      const shown = p.kind === 'viewed'
        ? (onStage(this.scene, p.view) ? [p.view] : [])
        : [...this.#visible].filter((id) => !this.#parts.get(id)!.info.owner).map((id) => this.#parts.get(id)!.mob);
      return {
        value: undefined,
        beats: [{ runTime: shown.length ? 0.4 : 0, play: () => shown.map((m) => new FadeOut(m, { runTime: 0.4 })) }],
        end: () => this.forget(),
      };
    });
  }
  /**
   * @internal Reset to unrevealed, unemphasised and detached, without animating (the stage has faded
   * it): no view shows it, its notes are forgotten, and an enlargement is undone.
   */
  forget(): void {
    this.plain();
    this.unzoom();
    this.restyle(this.base.keys());
    this.#visible.clear();
    this.drawnNotes.clear();
    for (const child of [...this.#root.children]) this.#root.remove(child);
    // Off stage, so the description stops naming it; `reveal` attaches it again.
    const p = this.presented;
    if (p.kind === 'viewed') this.scene.remove(p.view);
    this.scene.remove(this.#root);
    this.presented = DETACHED;
  }
}
