import { AnimationGroup, Circle, Group, Line, Rectangle, Succession, Text, VMobject, keyed } from '../../../src/index.ts';
import type { Animation, Mobject, Style, Vec } from '../../../src/index.ts';
import type { Choreography, Stage } from '../../../explain/index.ts';
import { emphasised } from '../../../explain/drawing.ts';

/*
 * THE POPPY KIT: the visual system of the Poppy series (Personal Agent Protocol, draft 1.0), as code.
 * Every chapter draws with it, so the same thing looks the same in every chapter.
 *
 * THE IDEA. Night-blue ground, and on it real objects from the protocol's world: a wax seal, a cut
 * key, a ticket, a counter, a ledger, sheets of paper. Shape and position say what a thing is and
 * how it fared before colour does. Nothing is boxed unless the box is an object (a sheet, a window,
 * a ticket, a phone). No icon tiles, no cards in cards, no glow, no gradients, no shadows.
 *
 * GROUND AND PALETTE. Each colour has one meaning, and no colour means "good" or "bad".
 *   GROUND  #13203b  the night desk everything sits on. Pass PALETTE to stage().
 *   INK     #f3efe6  words, and whatever is in use: the active lane, the counter's face, paper.
 *   SOFT    #aeb8cc  secondary words (about 8:1 on the ground).
 *   STEEL   #5f7299  idle: lanes not in use, empty slots, a key not yet cut. Never words.
 *   RAISED  #1d2c4c  the body of a structure: the station, the counter, a device, a window.
 *   RULE    #34476e  hairlines that separate (ledger rules).
 *   WAX     #e5432c  poppy red: the agent's own seal, its signature (the Session header). Nothing else.
 *   BRASS   #e3a92f  a key: access the User granted (an access token, its scopes).
 *   PEWTER  #9aa5bd  a seal that is not the agent's: another agent, a thief, the Company Agent.
 *   PRINT   #13203b  words printed on paper; PAPER_LINE #c9c1b1 rules printed on paper.
 * WAX, BRASS and PEWTER each come with a DEEP and LIGHT tone for the object's own relief.
 *
 * TYPE. Inter and JetBrains Mono (the two embedded faces), four sizes and no others:
 *   TYPE.small   0.56  nearly every word: names, lane names, ledger rows and heading (bold), the
 *                      asked line, an answer's meaning; protocol literals in mono. The floor:
 *                      0.56 units is 12.5 px on a 358 px phone stage. Never smaller.
 *   TYPE.label   0.64  a quiet notice standing alone in an empty place ("no way in yet").
 *   TYPE.title   0.8   bold, one per picture: the answer's phrase ("Unauthorized").
 *   TYPE.display 1.6   mono bold, status numbers only (200, 401).
 * Hierarchy comes from the jump between small and title/display and from weight, not from many
 * sizes. Protocol literals (hosts, IDs, scopes, status codes, file names) are always mono. Sentence
 * case everywhere; bold marks the live thing (the lane in use, a changed value, a heading), not
 * decoration. Width budget at 0.56: Inter about 0.27 units a character (bold 0.3), mono 0.336.
 * Measure with `words(...).width()`. A fact that does not fit at 0.56 goes into the caption or the
 * picture's description, never into smaller type.
 *
 * LINES. STROKE.hair 0.035 (rules), fine 0.06 (outlines of objects), line 0.1 (idle lanes, rings),
 * bold 0.16 (the lane in use). Objects are mostly filled shapes; outlines are for ghosts.
 * RADII. RADIUS.paper 0.05, ticket 0.08, panel 0.16 (windows, bubbles), device 0.26 (a phone).
 * SPACE. Multiples of 0.14: SPACE.xs 0.14, s 0.28, m 0.42, l 0.7, xl 1.12. Related things sit
 * xs-s apart, separate groups l-xl apart. Keep text inside MARGIN (x within ±7.65, y within ±4.15).
 *
 * OUTCOMES WITHOUT SEMAPHORES. A request is a ticket. Accepted: it rests docked at its stop on the
 * Company's counter, and the stop fills. Refused: it stops short, before a barrier, the stop stays
 * open, and the answer block says the number and its phrase in words. The answer's number is
 * always INK. A change in a ledger carries a margin change bar (as revised lines in a specification
 * do) and a bold value, not a colour.
 *
 * COMPOSITION (chapter 1's grid; follow it unless the chapter's idea needs another). The stage has
 * no heading (`heading: false`). The agent's side is on the left, the Company's on the right, the
 * counter between them at about x 0.6; what the Company keeps (a ledger) stands behind the counter
 * from x 1.45 to MARGIN.right. The map takes the top band (y 4.15 to about 0); the answer block
 * sits under it on the agent's side at (MARGIN.left, -1.5), and a key to the marks or a second
 * object sits under the ledger. Text columns line up: the answer's phrase with the lane names.
 *
 * MOTION. Things come from where they really come from and stop where they really stop: a ticket
 * is stamped at the agent's seal and travels its lane; a key comes from the Company's sign-in stop
 * and goes back there; a document crosses from the party that publishes it. The lane in use lights
 * before the ticket sets off; the answer appears only once the ticket has landed. No bounce, no
 * pulse, no overshoot: `beats`, `flight` and `pass` below do this with the engine's own easing.
 *
 * CONVENTIONS. Every drawing takes the stage `s` first and one options object, `at` being the
 * object's centre unless its JSDoc says otherwise, and returns plain mobjects. A single object
 * (seal, key, ticket, sheet...) returns one unkeyed Group: key it with keyedParts().add(m, key).
 * A composite whose words change between states (station, lane, counter, ledger, answer) takes a
 * `key` and returns a list of parts already keyed `<key>:<part>`; add them with addAll(parts, list).
 */

// ---------------------------------------------------------------------------------------------
// System constants

/** The series' colours, each with one meaning (see the note at the top of this file). */
export const TONE = {
  ground: '#13203b',
  raised: '#1d2c4c',
  rule: '#34476e',
  steel: '#5f7299',
  soft: '#aeb8cc',
  ink: '#f3efe6',
  paper: '#f3efe6',
  print: '#13203b',
  paperLine: '#c9c1b1',
  wax: '#e5432c',
  waxDeep: '#a52a19',
  waxLight: '#ff9478',
  brass: '#e3a92f',
  brassDeep: '#9a6810',
  brassLight: '#f8db8a',
  pewter: '#9aa5bd',
  pewterDeep: '#566079',
  pewterLight: '#d3d9e5',
} as const;

/** The stage's palette for `stage(this, { palette: { ...PALETTE }, heading: false })`. */
export const PALETTE = { paper: TONE.ground, ink: TONE.ink, accent: TONE.wax, muted: TONE.steel } as const;

/** The four type sizes, in units. Nothing is set smaller than TYPE.small. */
export const TYPE = { small: 0.56, label: 0.64, title: 0.8, display: 1.6 } as const;
/** Line weights, in units. */
export const STROKE = { hair: 0.035, fine: 0.06, line: 0.1, bold: 0.16 } as const;
/** Corner radii, in units. */
export const RADIUS = { paper: 0.05, ticket: 0.08, panel: 0.16, device: 0.26 } as const;
/** The spacing scale, multiples of 0.14 units. */
export const SPACE = { xs: 0.14, s: 0.28, m: 0.42, l: 0.7, xl: 1.12 } as const;
/** The stage's safe area: no text beyond these. */
export const MARGIN = { left: -7.65, right: 7.65, top: 4.15, bottom: -4.15 } as const;
/** The height of an opaque plate that hides a line behind a label of TYPE.small or TYPE.label. */
export const PLATE_HEIGHT = 0.84;

// ---------------------------------------------------------------------------------------------
// Words

/** How `words` sets a line of text. */
export type WordsOptions = {
  /** The anchor point: the start, middle or end of the line (per `align`), at the line's vertical centre. */
  at?: Vec;
  /** One of TYPE's sizes; default TYPE.small. */
  size?: number;
  color?: string;
  bold?: boolean;
  /** JetBrains Mono, for protocol literals. */
  mono?: boolean;
  /** Which end of the line `at` is: 'start' (default), 'middle' or 'end'. */
  align?: 'start' | 'middle' | 'end';
};

/**
 * One line of text in the series' type: Inter, or JetBrains Mono with `mono`, at one of TYPE's
 * sizes, in INK unless given a colour. `at` is the start, middle or end of the line (per `align`),
 * at its vertical centre. Returns an unkeyed Text; its `width()` is its measured width.
 */
export function words(s: Stage, value: string, { at = [0, 0], size = TYPE.small, color = TONE.ink, bold = false, mono = false, align = 'start' }: WordsOptions = {}): Text {
  if (size < TYPE.small - 1e-9) throw new RangeError(`words(): ${JSON.stringify(value)} at ${size} units is under TYPE.small (0.56), which a phone cannot read`);
  return new Text(value, { fontSize: size, color, shaping: s.scene.textShaping, anchor: align, ...(bold ? { weight: 'bold' as const } : {}), ...(mono ? { font: 'mono' as const } : {}) })
    .moveTo(at, [align === 'start' ? -1 : align === 'end' ? 1 : 0, 0]);
}

/** A keyedParts() collector, as `keyedParts()` from the drawing kit returns it. */
export type Parts = { add<T extends Mobject>(m: T, key: string): T; group(): Group };
/** Adds a composite's parts (each already keyed by the kit) to a keyedParts() collector, by their own keys. */
export function addAll(parts: Parts, list: readonly Mobject[]): void {
  for (const m of list) {
    if (!m.key) throw new Error('addAll(): a part has no key; kit composites key every part they return');
    parts.add(m, m.key);
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry (private): paths sampled from shapes, so every object is a filled VMobject, never an
// open Line or Arc (which the layout check would treat as a connector crossing labels).

type P = Vec;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const polar = (c: P, r: number, a: number): P => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
/** Points on an arc from angle a0 to a1 (radians, counter-clockwise when a1 > a0). */
const arc = (c: P, r: number, a0: number, a1: number, n = 16): P[] => Array.from({ length: n + 1 }, (_, i) => polar(c, r, a0 + ((a1 - a0) * i) / n));
const ring = (c: P, r: number, n = 48): P[] => arc(c, r, 0, 2 * Math.PI, n).slice(0, -1);
/** A rounded rectangle's outline, clockwise from the top-left. */
function roundRect(c: P, w: number, h: number, r: number, n = 6): P[] {
  const [x, y] = c, hw = w / 2, hh = h / 2, k = Math.min(r, hw, hh);
  return [
    ...arc([x - hw + k, y + hh - k], k, Math.PI, Math.PI / 2, n),
    ...arc([x + hw - k, y + hh - k], k, Math.PI / 2, 0, n),
    ...arc([x + hw - k, y - hh + k], k, 0, -Math.PI / 2, n),
    ...arc([x - hw + k, y - hh + k], k, -Math.PI / 2, -Math.PI, n),
  ];
}
/** One filled VMobject from closed outlines; `evenodd` cuts holes where outlines nest. */
function shape(outlines: readonly P[][], style: Style, evenodd = false): VMobject {
  const v = new VMobject({ stroke: 'none', ...style, ...(evenodd ? { fillRule: 'evenodd' as const } : {}) });
  for (const pts of outlines) {
    v.startNewPath(pts[0]!);
    for (const p of pts.slice(1)) v.addLineTo(p);
    v.closePath();
  }
  return v;
}
const fill = (outline: P[], colour: string) => shape([outline], { fill: colour });

// ---------------------------------------------------------------------------------------------
// The seal: the Session header, who is asking

/** Options for `seal`. */
export type SealOptions = {
  at?: Vec;
  /** Radius of the wax, units. Default 0.5; 0.26 on a ticket, 0.6 at a station. */
  r?: number;
  /** A seal that is not the agent's: pewter wax pressed with a six-point star instead of the poppy. */
  foreign?: boolean;
};

/**
 * A wax seal, the series' mark for the Session header ("who is asking"). An irregular spill of
 * wax with a thicker lower lip, a pressed disc with a raised rim, and the agent's emblem, a
 * four-petalled poppy, standing in relief. In WAX; with `foreign`, PEWTER pressed with a star:
 * a seal some other agent made. Size: about 2r across (default r 0.5). One unkeyed Group.
 */
export function seal(_s: Stage, { at = [0, 0], r = 0.5, foreign = false }: SealOptions = {}): Group {
  const [base, deep, light] = foreign ? [TONE.pewter, TONE.pewterDeep, TONE.pewterLight] : [TONE.wax, TONE.waxDeep, TONE.waxLight];
  const wobble = (a: number) => 1 + 0.045 * Math.sin(5 * a + 0.6) + 0.025 * Math.sin(11 * a + 1.9) + 0.012 * Math.sin(17 * a + 0.3);
  const spill = (scale: number, lift: number) => Array.from({ length: 96 }, (_, k): P => {
    const a = (k / 96) * 2 * Math.PI;
    return polar([at[0], at[1] + lift * r], r * scale * wobble(a), a);
  });
  const parts: Mobject[] = [
    fill(spill(1, 0), deep), // the lip, seen below the top of the wax
    fill(spill(0.95, 0.045), base),
    fill(ring([at[0], at[1] + 0.03 * r], 0.66 * r), deep), // the pressed disc
    shape([ring([at[0], at[1] + 0.03 * r], 0.7 * r), ring([at[0], at[1] + 0.03 * r], 0.62 * r)], { fill: light }, true), // its raised rim
  ];
  const c: P = [at[0], at[1] + 0.03 * r];
  if (foreign) {
    const star = Array.from({ length: 12 }, (_, k) => polar(c, k % 2 ? 0.17 * r : 0.42 * r, Math.PI / 2 + (k * Math.PI) / 6));
    parts.push(fill(star, light));
  } else {
    for (let k = 0; k < 4; k++) parts.push(fill(ring(polar(c, 0.19 * r, Math.PI / 4 + (k * Math.PI) / 2), 0.2 * r, 24), light));
    parts.push(fill(ring(c, 0.1 * r, 16), deep));
  }
  return new Group(...parts);
}

// ---------------------------------------------------------------------------------------------
// The key: the access token, what the account allows

/** Options for `key`. */
export type KeyOptions = {
  at?: Vec;
  /** Scale: at 1 the key is 2.0 units long and 0.68 high. Default 1. */
  size?: number;
  /** One tooth per scope the User approved. Default 1. */
  teeth?: number;
  /** An empty slot: the key's outline, dashed, in STEEL. "No key yet." */
  ghost?: boolean;
  /** The bow faces left (default) or right. */
  facing?: 'left' | 'right';
  /** Draw in the deep brass tone, for a key laid on paper (a ticket), where light brass would not read. */
  onPaper?: boolean;
};

/**
 * A cut key, the series' mark for an access token ("what you allow"): a ring bow, a collar, a
 * blade, and one tooth hanging from the blade for each scope the User approved, so a key for
 * orders:read and orders:write has two teeth. In BRASS with a light edge along the blade. With
 * `ghost`, the same outline dashed in STEEL: the slot where a key would hang. Size: 2.0 × 0.68
 * units at size 1, bow to the left. One unkeyed Group.
 */
export function key(_s: Stage, { at = [0, 0], size = 1, teeth = 1, ghost = false, facing = 'left', onPaper = false }: KeyOptions = {}): Group {
  const u = size, f = facing === 'left' ? 1 : -1;
  const p = (x: number, y: number): P => [at[0] + f * x * u, at[1] + y * u];
  const bowC = p(-0.66, 0.0);
  const depths = [0.28, 0.2, 0.32, 0.24, 0.3];
  // The blade, collar and teeth, traced as one outline.
  const blade: P[] = [p(-0.37, 0.16), p(-0.24, 0.16), p(-0.24, 0.07), p(0.9, 0.07), p(1.0, 0.02), p(1.0, -0.03), p(0.93, -0.07)];
  for (let i = 0; i < teeth; i++) {
    const cx = 0.8 - i * 0.26, w = 0.15, d = depths[i % depths.length]!;
    blade.push(p(cx + w / 2, -0.07), p(cx + w / 2, -0.07 - d + 0.03), p(cx + w / 2 - 0.03, -0.07 - d), p(cx - w / 2, -0.07 - d), p(cx - w / 2, -0.07));
  }
  blade.push(p(-0.24, -0.07), p(-0.24, -0.16), p(-0.37, -0.16));
  const bow = [ring(bowC, 0.34 * u, 40), ring(bowC, 0.15 * u, 28)];
  if (ghost)
    return new Group(
      shape([blade], { fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: `${0.12 * u} ${0.06 * u}`, lineJoin: 'round' }),
      shape([bow[0]!], { fill: 'none', stroke: TONE.steel, strokeWidth: STROKE.fine, dashArray: `${0.12 * u} ${0.06 * u}` }),
    );
  const [base, light] = onPaper ? [TONE.brassDeep, TONE.brass] : [TONE.brass, TONE.brassLight];
  return new Group(
    shape(bow, { fill: base }, true),
    fill(blade, base),
    fill([p(-0.18, 0.05), p(0.86, 0.05), p(0.86, 0.025), p(-0.18, 0.025)], light), // light on the blade's edge
    shape([arc(bowC, 0.29 * u, Math.PI * 0.55, Math.PI * 0.95, 10).concat(arc(bowC, 0.25 * u, Math.PI * 0.95, Math.PI * 0.55, 10))], { fill: light }),
  );
}

// ---------------------------------------------------------------------------------------------
// The agent's station, the Company's counter, and the lanes between them

/** Options for `station`. */
export type StationOptions = {
  at?: Vec;
  /** Radius of the roundel. Default 1.05. */
  r?: number;
  /** The name under the roundel; default "your agent". */
  name?: string;
  /** Prefix of the parts' keys. Default "agent". */
  key?: string;
  /** Pewter wax: a station that is some other agent's. */
  foreign?: boolean;
  /**
   * The key the agent holds, hung in the roundel under its seal: its number of teeth, or 0 for the
   * empty slot (a ghost key). Absent: no key slot, and the seal sits in the middle.
   */
  keyTeeth?: number;
};

/** Where a station holds its seal and its key, for flights that start or end there. */
export const stationHolds = (at: Vec, r = 1.05, withKey = true): { seal: Vec; key: Vec } =>
  withKey ? { seal: [at[0], at[1] + 0.3 * r], key: [at[0] + 0.02 * r, at[1] - 0.46 * r] } : { seal: at, key: at };

/**
 * The agent's station, where its lanes begin: a transit interchange roundel (RAISED, an INK ring)
 * holding what the agent holds: its seal, and with `keyTeeth`, under the seal, its key (or the
 * empty slot for one). Its name sits under the roundel in TYPE.small. Size: 2r across (default
 * 1.05), plus the name 0.42 below. Lanes leave from its right-hand edge (see `stationExit`).
 * Keyed parts: `<key>:station`, `<key>:seal`, `<key>:name`, and with `keyTeeth` the slot
 * `<key>:key:slot` (a ghost key, always) and, when it has teeth, `<key>:key`.
 */
export function station(s: Stage, { at = [0, 0], r = 1.05, name = 'your agent', key: k = 'agent', foreign = false, keyTeeth }: StationOptions = {}): Mobject[] {
  const holds = stationHolds(at, r, keyTeeth !== undefined);
  const out: Mobject[] = [
    keyedAs(new Group(new Circle({ radius: r, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.bold }).moveTo(at)), `${k}:station`),
    keyedAs(seal(s, { at: holds.seal, r: (keyTeeth !== undefined ? 0.44 : 0.64) * r, foreign }), `${k}:seal`),
    keyedAs(words(s, name, { at: [at[0], at[1] - r - 0.42], align: 'middle' }), `${k}:name`),
  ];
  if (keyTeeth !== undefined) {
    out.push(keyedAs(key(s, { at: holds.key, size: 0.66 * r, teeth: Math.max(1, keyTeeth), ghost: true }), `${k}:key:slot`));
    if (keyTeeth > 0) out.push(keyedAs(key(s, { at: holds.key, size: 0.66 * r, teeth: keyTeeth }), `${k}:key`));
  }
  return out;
}

/** Options for `counter`. */
export type CounterOptions = {
  /** The x of the counter's face, the side lanes arrive at. */
  x: number;
  top: number;
  bottom: number;
  /** Key of the part. Default "counter". */
  key?: string;
};

/**
 * The Company's counter, its shopfront, seen from above as the lanes are: a counter 0.5 deep,
 * striped across in RAISED and RULE like a shop's awning, whose front edge (the face, on the left,
 * where the agent's lanes arrive) is a heavy INK band. Stops sit on the
 * face (see `stop`); what the Company keeps (its ledger) stands behind it, to the right.
 * One keyed part, `<key>`, a Group.
 */
export function counter(_s: Stage, { x, top, bottom, key: k = 'counter' }: CounterOptions): Mobject[] {
  const h = top - bottom, cy = (top + bottom) / 2, depth = 0.5, n = Math.max(3, 2 * Math.round(h / 0.56) + 1), pitch = h / n;
  const stripes = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1)
    .map((i) => new Rectangle({ width: depth - 0.12, height: pitch, fill: TONE.rule, stroke: 'none' }).moveTo([x + 0.12 + (depth - 0.12) / 2, top - pitch * (i + 0.5)]));
  return [keyedAs(new Group(
    new Rectangle({ width: depth, height: h, fill: TONE.raised, stroke: 'none' }).moveTo([x + depth / 2, cy]),
    ...stripes,
    new Rectangle({ width: 0.12, height: h, fill: TONE.ink, stroke: 'none' }).moveTo([x + 0.06, cy]),
  ), k)];
}

/** Options for `lane`. */
export type LaneOptions = {
  /** Lane id, for its keys: `lane:<id>:…`. */
  id: string;
  /** Its name, set on the line. */
  name: string;
  /** Height of its level run. */
  y: number;
  /** Where it leaves the station: a point on the roundel's edge (see `stationExit`). */
  from: Vec;
  /** The x where the station's bundle of lanes ends and this lane fans out to its own height. */
  trunk: number;
  /** The x where it ends at its stop (the counter's face). */
  to: number;
  /** Where its name starts. */
  nameX: number;
  /** The lane in use: INK, bold, its name bold. Otherwise STEEL. */
  active?: boolean;
  /** Whether the last request reached its stop (filled INK). Default: `active`. A refused request does not. */
  reached?: boolean;
  /** How steeply it fans out: horizontal run per unit of rise. Default 0.45. */
  fan?: number;
  /**
   * Where the name sits: 'line' (default), on the line on an opaque plate; or 'above', its centre
   * 0.46 above the line with no plate, so a token riding the line (at most 0.24 high) passes under
   * it. With 'above' there is no `:plate` part, and lanes need about 1.1 between them.
   */
  nameAt?: 'line' | 'above';
};

/**
 * The point on a station's roundel (centre `at`, radius `r`) where a lane leaves it at height
 * `at.y + dy`: lanes leave a station as a bundle of parallel lines, 0.22 apart.
 */
export const stationExit = (at: Vec, r: number, dy: number): Vec => [at[0] + Math.sqrt(Math.max(0, r * r - dy * dy)), at[1] + dy];

/** The corner points of a lane: out of the station, along the bundle to `trunk`, fanned to its height, level to its stop. */
export function laneRoute({ from, trunk, y, to, fan = 0.45 }: Pick<LaneOptions, 'from' | 'trunk' | 'y' | 'to' | 'fan'>): Vec[] {
  return [from, [trunk, from[1]], [trunk + fan * Math.abs(y - from[1]), y], [to, y]];
}

/**
 * One lane of the line map: out of the station in a bundle, fanned to its own height, then level
 * to its stop at the counter (see `laneRoute`), its corners rounded as a transit map's are. Its name is set on the line, signage fashion, on an
 * opaque plate of the ground's colour; its stop is a ringed circle on the counter's face. STEEL
 * when idle; INK, bold and with a filled stop when `active`.
 * Keyed parts: `lane:<id>:line`, `lane:<id>:plate` (not with `nameAt: 'above'`), `lane:<id>:name`,
 * `lane:<id>:stop`.
 */
export function lane(s: Stage, { id, name, y, from, trunk, to, nameX, active = false, reached = active, fan = 0.45, nameAt = 'line' }: LaneOptions): Mobject[] {
  const colour = active ? TONE.ink : TONE.steel, k = `lane:${id}`;
  const line = roundedPath(laneRoute({ from, trunk, y, to, fan }), 0.22, { stroke: colour, strokeWidth: active ? STROKE.bold : STROKE.line, fill: 'none' });
  if (nameAt === 'above') {
    const over = words(s, name, { at: [nameX, y + 0.46], color: active ? TONE.ink : TONE.soft, bold: active });
    return [keyedAs(line, `${k}:line`), keyedAs(over, `${k}:name`), keyedAs(stop(s, { at: [to, y], active: reached }), `${k}:stop`)];
  }
  const label = words(s, name, { at: [nameX, y], color: active ? TONE.ink : TONE.soft, bold: active });
  const plate = new Rectangle({ width: label.width() + 0.36, height: PLATE_HEIGHT, fill: TONE.ground, stroke: 'none' }).moveTo([nameX + label.width() / 2, y]);
  return [keyedAs(line, `${k}:line`), keyedAs(plate, `${k}:plate`), keyedAs(label, `${k}:name`), keyedAs(stop(s, { at: [to, y], active: reached }), `${k}:stop`)];
}

/**
 * An open route through corner points with each corner rounded (radius up to `r`), as a transit
 * map draws its lines: a Line, so the layout check treats it as a connector.
 */
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

/** A stop: a circle of radius 0.17 on the counter's face, ringed in INK, filled INK when `active`. One unkeyed Circle. */
export function stop(_s: Stage, { at = [0, 0], active = false }: { at?: Vec; active?: boolean } = {}): Mobject {
  return new Circle({ radius: 0.17, fill: active ? TONE.ink : TONE.ground, stroke: active ? TONE.ink : TONE.steel, strokeWidth: STROKE.line }).moveTo(at);
}

// ---------------------------------------------------------------------------------------------
// One request: the ticket, and the barrier that stops it

/** Options for `ticket`. */
export type TicketOptions = {
  at?: Vec;
  /** Whose seal is stamped on its stub: the agent's (default) or another's. */
  foreign?: boolean;
  /** A key clipped to it, with this many teeth; null or absent for a request that carries none. */
  keyTeeth?: number | null;
};

/** A ticket's size: 2.1 × 0.86 units. */
export const TICKET = { width: 2.1, height: 0.86 } as const;

/**
 * A ticket, one request: paper, with a notched stub. The stub carries the sender's seal (WAX, or
 * PEWTER with `foreign`); the body carries a key in deep brass when the request carries an access
 * token, and otherwise two printed lines (the request itself). Size: 2.1 × 0.86 units, always, so a
 * ticket with and without a key are the same object. One unkeyed Group.
 */
export function ticket(s: Stage, { at = [0, 0], foreign = false, keyTeeth = null }: TicketOptions = {}): Group {
  const { width: w, height: h } = TICKET, [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2;
  const k = RADIUS.ticket, stub = l + 0.8, bite = 0.12;
  const outline: P[] = [
    ...arc([l + k, t - k], k, Math.PI, Math.PI / 2, 5),
    ...arc([stub, t], bite, Math.PI, 2 * Math.PI, 10),
    ...arc([r - k, t - k], k, Math.PI / 2, 0, 5),
    ...arc([r - k, b + k], k, 0, -Math.PI / 2, 5),
    ...arc([stub, b], bite, 0, Math.PI, 10),
    ...arc([l + k, b + k], k, -Math.PI / 2, -Math.PI, 5),
  ];
  const perforation = [0.21, 0.07, -0.07, -0.21].map((dy) => new Circle({ radius: 0.024, fill: TONE.paperLine, stroke: 'none' }).moveTo([stub, y + dy]));
  const body = keyTeeth ? [key(s, { at: [stub + 0.66, y + 0.05], size: 0.52, teeth: keyTeeth, onPaper: true })]
    : [0.14, -0.12].map((dy, i) => new Rectangle({ width: i ? 0.56 : 0.9, height: 0.075, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([stub + 0.22 + (i ? 0.28 : 0.45), y + dy]));
  return new Group(fill(outline, TONE.paper), ...perforation, seal(s, { at: [l + 0.4, y], r: 0.28, foreign }), ...body);
}

/**
 * A barrier across a lane: an upright boom, 0.28 × `height` (default 0.96), with rounded ends,
 * banded INK and ground like a level-crossing arm. It stands where the Company stops a request,
 * between the refused ticket and the counter. One unkeyed Group.
 */
export function barrier(_s: Stage, { at = [0, 0], height = 0.96 }: { at?: Vec; height?: number } = {}): Group {
  const w = 0.28, n = 5, inner = height - 0.1, band = inner / n;
  const bands = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 0)
    .map((i) => new Rectangle({ width: w - 0.1, height: band, fill: TONE.ink, stroke: 'none', cornerRadius: i === 0 || i === n - 1 ? 0.06 : 0 }).moveTo([at[0], at[1] + inner / 2 - band * (i + 0.5)]));
  return new Group(new Rectangle({ width: w, height, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: w / 2 }).moveTo(at), ...bands);
}

// ---------------------------------------------------------------------------------------------
// What the Company knows: the ledger. What came back: the answer.

/** One row of a ledger. */
export type LedgerRow = {
  /** The row's name, set small in SOFT; also its key: `<key>:<slug of label>:…`. */
  label: string;
  value: string;
  /** A value that is not yet a fact ("not met yet"): SOFT and in Inter. Otherwise INK and in mono. */
  quiet?: boolean;
  /** The last event changed this row: a change bar in the margin and the value in bold. */
  changed?: boolean;
};
/** Options for `ledger`. */
export type LedgerOptions = {
  /** Top-left corner: the heading's start, at its vertical centre. */
  at: Vec;
  /** From the labels' start to the values' end. */
  width: number;
  /** The heading, in TYPE.small bold over the double rule. */
  title: string;
  /** Prefix of the parts' keys. */
  key: string;
  /** Distance between rows. Default 0.86. */
  rowGap?: number;
  /** The words a description gives a changed row; default "changed". */
  changedAs?: string;
};

/**
 * A ruled ledger: what a party knows, row by row. A heading, a double rule under it (as an account
 * book has), then rows of a SOFT label and a value set flush right, each over a hairline. A row the
 * last event changed has a change bar in the left margin (0.28 before `at.x`) and a bold value.
 * Size: `width` wide; 0.95 + rows × rowGap tall.
 * Keyed parts: `<key>:title`, `<key>:rule`, and for each row `<key>:<row>:label`, `:value`,
 * `:rule`, and `:mark` when changed, where `<row>` is the label in lower case with spaces as dashes.
 */
export function ledger(s: Stage, rows: readonly LedgerRow[], { at, width, title, key: k, rowGap = 0.86, changedAs = 'changed' }: LedgerOptions): Mobject[] {
  const [x, top] = at, right = x + width, out: Mobject[] = [];
  out.push(keyedAs(words(s, title, { at, bold: true }), `${k}:title`));
  out.push(keyedAs(new Group(
    new Rectangle({ width, height: 0.045, fill: TONE.ink, stroke: 'none' }).moveTo([x + width / 2, top - 0.46]),
    new Rectangle({ width, height: 0.025, fill: TONE.ink, stroke: 'none' }).moveTo([x + width / 2, top - 0.56]),
  ), `${k}:rule`));
  rows.forEach((row, i) => {
    const y = top - 1.02 - i * rowGap, slug = `${k}:${row.label.toLowerCase().replace(/\s+/g, '-')}`;
    out.push(keyedAs(words(s, row.label, { at: [x, y], color: TONE.soft }), `${slug}:label`));
    const value = keyedAs(words(s, row.value, { at: [right, y], align: 'end', color: row.quiet ? TONE.soft : TONE.ink, mono: !row.quiet, bold: !!row.changed }), `${slug}:value`);
    out.push(value);
    out.push(keyedAs(new Rectangle({ width, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([x + width / 2, y - rowGap / 2]), `${slug}:rule`));
    if (row.changed) {
      out.push(keyedAs(new Rectangle({ width: 0.09, height: 0.6, fill: TONE.ink, stroke: 'none', cornerRadius: 0.02 }).moveTo([x - 0.28, y]), `${slug}:mark`));
      markAs(value, `${changedAs}: ${row.label} is now ${row.value}`);
    }
  });
  return out;
}

/** Options for `answer`. */
export type AnswerOptions = {
  /** Top-left: the start of the "asked" line, at its vertical centre. */
  at: Vec;
  /** Who asked for what, small and SOFT: "agent: add to cart". */
  asked: string;
  /** The status number ("401"), in TYPE.display mono bold; null to show a key in its place. */
  number: string | null;
  /** Teeth of the key shown when `number` is null (a sign-in's answer is a key). */
  keyTeeth?: number;
  /** The status phrase ("Unauthorized"), TYPE.title bold. */
  phrase: string;
  /** What it meant ("needs orders:write"), TYPE.small in INK. */
  meaning: string;
  /** Prefix of the parts' keys. Default "answer". */
  key?: string;
  /** The emphasis words for the phrase, for the phone's tour and descriptions. */
  emphasis?: string;
  /** The x where the phrase and meaning start, to align them with something above; default just after the number column. */
  textX?: number;
  /** Set the meaning in mono: for a meaning that is a protocol literal alone ("invalid_session"). */
  meaningMono?: boolean;
};

/** The width the answer block keeps for its number, so the phrase stays put from answer to answer. */
export const ANSWER_NUMBER_WIDTH = 3 * 0.6 * TYPE.display;

/**
 * The large answer block: what was asked on a small SOFT line; under it the status number in
 * TYPE.display mono bold (or, for an answer that is a key, the key itself); beside the number, the
 * phrase in TYPE.title bold over its meaning in TYPE.small. The number column is always
 * ANSWER_NUMBER_WIDTH (2.88) wide. Size: about 3.4 + phrase width × 2.6 units.
 * Keyed parts: `<key>:asked`, `<key>:code` (Text) or `<key>:key` (Group), `<key>:phrase`, `<key>:meaning`.
 */
export function answer(s: Stage, { at, asked, number, keyTeeth = 1, phrase, meaning, key: k = 'answer', emphasis, textX = at[0] + ANSWER_NUMBER_WIDTH + SPACE.m, meaningMono = false }: AnswerOptions): Mobject[] {
  const [x, y] = at, mid = y - 1.48;
  const out: Mobject[] = [keyedAs(words(s, asked, { at, color: TONE.soft }), `${k}:asked`)];
  if (number !== null) out.push(keyedAs(words(s, number, { at: [x - 0.06, mid], size: TYPE.display, mono: true, bold: true }), `${k}:code`));
  else out.push(keyedAs(key(s, { at: [x + ANSWER_NUMBER_WIDTH / 2 - 0.1, mid + 0.06], size: 1.25, teeth: keyTeeth }), `${k}:key`));
  const head = keyedAs(words(s, phrase, { at: [textX, mid + 0.3], size: TYPE.title, bold: true }), `${k}:phrase`);
  if (emphasis) markAs(head, emphasis);
  out.push(head, keyedAs(words(s, meaning, { at: [textX, mid - 0.46], mono: meaningMono }), `${k}:meaning`));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Paper: documents, slips, certificates, cards

/** Options for `sheet`. */
export type SheetOptions = {
  at?: Vec;
  /** Default 1.0, or wide enough for the title and fields. */
  width?: number;
  /** Default 1.3, or tall enough for the title and fields. */
  height?: number;
  /** Printed at the top in mono: "poppy.json". */
  title?: string;
  /** Printed lines under the title, in mono TYPE.small: "\"apis\": […]". */
  fields?: readonly string[];
  /** Ruled lines standing for text, when there are no fields. Default 3 (0 with fields). */
  lines?: number;
};

/**
 * A sheet of paper, a document: PAPER with its top-right corner folded down (a dog-ear). With a
 * `title` and `fields`, printed in mono PRINT and the sheet sized to hold them (each line 0.62
 * apart, 0.28 padding); otherwise `lines` ruled bars stand for text. Default 1.0 × 1.3 units, the
 * size a document travels at. One unkeyed Group.
 */
export function sheet(s: Stage, { at = [0, 0], width, height, title, fields = [], lines }: SheetOptions = {}): Group {
  const printed = [...(title ? [title] : []), ...fields];
  const texts = printed.map((line, i) => words(s, line, { mono: true, color: TONE.print, bold: i === 0 && !!title }));
  const pad = SPACE.s, lead = 0.62;
  const w = Math.max(width ?? 1.0, ...texts.map((t) => t.width() + 2 * pad + 0.22));
  const bars = lines ?? (printed.length ? 0 : 3);
  const h = Math.max(height ?? 1.3, printed.length * lead + bars * 0.24 + 2 * pad);
  const [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2, f = Math.min(0.26, 0.22 * Math.min(w, h));
  const parts: Mobject[] = [
    fill([[l, t], [r - f, t], [r, t - f], [r, b], [l, b]], TONE.paper),
    fill([[r - f, t], [r - f, t - f], [r, t - f]], TONE.paperLine),
  ];
  texts.forEach((m, i) => parts.push(m.moveTo([l + pad, t - pad - lead / 2 - i * lead], [-1, 0])));
  const top = t - pad - printed.length * lead - (printed.length ? 0.06 : 0.12);
  for (let i = 0; i < bars; i++) {
    const bw = (w - 2 * pad - (printed.length ? 0 : f * 0.6)) * [1, 0.86, 0.62, 0.92, 0.7][i % 5]!;
    parts.push(new Rectangle({ width: bw, height: 0.075, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([l + pad + bw / 2, top - 0.05 - i * 0.24]));
  }
  return new Group(...parts);
}

/**
 * A one-time code slip: a strip of PAPER torn along its bottom edge, the code printed on it in mono
 * bold PRINT ("K7Q-29F"). Size: the code's width + 0.56 × 0.95 units. One unkeyed Group.
 */
export function codeSlip(s: Stage, { at = [0, 0], code = 'K7Q-29F' }: { at?: Vec; code?: string } = {}): Group {
  const text = words(s, code, { mono: true, bold: true, color: TONE.print, align: 'middle', at: [at[0], at[1] + 0.06] });
  const w = text.width() + 0.56, h = 0.95, [x, y] = at, l = x - w / 2, r = x + w / 2, t = y + h / 2, b = y - h / 2;
  const teeth = Math.max(4, Math.round(w / 0.16)), tear: P[] = [];
  for (let i = 0; i <= teeth; i++) tear.push([r - (i * w) / teeth, b + (i % 2 ? 0.07 : 0)]);
  return new Group(fill([[l, t], [r, t], ...tear, [l, t]], TONE.paper), text);
}

/** Options for `certificate`. */
export type CertificateOptions = {
  at?: Vec;
  /** Default 1.9. */
  width?: number;
  /** Default 1.3. */
  height?: number;
  /** Printed at the top in mono, e.g. "delegation". */
  title?: string;
  /** Whose seal vouches for it. */
  foreign?: boolean;
};

/**
 * A delegation or certificate: PAPER with a fine inset border, printed lines, and a seal pressed at
 * its lower right over two ribbon tails: someone vouches for what it says (the agent, in WAX, or
 * another party, PEWTER, with `foreign`). Default 1.9 × 1.3 units (1.5 high, and wide enough, with a
 * title). The ribbon tails hang 0.5 below the seal, past the paper's edge. One unkeyed Group.
 */
export function certificate(s: Stage, { at = [0, 0], width = 1.9, height = 1.3, title, foreign = false }: CertificateOptions = {}): Group {
  const head = title ? words(s, title, { mono: true, bold: true, color: TONE.print }) : null;
  const w = Math.max(width, head ? head.width() + 0.9 : 0), h = Math.max(height, head ? 1.5 : 0), [x, y] = at, l = x - w / 2, t = y + h / 2;
  const sealAt: P = [x + w / 2 - 0.42, y - h / 2 + 0.34], ribbon = foreign ? TONE.pewterDeep : TONE.waxDeep;
  const tail = (dx: number): P[] => [add(sealAt, [dx - 0.08, 0]), add(sealAt, [dx + 0.08, 0]), add(sealAt, [dx * 1.6 + 0.1, -0.5]), add(sealAt, [dx * 1.6, -0.4]), add(sealAt, [dx * 1.6 - 0.1, -0.5])];
  const parts: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at),
    new Rectangle({ width: w - 0.2, height: h - 0.2, fill: 'none', stroke: TONE.paperLine, strokeWidth: 0.03, cornerRadius: 0.03 }).moveTo(at),
  ];
  if (head) parts.push(head.moveTo([l + 0.3, t - 0.42], [-1, 0]));
  const first = head ? t - 0.82 : t - 0.36;
  [0.8, 0.55].forEach((frac, i) => parts.push(new Rectangle({ width: (w - 0.6) * frac, height: 0.07, fill: TONE.paperLine, stroke: 'none', cornerRadius: 0.03 }).moveTo([l + 0.3 + ((w - 0.6) * frac) / 2, first - i * 0.22])));
  parts.push(fill(tail(-0.1), ribbon), fill(tail(0.1), ribbon), seal(s, { at: sealAt, r: 0.27, foreign }));
  return new Group(...parts);
}

/** Options for `instructionCard`. */
export type InstructionCardOptions = {
  at?: Vec;
  /** Printed at the top in mono, e.g. "SKILL.md". */
  title?: string;
  /** Ruled lines under the title. Default 3. */
  lines?: number;
  /** Default 2.2, or wide enough for the title. */
  width?: number;
};

/**
 * A skill or instruction card: a landscape index card of PAPER, its title printed in mono with a
 * PRINT rule under it, then ruled lines in PAPER_LINE, like a recipe card: instructions a party
 * reads and follows. Default 2.2 × 1.4 units. One unkeyed Group.
 */
export function instructionCard(s: Stage, { at = [0, 0], title = 'SKILL.md', lines = 3, width = 2.2 }: InstructionCardOptions = {}): Group {
  const head = words(s, title, { mono: true, bold: true, color: TONE.print });
  const w = Math.max(width, head.width() + 0.6), h = 0.95 + lines * 0.22, [x, y] = at, l = x - w / 2, t = y + h / 2;
  const parts: Mobject[] = [
    new Rectangle({ width: w, height: h, fill: TONE.paper, stroke: 'none', cornerRadius: RADIUS.paper }).moveTo(at),
    head.moveTo([l + 0.28, t - 0.4], [-1, 0]),
    new Rectangle({ width: w - 0.56, height: 0.05, fill: TONE.print, stroke: 'none' }).moveTo([x, t - 0.76]),
  ];
  for (let i = 0; i < lines; i++) parts.push(new Rectangle({ width: w - 0.56, height: 0.03, fill: TONE.paperLine, stroke: 'none' }).moveTo([x, t - 0.98 - i * 0.22]));
  return new Group(...parts);
}

// ---------------------------------------------------------------------------------------------
// The web: a browser window and its cookie

/** Options for `browserWindow`. */
export type BrowserOptions = {
  at?: Vec;
  /** Default 4.4. */
  width?: number;
  /** Default 2.8. */
  height?: number;
  /** The host in the address bar, in mono. Default "example.com". */
  host?: string;
  /** Bars of page content. Default 3. */
  lines?: number;
};

/**
 * A browser window: a RAISED frame with a fine INK outline and panel radius; a top bar with three
 * STEEL window controls and an address field holding the host in mono TYPE.small; below, the page,
 * with a few STEEL bars standing for its content. The page area is the window less its top 0.92
 * units. Default 4.4 × 2.8 units, widened to hold the host. One unkeyed Group.
 */
export function browserWindow(s: Stage, { at = [0, 0], width = 4.4, height = 2.8, host = 'example.com', lines = 3 }: BrowserOptions = {}): Group {
  const probe = words(s, host, { mono: true }), fieldW = probe.width() + 0.5;
  width = Math.max(width, 1.05 + fieldW + 0.3);
  const [x, y] = at, l = x - width / 2, t = y + height / 2, bar = 0.92;
  const address = probe.moveTo([l + 1.3, t - bar / 2], [-1, 0]);
  const parts: Mobject[] = [
    new Rectangle({ width, height, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.panel }).moveTo(at),
    new Rectangle({ width: width - 0.06, height: STROKE.hair, fill: TONE.rule, stroke: 'none' }).moveTo([x, t - bar]),
    ...[0, 1, 2].map((i) => new Circle({ radius: 0.075, fill: TONE.steel, stroke: 'none' }).moveTo([l + 0.3 + i * 0.24, t - bar / 2])),
    new Rectangle({ width: fieldW, height: 0.62, fill: TONE.ground, stroke: 'none', cornerRadius: 0.31 }).moveTo([l + 1.05 + fieldW / 2, t - bar / 2]),
    address,
  ];
  for (let i = 0; i < lines; i++) {
    const bw = (width - 0.7) * [0.7, 0.92, 0.55, 0.8][i % 4]!;
    parts.push(new Rectangle({ width: bw, height: i === 0 ? 0.16 : 0.09, fill: TONE.steel, stroke: 'none', cornerRadius: 0.04 }).moveTo([l + 0.35 + bw / 2, t - bar - 0.42 - i * 0.32]));
  }
  return new Group(...parts);
}

/**
 * A cookie, a browser's stored state: a round biscuit of radius `r` (default 0.42) in PAPER with
 * a bite taken from its upper right and four GROUND chips. One unkeyed Group.
 */
export function cookie(_s: Stage, { at = [0, 0], r = 0.42 }: { at?: Vec; r?: number } = {}): Group {
  const theta = Math.PI / 4, rb = 0.36 * r, bc = polar(at, r, theta);
  const d = 2 * Math.asin(rb / (2 * r));
  const rim = arc(at, r, theta + d, theta + 2 * Math.PI - d, 60).map((p, i) => polar(at, r * (1 + 0.025 * Math.sin(i * 1.7)), Math.atan2(p[1] - at[1], p[0] - at[0])));
  const a0 = Math.atan2(rim.at(-1)![1] - bc[1], rim.at(-1)![0] - bc[0]), a1 = Math.atan2(rim[0]![1] - bc[1], rim[0]![0] - bc[0]);
  // The bite's arc runs inside the biscuit, through the side facing its centre.
  let b1 = a1;
  while (b1 > a0) b1 -= 2 * Math.PI;
  const inward = theta + Math.PI;
  const passes = (lo: number, hi: number) => [inward, inward - 2 * Math.PI, inward + 2 * Math.PI].some((a) => a >= Math.min(lo, hi) && a <= Math.max(lo, hi));
  const bite = passes(b1, a0) ? arc(bc, rb, a0, b1, 12) : arc(bc, rb, a0, a1 + (a1 < a0 ? 2 * Math.PI : 0), 12);
  const chips: [number, number, number][] = [[-0.38, 0.2, 0.09], [0.1, -0.35, 0.08], [-0.1, -0.02, 0.07], [0.36, -0.1, 0.06]];
  return new Group(
    fill([...rim, ...bite.slice(1, -1)], TONE.paper),
    ...chips.map(([dx, dy, cr]) => fill(ring(add(at, [dx * r * 1.6, dy * r * 1.6]), cr * r * 1.6, 7).map((p, i) => add(p, [0, i % 2 ? 0.01 : -0.01])), TONE.ground)),
  );
}

// ---------------------------------------------------------------------------------------------
// People, agents, devices, turns of speech

/**
 * A person, the User: a head and shoulders silhouette in INK, `size` 1 being 0.9 wide and 1.0
 * high. A plain figure, no face, the same figure everywhere a person is meant. One unkeyed Group.
 */
export function person(_s: Stage, { at = [0, 0], size = 1, color = TONE.ink }: { at?: Vec; size?: number; color?: string } = {}): Group {
  const u = size, [x, y] = at;
  const shoulders: P[] = [[x - 0.45 * u, y - 0.5 * u], ...arc([x, y - 0.5 * u], 0.45 * u, Math.PI, 0, 20).map(([px, py]): P => [px, y - 0.5 * u + (py - (y - 0.5 * u)) * 1.15]), [x + 0.45 * u, y - 0.5 * u]];
  return new Group(fill(ring([x, y + 0.24 * u], 0.24 * u, 32), color), fill(shoulders, color));
}

/**
 * The AI mark: a four-pointed spark in INK, the series' sign that words or actions came from an AI.
 * `size` 1 is 0.7 across. One unkeyed Group.
 */
export function aiMark(_s: Stage, { at = [0, 0], size = 1, color = TONE.ink }: { at?: Vec; size?: number; color?: string } = {}): Group {
  const u = 0.35 * size, pts: P[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    pts.push(polar(at, u, a));
    // Concave sides: the spark pinches between its points.
    for (let j = 1; j < 6; j++) {
      const t = j / 6, mid = a + (Math.PI / 2) * t, rr = u * (0.16 + 0.84 * Math.pow(Math.abs(2 * t - 1), 2.2));
      pts.push(polar(at, rr, mid));
    }
  }
  return new Group(fill(pts, color));
}

/** Options for `speech`. */
export type SpeechOptions = {
  at?: Vec;
  /** Who said it: a person (the person mark, a PAPER bubble) or an AI (the AI mark, a RAISED bubble). */
  who: 'person' | 'ai';
  /** Which side the speaker's mark stands on. Default 'left'. */
  side?: 'left' | 'right';
  /** Fixed bubble width; default fits the words. */
  width?: number;
};

/**
 * A turn of speech in a conversation: a bubble holding the words (TYPE.small; a PAPER bubble with
 * PRINT words for a person, a RAISED bubble with INK words for an AI), its tail pointing to the
 * speaker's mark beside it, the person mark or the AI mark. Every message says who wrote it, so the
 * mark is never left out. `at` is the bubble's centre; the mark stands 0.42 beyond its side, a
 * little low, by the tail's tip. Height 0.9 (1.2 with the tail); width the words + 0.56.
 * One unkeyed Group.
 */
export function speech(s: Stage, text: string, { at = [0, 0], who, side = 'left', width }: SpeechOptions): Group {
  const isPerson = who === 'person';
  const t = words(s, text, { at, align: 'middle', color: isPerson ? TONE.print : TONE.ink });
  const w = width ?? t.width() + 0.56, h = 0.9, [x, y] = at, f = side === 'left' ? -1 : 1, k = RADIUS.panel;
  const l = x - w / 2, r = x + w / 2, top = y + h / 2, b = y - h / 2;
  const tip = 0.3, outline: P[] = side === 'left'
    ? [...arc([l + k, top - k], k, Math.PI, Math.PI / 2, 5), ...arc([r - k, top - k], k, Math.PI / 2, 0, 5), ...arc([r - k, b + k], k, 0, -Math.PI / 2, 5), [l + 0.62, b], [l + 0.08, b - tip], [l + 0.3, b], ...arc([l + k, b + k], k, -Math.PI / 2, -Math.PI, 5)]
    : [...arc([l + k, top - k], k, Math.PI, Math.PI / 2, 5), ...arc([r - k, top - k], k, Math.PI / 2, 0, 5), ...arc([r - k, b + k], k, 0, -Math.PI / 2, 5), [r - 0.3, b], [r - 0.08, b - tip], [r - 0.62, b], ...arc([l + k, b + k], k, -Math.PI / 2, -Math.PI, 5)];
  const bubble = isPerson ? fill(outline, TONE.paper) : shape([outline], { fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, lineJoin: 'round' });
  const markAt: P = [x + f * (w / 2 + 0.42), y - 0.5];
  const mark = isPerson ? person(s, { at: markAt, size: 0.62 }) : aiMark(s, { at: markAt, size: 1 });
  return new Group(bubble, t, mark);
}

/** Options for `phone`. */
export type PhoneOptions = {
  at?: Vec;
  /** Scale: at 1 the phone is 1.3 × 2.3 units. Default 1. */
  size?: number;
  /** Something to show on its screen, centred there (a code slip, a padlock); drawn as given. */
  screen?: Mobject;
};

/**
 * A phone, a second device (as Device Sign-In uses): a RAISED body with an INK outline, a GROUND
 * screen inset, a STEEL speaker slot and home bar. 1.3 × 2.3 units at size 1; the screen is
 * (1.06 × 1.7) × size at its centre, raised 0.02 × size: a code slip of four digits needs size 1.8.
 * One unkeyed Group.
 */
export function phone(_s: Stage, { at = [0, 0], size = 1, screen }: PhoneOptions = {}): Group {
  const u = size, [x, y] = at;
  return new Group(
    new Rectangle({ width: 1.3 * u, height: 2.3 * u, fill: TONE.raised, stroke: TONE.ink, strokeWidth: STROKE.fine, cornerRadius: RADIUS.device * u }).moveTo(at),
    new Rectangle({ width: 1.06 * u, height: 1.7 * u, fill: TONE.ground, stroke: 'none', cornerRadius: 0.08 * u }).moveTo([x, y + 0.02 * u]),
    new Rectangle({ width: 0.3 * u, height: 0.06 * u, fill: TONE.steel, stroke: 'none', cornerRadius: 0.03 * u }).moveTo([x, y + 1.0 * u]),
    new Rectangle({ width: 0.4 * u, height: 0.05 * u, fill: TONE.steel, stroke: 'none', cornerRadius: 0.025 * u }).moveTo([x, y - 1.0 * u]),
    ...(screen ? [screen.moveTo([x, y + 0.02 * u])] : []),
  );
}

/**
 * A padlock, the User's account: a shackle over an INK body with a keyhole cut through it. Locked
 * by default; with `open`, the shackle is lifted and its right leg free. `size` 1 is 0.8 wide and
 * about 1.1 high. One unkeyed Group.
 */
export function padlock(_s: Stage, { at = [0, 0], size = 1, open = false, color = TONE.ink }: { at?: Vec; size?: number; open?: boolean; color?: string } = {}): Group {
  const u = size, [x, y] = at, lift = open ? 0.2 * u : 0;
  const body = roundRect([x, y - 0.18 * u], 0.8 * u, 0.62 * u, 0.1 * u);
  const hole = [...ring([x, y - 0.1 * u], 0.085 * u, 20)];
  const slot: P[] = [[x - 0.035 * u, y - 0.12 * u], [x + 0.035 * u, y - 0.12 * u], [x + 0.05 * u, y - 0.34 * u], [x - 0.05 * u, y - 0.34 * u]];
  const c: P = [x, y + 0.16 * u + lift], ro = 0.27 * u, ri = 0.15 * u, footL = y + 0.05 * u, footR = open ? y + 0.24 * u : y + 0.05 * u;
  const shackle: P[] = [[x - ro, footL], ...arc(c, ro, Math.PI, 0, 20), [x + ro, footR], [x + ri, footR], ...arc(c, ri, 0, Math.PI, 16), [x - ri, footL]];
  return new Group(fill(shackle, color), shape([body, hole, slot], { fill: color }, true));
}

// ---------------------------------------------------------------------------------------------
// Time, and caution

/**
 * A clock, for a lifetime or an expiry: an INK-ringed face with four ticks and two hands, and,
 * with `remaining` (0 to 1), a SOFT wedge sweeping clockwise from twelve for the time left.
 * `remaining: 0` draws an empty face: expired. Radius `r`, default 0.45. One unkeyed Group.
 */
export function clock(_s: Stage, { at = [0, 0], r = 0.45, remaining }: { at?: Vec; r?: number; remaining?: number } = {}): Group {
  const parts: Mobject[] = [new Circle({ radius: r, fill: TONE.ground, stroke: TONE.ink, strokeWidth: STROKE.line }).moveTo(at)];
  if (remaining !== undefined && remaining > 0) {
    const a0 = Math.PI / 2, a1 = Math.PI / 2 - 2 * Math.PI * Math.min(1, remaining);
    parts.push(fill([at, ...arc(at, r * 0.8, a0, a1, Math.max(4, Math.round(32 * remaining)))], TONE.soft));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, n: P = [Math.cos(a), Math.sin(a)], t: P = [-n[1], n[0]];
    const p0 = add(at, [n[0] * r * 0.62, n[1] * r * 0.62]), p1 = add(at, [n[0] * r * 0.84, n[1] * r * 0.84]), hw = 0.025;
    parts.push(fill([add(p0, [t[0] * hw, t[1] * hw]), add(p1, [t[0] * hw, t[1] * hw]), add(p1, [-t[0] * hw, -t[1] * hw]), add(p0, [-t[0] * hw, -t[1] * hw])], TONE.ink));
  }
  const hand = (angle: number, len: number, hw: number) => {
    const n: P = [Math.cos(angle), Math.sin(angle)], t: P = [-n[1] * hw, n[0] * hw];
    return fill([add(at, t), add(at, [n[0] * len + t[0], n[1] * len + t[1]]), add(at, [n[0] * len - t[0], n[1] * len - t[1]]), add(at, [-t[0], -t[1]])], TONE.ink);
  };
  parts.push(hand(Math.PI / 2, r * 0.55, 0.035), hand(-Math.PI / 6, r * 0.42, 0.04), new Circle({ radius: 0.06, fill: TONE.ink, stroke: 'none' }).moveTo(at));
  return new Group(...parts);
}

/**
 * A warning mark, for content that must not be trusted as instructions: a rounded triangle in INK
 * with an exclamation mark cut out of it, `size` 1 being 0.9 wide. Shape carries the warning; no
 * colour is spent on it. One unkeyed Group.
 */
export function warning(_s: Stage, { at = [0, 0], size = 1 }: { at?: Vec; size?: number } = {}): Group {
  const u = size * 0.9, [x, y] = at, h = u * 0.87, k = 0.08 * u;
  const corners: P[] = [[x, y + h * 0.62], [x + u / 2, y - h * 0.38], [x - u / 2, y - h * 0.38]];
  const tri: P[] = corners.flatMap((c, i) => {
    const prev = corners[(i + 2) % 3]!, next = corners[(i + 1) % 3]!;
    const toward = (q: P, d: number): P => { const dx = q[0] - c[0], dy = q[1] - c[1], len = Math.hypot(dx, dy); return [c[0] + (dx / len) * d, c[1] + (dy / len) * d]; };
    const a = toward(prev, k * 2), b = toward(next, k * 2);
    return [a, ...Array.from({ length: 5 }, (_, j): P => { const t = (j + 1) / 6; return [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]; }), b];
  });
  const bar: P[] = [[x - 0.05 * u, y + h * 0.3], [x + 0.05 * u, y + h * 0.3], [x + 0.035 * u, y - h * 0.08], [x - 0.035 * u, y - h * 0.08]];
  return new Group(shape([tri, bar, ring([x, y - h * 0.2], 0.055 * u, 14)], { fill: TONE.ink }, true));
}

// ---------------------------------------------------------------------------------------------
// Choreography: authored transitions that explain

/** One thing a transition plays: an animation, or several together. */
export type Beat = Animation | AnimationGroup;

/** Keys each choreography has already sent out, so `flight` never leaves a part twice. */
const departed = new WeakMap<Choreography, Set<string>>();
const leaveOnce = (c: Choreography, k: string, runTime: number): Animation | null => {
  const gone = departed.get(c) ?? new Set<string>();
  departed.set(c, gone);
  if (gone.has(k) || !c.has(k, 'from')) return null;
  gone.add(k);
  return c.leave(k, { runTime });
};

/**
 * A route through these points, for a token to travel: a Line from the first to the second, then
 * `addLineTo` each next point. Consecutive repeats are dropped (a zero-length hop stalls a token).
 */
export function route(first: Vec, ...rest: Vec[]): Line {
  const points = [first, ...rest].filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1]![0], p[1] - all[i - 1]![1]) > 1e-6);
  if (points.length < 2) throw new RangeError('route(): a route needs two distinct points');
  const path = new Line(points[0]!, points[1]!);
  for (const p of points.slice(2)) path.addLineTo(p);
  return path;
}

/** Options for `beats`. */
export type BeatsOptions = {
  /**
   * Key prefixes of parts that belong to the last event (the ticket, the barrier, the answer):
   * they leave before the flight, and their words are replaced after it, even when unchanged, so
   * an answer is never readable before its request lands. Default `['answer:', 'ticket', 'barrier']`.
   */
  fresh?: readonly string[];
  /** Keys to bring in right after the flight, before the rest settles (a barrier dropping in). */
  then?: readonly string[];
  /**
   * Key prefixes of parts that change before the flight, as the first beat: the lane a request
   * takes lights up before its ticket sets off. Parts both pictures have are morphed; words that
   * change are still replaced at the end.
   */
  lead?: readonly string[];
};

/**
 * A transition in three beats. First, words that change, and every part of the last event
 * (`fresh`), go, while the `lead` parts change (the lane in use lights up). Then the flight plays (made only now, after the leaves, since a part may enter
 * again only once it has left). Then the `then` parts come, and finally the new words come while
 * every other part settles (`c.rest()`). Words are replaced, never morphed glyph by glyph.
 */
export function beats(c: Choreography, flight: () => Beat[] = () => [], { fresh = ['answer:', 'ticket', 'barrier'], then = [], lead = [] }: BeatsOptions = {}): Succession {
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
 * A part's flight, for `beats`: a copy of the target part `key`, as it will rest, appears at the
 * first point, travels through the others to the part's resting centre, and there gives way to the
 * part itself. A Group cannot `enter` from another part, so this is how a ticket or a key moves.
 * If the current picture has the part too, it leaves as the copy appears. Returns the thunk
 * `beats` expects.
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
 * A token passing through, which neither picture keeps (a poppy.json carried to the agent, a key
 * handed back): `token` appears at the first point, travels the route and fades at the last.
 * `id` must be unused by both pictures. Returns its three beats, to place in a flight thunk.
 * To send away a part the current picture has, leave it in the same beat as the token appears.
 */
export function pass(c: Choreography, id: string, token: Mobject, via: readonly Vec[], { appear = 0.25, move = 0.9, leave = 0.25 }: FlightTiming = {}): Beat[] {
  const walk = c.travel(id, token.moveTo(via[0]!), route(via[0]!, ...via.slice(1)), { appear, move, leave });
  return [walk.appear, walk.move, walk.leave];
}

// ---------------------------------------------------------------------------------------------
// Small helpers (private)

const keyedAs = <T extends Mobject>(m: T, k: string): T => keyed(m, k);
const markAs = <T extends Mobject>(m: T, as: string): T => emphasised(m, as);
