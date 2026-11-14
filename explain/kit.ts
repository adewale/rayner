// The kit: the default way to draw an explanation by hand. A type scale with a floor a phone can
// read, spacing, strokes and radii; colours by role, from the stage's look; a line of words; a
// labelled box and a label on a plate; a connector with rounded corners; and transitions that play
// in beats, with parts that fly along a route. Imported as `rayner/kit`; docs/REFERENCE.md ("Kit")
// lists it and docs/TUTORIAL.md draws with it.
//
// It is the reusable part of the Poppy series' visual system (scenes/explainers/lib/poppy-kit.ts),
// without Poppy's colours and objects: test/kit.test.ts checks that the two still draw and play
// alike. `rayner/drawing` keeps the ready-made pictures (tables, bars, cards, callouts); the two
// share their conventions: the stage first, then what the picture shows, then one options object.
import { AnimationGroup, Line, Rectangle, Succession, Text, keyed } from '../src/index.ts';
import type { Animation, Mobject, Style, Vec, Group } from '../src/index.ts';
import type { Choreography } from './choreograph.ts';
import type { Stage } from './stage.ts';

// ---------------------------------------------------------------------------------------------
// Measures

/**
 * Four type sizes, in scene units, and no others. `small` is the floor: 0.56 units is 12.5 CSS px
 * on a 358 px phone stage, the smallest size `rayner review` accepts there. Hierarchy comes from
 * the jump from `small` to `title` or `display`, and from weight, not from many sizes.
 */
export const TYPE = { small: 0.56, label: 0.64, title: 0.8, display: 1.6 } as const;
/** The smallest text size the kit sets, in units: `TYPE.small`. `words()` refuses anything smaller. */
export const MIN_TEXT = TYPE.small;
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
/** The height of an opaque plate that hides a line behind a label of `TYPE.small` or `TYPE.label`. */
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
// Words

/** How `words` sets a line of text. */
export type WordsOptions = {
  /** The anchor point: the start, middle or end of the line (per `align`), at the line's vertical centre. Default [0, 0]. */
  at?: Vec;
  /** One of `TYPE`'s sizes; default `TYPE.small`. Anything under `MIN_TEXT` is refused. */
  size?: number;
  /** Default: the stage's ink. */
  color?: string;
  bold?: boolean;
  /** JetBrains Mono, for literals: names in code, hosts, IDs, numbers a reader may copy. */
  mono?: boolean;
  /** Which end of the line `at` is: 'start' (default), 'middle' or 'end'. */
  align?: 'start' | 'middle' | 'end';
};

/**
 * One line of text in the kit's type: Inter, or JetBrains Mono with `mono`, at one of `TYPE`'s sizes,
 * in the stage's ink unless given a colour, shaped as the scene shapes text. `at` is the start,
 * middle or end of the line (per `align`), at its vertical centre. A size under `MIN_TEXT` is a
 * RangeError: a fact that does not fit at `TYPE.small` belongs in the caption or the description.
 * Returns an unkeyed Text; its `width()` is its measured width.
 */
export function words(s: Stage, value: string, { at = [0, 0], size = TYPE.small, color = s.look.ink, bold = false, mono = false, align = 'start' }: WordsOptions = {}): Text {
  if (!(size >= MIN_TEXT - 1e-9)) throw new RangeError(`words(): ${JSON.stringify(value)} at ${size} units is under MIN_TEXT (${MIN_TEXT}), which a phone cannot read; put the fact in the caption instead`);
  return new Text(value, { fontSize: size, color, shaping: s.scene.textShaping, anchor: align, ...(bold ? { weight: 'bold' as const } : {}), ...(mono ? { font: 'mono' as const } : {}) })
    .moveTo(at, [align === 'start' ? -1 : align === 'end' ? 1 : 0, 0]);
}

// ---------------------------------------------------------------------------------------------
// Keyed parts

/** A collector of keyed parts, as `keyedParts()` from `rayner/drawing` returns one. */
export type Parts = { add<T extends Mobject>(m: T, key: string): T; group(): Group };
/**
 * Adds a composite's parts (each already keyed, as `box` and `plate` key theirs) to a `keyedParts()`
 * collector, by their own keys. A part with no key is refused.
 */
export function addAll(parts: Parts, list: readonly Mobject[]): void {
  for (const m of list) {
    if (!m.key) throw new Error('addAll(): a part has no key; kit composites key every part they return');
    parts.add(m, m.key);
  }
}

// ---------------------------------------------------------------------------------------------
// Boxes, plates and connectors

/** Options for `box`. */
export type BoxOptions = {
  /** The box's centre. Default [0, 0]. */
  at?: Vec;
  /** Prefix of the parts' keys: `<key>:box` and `<key>:label`. */
  key: string;
  /** Default: the label's width plus `SPACE.m` on each side. */
  width?: number;
  /** Default `PLATE_HEIGHT`. */
  height?: number;
  /** The box in use: an ink outline at `STROKE.bold` and bold words. Otherwise an idle outline at `STROKE.fine`. */
  active?: boolean;
  /** Text size; default `TYPE.small`. */
  size?: number;
  mono?: boolean;
  /** Corner radius; default `RADIUS.small`. */
  radius?: number;
};

/**
 * A labelled box: a body in the raised tone, its outline idle or (when `active`) ink and bold, and
 * its label centred on it in `words`. Sized to its label unless given a `width`. Returns two parts,
 * keyed `<key>:box` and `<key>:label`, so a transition can replace the words and morph the box apart;
 * add them to a picture with `addAll(parts, box(...))`.
 */
export function box(s: Stage, text: string, { at = [0, 0], key, width, height = PLATE_HEIGHT, active = false, size = TYPE.small, mono = false, radius = RADIUS.small }: BoxOptions): Mobject[] {
  const t = tones(s);
  const label = words(s, text, { at, align: 'middle', size, mono, bold: active });
  const body = new Rectangle({ width: width ?? label.width() + 2 * SPACE.m, height, fill: t.raised, stroke: active ? t.ink : t.idle, strokeWidth: active ? STROKE.bold : STROKE.fine, cornerRadius: radius }).moveTo(at);
  return [keyed(body, `${key}:box`), keyed(label, `${key}:label`)];
}

/** Options for `plate`. */
export type PlateOptions = Omit<WordsOptions, 'at'> & {
  /** Where the words stand, as `words` places them. */
  at: Vec;
  /** Prefix of the parts' keys: `<key>:plate` and `<key>:label`. */
  key: string;
  /** Space on each side of the words; default 0.18, as on the Poppy series' lane names. */
  padding?: number;
};

/**
 * A label set on an opaque plate of the ground's colour, so a line that runs behind it is hidden
 * where the words sit, as a transit map sets a line's name on the line. Returns two parts, keyed
 * `<key>:plate` and `<key>:label`; the plate comes first, so the words paint over it.
 */
export function plate(s: Stage, text: string, { at, key, padding = 0.18, ...style }: PlateOptions): Mobject[] {
  const label = words(s, text, { at, ...style });
  const w = label.width(), align = style.align ?? 'start';
  const centre = align === 'start' ? at[0] + w / 2 : align === 'end' ? at[0] - w / 2 : at[0];
  const back = new Rectangle({ width: w + 2 * padding, height: PLATE_HEIGHT, fill: s.look.paper, stroke: 'none' }).moveTo([centre, at[1]]);
  return [keyed(back, `${key}:plate`), keyed(label, `${key}:label`)];
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
