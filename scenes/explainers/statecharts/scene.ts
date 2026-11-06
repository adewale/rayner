import { Scene, Group, Text, Rectangle, Arrow, CurvedArrow, Line, Circle, Dot, FadeIn, AnimationGroup, Succession, view, matchByKey, Machine, choreograph } from '../../../src/index.ts';
import type { Mobject, MatchKey, Vec, Box, VMobject, Transition } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import type { Stage } from '../../../explain/index.ts';
import { CONTROLS, FROTHER, RUNS, player, coffee, coffeeWithFrother, boxed, byHand, flatten, flatName, run, activeStates, chartCounts, flatCounts, initial, send, drivenStart, drivenNext, events as chartEvents } from '../lib/statecharts.ts';
import type { StateNode, FlatMachine, Driven } from '../lib/statecharts.ts';

// Every box and arrow below is drawn from a model state or transition; only positions are chosen
// here. Parts are keyed by where they sit in the grid of playback × volume, so a state keeps its
// identity as the pictures change: paused becomes paused · unmuted, a box's words become the
// states of the regions, and duplicates fade.

const [PLAYBACK, VOLUME, SUBTITLES] = CONTROLS as [(typeof CONTROLS)[0], (typeof CONTROLS)[1], (typeof CONTROLS)[2]];
type Cell = readonly [row: number, col: number];
const cellKey = ([r, c]: Cell) => `${r},${c}`;
/** A state's place in the grid: playback chooses the row, volume (if any) the column. */
function cellOf(states: readonly string[]): Cell {
  const row = PLAYBACK.states.findIndex((s) => states.includes(s)),
    col = VOLUME.states.findIndex((s) => states.includes(s));
  return [row, Math.max(0, col)];
}
/** The words a flat state is shown with: the boxes it is in, without on. */
const wordsOf = (chart: StateNode, config: readonly string[]) => activeStates(chart, [...config]).filter((s) => s !== 'on');

// Layout in local units, mapped into a frame by `fit`.
const F = 0.37, // state words
  L = 0.31, // arrow labels
  CELL: Vec = [2.4, 1.15],
  OFF_BOX: Vec = [1.3, 0.8],
  STATE: Vec = [1.9, 0.75];
const FLAT = { bounds: [-6.35, -4.0, 5.3, 3.3] as Box, off: [-5.15, 0] as Vec, cols: [-0.95, 3.65], rows: [1.25, -1.25] };
const CHART = { bounds: [-5.4, -3.75, 5.4, 3.5] as Box, off: [-3.4, 3.0] as Vec, on: [-5.2, -2.95, 5.2, 1.75] as Box, cols: [-2.2, 2.2], rows: [0.55, -1.75] };

/** Where local units land in a frame, and how big they are there. */
interface Fit { k: number; at: (p: Vec) => Vec }
function fit(bounds: Box, frame: Box, k: number): Fit {
  const cx = (bounds[0] + bounds[2]) / 2,
    cy = (bounds[1] + bounds[3]) / 2,
    fx = (frame[0] + frame[2]) / 2,
    fy = (frame[1] + frame[3]) / 2;
  return { k, at: ([x, y]) => [fx + (x - cx) * k, fy + (y - cy) * k] };
}
const scaleFor = (bounds: Box, frame: Box, max = 1.2) =>
  Math.min((frame[2] - frame[0]) / (bounds[2] - bounds[0]), (frame[3] - frame[1]) / (bounds[3] - bounds[1]), max);

interface Look {
  /** Grid cells ("1,1"), state ids or "off", drawn in the followed colour. */
  follow: readonly string[];
  /** Arrow keys drawn in the emphasis colour. */
  lit: readonly string[];
}
interface Drawn { group: Group; words: string[] }
interface Place { center: Vec; size: Vec }

/** A box with one or two words stacked in it. */
function stateBox(s: Stage, f: Fit, key: string, center: Vec, size: Vec, words: readonly { key: string; text: string }[], followed: boolean, dashed = false) {
  const box = keyed(
    new Rectangle({
      width: size[0] * f.k,
      height: size[1] * f.k,
      cornerRadius: 0.14 * f.k,
      fill: s.palette.paper,
      stroke: followed ? s.good : s.soft,
      strokeWidth: (followed ? 0.06 : 0.026) * f.k,
      ...(dashed ? { dashArray: `${0.12 * f.k} ${0.09 * f.k}` } : {}),
    }).moveTo(f.at(center)),
    key,
  );
  const gap = words.length > 1 ? 0.22 : 0;
  const texts = words.map((w, i) =>
    keyed(new Text(w.text, { fontSize: F * f.k, color: dashed ? s.soft : s.palette.ink }).moveTo(f.at([center[0], center[1] + gap * (i ? -1 : 1)])), w.key),
  );
  return [box, ...texts];
}
/** A start dot and its short arrow into a box: the state a compound state enters first. */
function start(s: Stage, f: Fit, key: string, target: Place, from: 'left' | 'above') {
  const edge: Vec = from === 'left' ? [target.center[0] - target.size[0] / 2 - 0.07, target.center[1]] : [target.center[0], target.center[1] + target.size[1] / 2 + 0.07];
  const dot: Vec = from === 'left' ? [edge[0] - 0.62, edge[1]] : [edge[0], edge[1] + 0.62];
  return [
    keyed(new Circle({ radius: 0.09 * f.k, fill: s.palette.ink, stroke: 'none' }).moveTo(f.at(dot)), key),
    keyed(new Arrow(f.at([dot[0] + (from === 'left' ? 0.1 : 0), dot[1] - (from === 'left' ? 0 : 0.1)]), f.at(edge), arrowStyle(s, f, false)), `${key}|arrow`),
  ];
}
/** Where a ray from inside a box leaves it. */
function exit(center: Vec, half: Vec, from: Vec, dir: Vec): Vec {
  const t = Math.min(...[0, 1].map((i) => (dir[i] === 0 ? Infinity : ((dir[i]! > 0 ? center[i]! + half[i]! : center[i]! - half[i]!) - from[i]!) / dir[i]!)));
  return [from[0] + dir[0] * t, from[1] + dir[1] * t];
}
const arrowStyle = (s: Stage, f: Fit, lit: boolean) => ({ stroke: lit ? s.emphasis : s.soft, strokeWidth: (lit ? 0.05 : 0.028) * f.k, tipLength: 0.2 * f.k, tipWidth: 0.17 * f.k });
/**
 * A straight arrow between two boxes. A pair (one each way) is offset to the right of travel, so the
 * two never overlap, with each label further out on its own side; a single arrow's label goes on `side`.
 */
function straight(s: Stage, f: Fit, key: string, a: Place, b: Place, label: string, paired: boolean, lit: boolean, side: 1 | -1 = 1) {
  const d0: Vec = [b.center[0] - a.center[0], b.center[1] - a.center[1]],
    len = Math.hypot(...d0),
    dir: Vec = [d0[0] / len, d0[1] / len],
    right: Vec = [dir[1], -dir[0]],
    off = paired ? 0.15 : 0;
  const shift = (p: Vec): Vec => [p[0] + right[0] * off, p[1] + right[1] * off];
  const half = (p: Place): Vec => [p.size[0] / 2 + 0.07, p.size[1] / 2 + 0.07];
  const start = exit(a.center, half(a), shift(a.center), dir),
    end = exit(b.center, half(b), shift(b.center), [-dir[0], -dir[1]]);
  const arrow = keyed(new Arrow(f.at(start), f.at(end), arrowStyle(s, f, lit)), key);
  const text = keyed(new Text(label, { fontSize: L * f.k, color: lit ? s.emphasis : s.soft }), `${key}|label`);
  const out: Vec = paired ? right : [right[0] * side, right[1] * side];
  const reach = Math.abs(out[0]) * (text.width() / f.k / 2) + Math.abs(out[1]) * (L * 0.4) + 0.12 + off;
  const mid: Vec = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  text.moveTo(f.at([mid[0] + out[0] * reach, mid[1] + out[1] * reach]));
  return [arrow, text];
}
/** A curved arrow bulging by `angle`, labelled outside its apex. */
function curved(s: Stage, f: Fit, key: string, start: Vec, end: Vec, angle: number, label: string, lit: boolean) {
  const arrow = keyed(new CurvedArrow(f.at(start), f.at(end), { angle, ...arrowStyle(s, f, lit) }), key);
  const chord: Vec = [end[0] - start[0], end[1] - start[1]],
    d = Math.hypot(...chord),
    r = d / (2 * Math.sin(Math.abs(angle) / 2)),
    sag = r * (1 - Math.cos(angle / 2)),
    n: Vec = [(chord[1] / d) * Math.sign(angle), (-chord[0] / d) * Math.sign(angle)];
  const apex: Vec = [(start[0] + end[0]) / 2 + n[0] * sag, (start[1] + end[1]) / 2 + n[1] * sag];
  const text = keyed(new Text(label, { fontSize: L * f.k, color: lit ? s.emphasis : s.soft }), `${key}|label`);
  const reach = 0.2 + Math.abs(n[0]) * (text.width() / f.k / 2) + Math.abs(n[1]) * (L * 0.4);
  text.moveTo(f.at([apex[0] + n[0] * reach, apex[1] + n[1] * reach]));
  return [arrow, text];
}
const note = (s: Stage, f: Fit, bounds: Box, text: string) =>
  keyed(new Text(text, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([(bounds[0] + bounds[2]) / 2, bounds[1] + 0.22])), 'note');
const counted = (n: { states: number; transitions: number }) => `${n.states} boxes · ${n.transitions} transitions`;
const flatLabel = (chart: StateNode, flat: FlatMachine, name: string) => (name === flat.initial ? 'off' : wordsOf(chart, flat.configurations[name]!).join(' · '));

/**
 * The flat machine as a grid: off on the left, one box per reachable configuration, rows for
 * playback and columns for volume, and a dashed empty box for a combination it never reaches.
 */
function flatPicture(s: Stage, chart: StateNode, f: Fit, look: Look): Drawn {
  const flat = flatten(chart),
    parts: Mobject[] = [],
    words: string[] = [];
  const cells = new Map<string, Cell>();
  for (const name of flat.states) if (name !== flat.initial) cells.set(name, cellOf(wordsOf(chart, flat.configurations[name]!)));
  const twoCols = [...cells.values()].some((c) => c[1] === 1);
  const place = (cell: Cell): Place => ({ center: [FLAT.cols[cell[1]]!, FLAT.rows[cell[0]]!], size: CELL });
  const offPlace: Place = { center: FLAT.off, size: OFF_BOX };
  parts.push(...stateBox(s, f, 'off', FLAT.off, OFF_BOX, [{ key: 'off|w', text: 'off' }], look.follow.includes('off')));
  words.push(`off${look.follow.includes('off') ? ' (followed)' : ''}`, 'start → off');
  parts.push(...start(s, f, 'start:off', offPlace, 'above'));
  for (const [name, cell] of cells) {
    const k = cellKey(cell),
      w = wordsOf(chart, flat.configurations[name]!);
    parts.push(...stateBox(s, f, `cell:${k}`, place(cell).center, CELL, w.map((t, i) => ({ key: `word:${k}:${i}`, text: t })), look.follow.includes(k)));
    words.push(w.join(' · ') + (look.follow.includes(k) ? ' (followed)' : ''));
  }
  const at = (n: string) => (n === flat.initial ? 'off' : cellKey(cells.get(n)!));
  const middle: Vec = [(FLAT.cols[0]! + (twoCols ? FLAT.cols[1]! : FLAT.cols[0]!)) / 2, 0];
  for (const t of flat.transitions) {
    const key = `arrow:${at(t.from)}:${t.event}:${at(t.to)}`,
      lit = look.lit.includes(key);
    const paired = flat.transitions.some((u) => u.from === t.to && u.to === t.from);
    const far = t.to === flat.initial ? cells.get(t.from)! : null;
    if (far && far[1] === 1) {
      // From the far column, POWER goes round the grid: over the top row, under the bottom one.
      const c = place(far).center,
        top = far[0] === 0 ? 1 : -1;
      const start: Vec = [c[0], c[1] + top * (CELL[1] / 2 + 0.07)],
        end: Vec = [FLAT.off[0] - OFF_BOX[0] / 2 - 0.07, FLAT.off[1] + top * 0.16];
      parts.push(...curved(s, f, key, start, end, 1.15 * top, t.event, lit));
    } else {
      const a = t.from === flat.initial ? offPlace : place(cells.get(t.from)!),
        b = t.to === flat.initial ? offPlace : place(cells.get(t.to)!);
      // A single arrow's label goes on whichever side faces away from the grid's middle.
      const mid: Vec = [(a.center[0] + b.center[0]) / 2, (a.center[1] + b.center[1]) / 2],
        d: Vec = [b.center[0] - a.center[0], b.center[1] - a.center[1]];
      const side = d[1] * (mid[0] - middle[0]) - d[0] * (mid[1] - middle[1]) >= 0 ? 1 : -1;
      parts.push(...straight(s, f, key, a, b, t.event, paired, lit, side));
    }
    words.push(`${flatLabel(chart, flat, t.from)} → ${flatLabel(chart, flat, t.to)}: ${t.event}${lit ? ' (marked)' : ''}`);
  }
  parts.push(note(s, f, FLAT.bounds, `Flat: ${counted(flatCounts(flat))}`));
  return { group: new Group(...parts), words };
}

type ChartKind = 'boxed' | 'regions';
/**
 * The player as a statechart. `boxed`: the flat grid inside on, which carries POWER once. `regions`:
 * playback and volume side by side in on. A state takes the key of the grid part it comes from, so
 * changing kind moves those parts instead of redrawing them.
 */
function chartPicture(s: Stage, source: StateNode, kind: ChartKind, f: Fit, look: Look, counts = true): Drawn {
  const parts: Mobject[] = [],
    words: string[] = [];
  const chart = kind === 'boxed' ? boxed(source) : source;
  const box = (key: string, b: Box, followed: boolean, r = 0.2) =>
    keyed(
      new Rectangle({ width: (b[2] - b[0]) * f.k, height: (b[3] - b[1]) * f.k, cornerRadius: r * f.k, fill: 'none', stroke: followed ? s.good : s.soft, strokeWidth: (followed ? 0.06 : 0.03) * f.k }).moveTo(
        f.at([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]),
      ),
      key,
    );
  parts.push(box('r:on', CHART.on, look.follow.includes('on')), keyed(new Text('on', { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([CHART.on[0] + 0.45, CHART.on[3] - 0.3])), 'r:on|w'));
  parts.push(...stateBox(s, f, 'r:off', CHART.off, OFF_BOX, [{ key: 'r:off|w', text: 'off' }], look.follow.includes('off')));
  words.push(`on${look.follow.includes('on') ? ' (followed)' : ''}`, `off${look.follow.includes('off') ? ' (followed)' : ''}`);
  // POWER, written once on on: a pair between off and the top of the box.
  for (const [to, dx, up] of [['on', -0.16, false], ['off', 0.16, true]] as const) {
    const key = `r:power:${to}`,
      lit = look.lit.includes(key),
      x = CHART.off[0] + dx,
      top = CHART.off[1] - OFF_BOX[1] / 2 - 0.07,
      bottom = CHART.on[3] + 0.07;
    const label = keyed(new Text('POWER', { fontSize: L * f.k, color: lit ? s.emphasis : s.soft }), `${key}|label`);
    label.moveTo(f.at([x + (up ? 1 : -1) * (label.width() / f.k / 2 + 0.14), (top + bottom) / 2]));
    parts.push(keyed(new Arrow(f.at([x, up ? bottom : top]), f.at([x, up ? top : bottom]), arrowStyle(s, f, lit)), key), label);
    words.push(`${up ? 'on → off' : 'off → on'}: POWER${lit ? ' (marked)' : ''}`);
  }

  // Each kind's places, box keys and words, by state id; an arrow between two ids needs both places.
  const places = new Map<string, Place>(),
    boxKey = new Map<string, string>(),
    wordKeys = new Map<string, { key: string; text: string }[]>();
  if (kind === 'boxed') {
    const flat = flatten(source);
    for (const name of flat.states) {
      if (name === flat.initial) continue;
      const w = wordsOf(source, flat.configurations[name]!),
        cell = cellOf(w),
        k = cellKey(cell);
      places.set(name, { center: [CHART.cols[cell[1]]!, CHART.rows[cell[0]]!], size: CELL });
      boxKey.set(name, `r:cell:${k}`);
      wordKeys.set(name, w.map((t, i) => ({ key: `r:word:${k}:${i}`, text: t })));
    }
  } else if (kind === 'regions') {
    const x = [-2.6, 2.6];
    // Playback takes the grid's left column, volume its right; each word comes from a box that holds it.
    const from: Record<string, [box: string, word: string]> = {
      [PLAYBACK.states[0]]: ['0,0', '0,0:0'],
      [PLAYBACK.states[1]]: ['1,0', '1,1:0'],
      [VOLUME.states[0]]: ['0,1', '0,0:1'],
      [VOLUME.states[1]]: ['1,1', '1,1:1'],
    };
    [PLAYBACK, VOLUME].forEach((c, i) =>
      c.states.forEach((id, r) => {
        places.set(id, { center: [x[i]!, CHART.rows[r]!], size: STATE });
        boxKey.set(id, `r:cell:${from[id]![0]}`);
        wordKeys.set(id, [{ key: `r:word:${from[id]![1]}`, text: id }]);
      }),
    );
    parts.push(keyed(new Line(f.at([0, CHART.on[3] - 0.1]), f.at([0, CHART.on[1] + 0.1]), { stroke: s.soft, strokeWidth: 0.026 * f.k, dashArray: `${0.14 * f.k} ${0.1 * f.k}` }), 'r:divider'));
    for (const [i, c] of [PLAYBACK, VOLUME].entries()) {
      parts.push(keyed(new Text(c.region, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([x[i]!, CHART.on[1] + 0.32])), `r:region:${c.region}`));
      words.push(`region ${c.region}`);
    }
  }
  for (const [id, key] of boxKey) {
    const p = places.get(id)!,
      followed = look.follow.includes(id) || look.follow.includes(key.slice('r:cell:'.length));
    parts.push(...stateBox(s, f, key, p.center, p.size, wordKeys.get(id)!, followed));
    words.push(wordKeys.get(id)!.map((w) => w.text).join(' · ') + (followed ? ' (followed)' : ''));
  }
  // A start dot for every compound state: the root enters off; on, each region and playing enter their initial child.
  const compounds = (n: StateNode): StateNode[] => [...(n.type === 'compound' ? [n] : []), ...(n.children ?? []).flatMap(compounds)];
  for (const n of compounds(chart)) {
    const target = n.initial === 'off' ? { center: CHART.off, size: OFF_BOX } : places.get(n.initial!);
    if (!target) throw new Error(`No place for ${n.initial}, where ${n.id} starts`);
    parts.push(...start(s, f, `r:start:${n.id}`, target, 'left'));
    words.push(`start of ${n.id === chart.id ? 'the chart' : n.id} → ${wordKeys.get(n.initial!)?.map((w) => w.text).join(' · ') ?? n.initial}`);
  }
  // Every transition the chart writes, except POWER on off and on (drawn above), between the places of its ends.
  const written: { from: string; event: string; to: string }[] = [];
  const collect = (n: StateNode) => {
    if (n.id !== 'off' && n.id !== 'on') for (const [event, to] of Object.entries(n.on ?? {})) written.push({ from: n.id, event, to });
    for (const c of n.children ?? []) collect(c);
  };
  collect(chart);
  const grid = (id: string) => boxKey.get(id)?.slice('r:cell:'.length) ?? id;
  // Outside the grid, an arrow keeps the key of the grid arrow it replaces: the duplicates fade, one remains.
  const lineage: Record<string, string> = { PLAY: '0,0:PLAY:1,0', PAUSE: '1,0:PAUSE:0,0', MUTE: '0,0:MUTE:0,1', UNMUTE: '0,1:UNMUTE:0,0' };
  for (const t of written) {
    const a = places.get(t.from),
      b = places.get(t.to);
    if (!a || !b) throw new Error(`No place for ${t.from} → ${t.to}`);
    const key = kind === 'boxed' ? `r:arrow:${grid(t.from)}:${t.event}:${grid(t.to)}` : `r:arrow:${lineage[t.event]}`,
      lit = look.lit.includes(key);
    parts.push(...straight(s, f, key, a, b, t.event, written.some((u) => u.from === t.to && u.to === t.from), lit));
    const name = (id: string) => wordKeys.get(id)?.map((w) => w.text).join(' · ') ?? id;
    words.push(`${name(t.from)} → ${name(t.to)}: ${t.event}${lit ? ' (marked)' : ''}`);
  }
  if (counts) parts.push(note(s, f, CHART.bounds, `Statechart: ${counted(chartCounts(chart))}`));
  return { group: new Group(...parts), words };
}

/** Morphs pair parts by key: shapes by their place in the keyed part, a keyed word only with the same word. */
const byKey: MatchKey = matchByKey({ text: 'whole' });


// The coffee machine: a column of on states, off to its right. `plain` is the machine before it has a
// power button; `flat` gives each state its own POWER_OFF, copied by hand with brewing's forgotten; `chart` puts them in the box on;
// `question` adds the frother beside it, not yet placed; `frother` splits on into the brewing cycle and the frother.
type CoffeeMode = 'plain' | 'flat' | 'chart' | 'question' | 'frother';
/** The state whose POWER_OFF the hand-copied flat machine forgets. */
const FORGOT = 'brewing';
const COFFEE = {
  x: -2.4,
  ys: { idle: 2.05, grinding: 0.65, brewing: -0.75, ready: -2.15 } as Record<string, number>,
  size: [2.4, 0.8] as Vec,
  frotherX: 0.95,
  frotherYs: { still: 0.95, frothing: -0.95 } as Record<string, number>,
  frotherSize: [2.1, 0.8] as Vec,
};
const coffeeLayout = (mode: CoffeeMode) => {
  const wide = mode === 'frother',
    short = mode !== 'flat' && mode !== 'plain';
  const on: Box = wide ? [-5.45, -3.35, 2.35, 3.2] : [-5.45, -2.9, -0.7, 3.2];
  const offX = wide ? 5.35 : 3.0;
  const off: Place = short ? { center: [offX, 1.25], size: [1.3, 2.4] } : { center: [offX, -0.05], size: [1.3, 5.0] };
  const bounds: Box = mode === 'question' ? [-6.4, -3.75, 7.3, 3.45] : wide ? [-6.4, -4.15, 6.2, 3.45] : [-6.4, -3.75, 5.0, 3.45];
  return { on, off, bounds, onPlace: { center: [(on[0] + on[2]) / 2, (on[1] + on[3]) / 2], size: [on[2] - on[0], on[3] - on[1]] } as Place };
};
function coffeePicture(s: Stage, f: Fit, mode: CoffeeMode, look: Look, dispatch = false): Drawn {
  const chart = mode === 'frother' ? coffeeWithFrother() : coffee(),
    lay = coffeeLayout(mode),
    parts: Mobject[] = [],
    words: string[] = [];
  const places = new Map<string, Place>(mode === 'plain' ? [] : [['off', lay.off]]);
  for (const [id, y] of Object.entries(COFFEE.ys)) places.set(id, { center: [COFFEE.x, y], size: COFFEE.size });
  const frotherX = mode === 'question' ? 5.9 : COFFEE.frotherX;
  if (mode === 'question' || mode === 'frother') for (const [id, y] of Object.entries(COFFEE.frotherYs)) places.set(id, { center: [frotherX, y], size: COFFEE.frotherSize });
  const boxed = mode !== 'flat' && mode !== 'plain';
  if (boxed) {
    const followed = look.follow.includes('on');
    parts.push(
      keyed(
        new Rectangle({ width: lay.onPlace.size[0] * f.k, height: lay.onPlace.size[1] * f.k, cornerRadius: 0.2 * f.k, fill: 'none', stroke: followed ? s.good : s.soft, strokeWidth: (followed ? 0.06 : 0.03) * f.k }).moveTo(f.at(lay.onPlace.center)),
        'c:on',
      ),
      keyed(new Text('on', { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([lay.on[0] + 0.42, lay.on[3] - 0.32])), 'c:on|w'),
    );
    words.push(`on, a box holding ${Object.keys(COFFEE.ys).join(', ')}${mode === 'frother' ? ' and the frother' : ''}${followed ? ' (current)' : ''}`);
  }
  if (mode === 'frother') {
    parts.push(keyed(new Line(f.at([-0.6, lay.on[3] - 0.15]), f.at([-0.6, lay.on[1] + 0.15]), { stroke: s.soft, strokeWidth: 0.026 * f.k, dashArray: `${0.14 * f.k} ${0.1 * f.k}` }), 'c:divider'));
    for (const [text, x] of [['brewing cycle', -3.3], ['frother', COFFEE.frotherX]] as const)
      parts.push(keyed(new Text(text, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([x, lay.on[1] + 0.3])), `c:region:${text}`));
    words.push('a dashed line splits on into two regions: the brewing cycle and the frother');
  }
  if (mode === 'question') {
    parts.push(
      keyed(new Text('new: a frother', { fontSize: F * f.k, color: s.emphasis }).moveTo(f.at([frotherX, 3.1])), 'c:new'),
      keyed(new Text('any time the machine is on', { fontSize: L * f.k, color: s.emphasis }).moveTo(f.at([frotherX, 2.62])), 'c:new2'),
    );
    words.push('new: a frother, still or frothing, any time the machine is on; where it goes is the question');
  }
  for (const [id, p] of places) {
    parts.push(...stateBox(s, f, `c:${id}`, p.center, p.size, [{ key: `c:${id}|w`, text: id }], look.follow.includes(id)));
    words.push(id + (look.follow.includes(id) ? ' (current)' : ''));
  }
  if (mode === 'plain') {
    parts.push(...start(s, f, 'c:start:on', places.get('idle')!, 'above'));
    words.push('start → idle');
  } else {
    parts.push(...start(s, f, 'c:start:machine', places.get('off')!, 'above'));
    words.push('start → off');
  }
  if (boxed) {
    parts.push(...start(s, f, 'c:start:on', places.get('idle')!, 'above'));
    words.push('start of the cycle → idle');
  }
  if (mode === 'question' || mode === 'frother') {
    parts.push(...start(s, f, 'c:start:frother', places.get('still')!, 'above'));
    words.push('start of the frother → still');
  }
  // Arrows from the model: the flat machine's transitions, or those the chart writes; the question adds the frother's own pair.
  const written = (root: StateNode) => {
    const out: { from: string; event: string; to: string }[] = [];
    const collect = (n: StateNode) => {
      for (const [event, to] of Object.entries(n.on ?? {})) out.push({ from: n.id, event, to });
      for (const c of n.children ?? []) collect(c);
    };
    collect(root);
    return out;
  };
  const arrows =
    mode === 'plain'
      ? flatten(chart).transitions.filter((t) => t.from !== 'off' && t.to !== 'off')
      : mode === 'flat'
      ? flatten(byHand(chart, FORGOT, 'POWER_OFF')).transitions
      : mode === 'question'
        ? [...written(chart), { from: 'still', event: FROTHER.events[0], to: 'frothing' }, { from: 'frothing', event: FROTHER.events[1], to: 'still' }]
        : written(chart);
  const lineage = (t: { from: string; event: string; to: string }) =>
    t.from === 'on' ? 'c:arrow:grinding:POWER_OFF:off' : t.to === 'on' ? 'c:arrow:off:POWER_ON:idle' : `c:arrow:${t.from}:${t.event}:${t.to}`;
  const at = (id: string) => (id === 'on' ? lay.onPlace : places.get(id));
  for (const t of arrows) {
    const key = lineage(t),
      lit = look.lit.includes(key);
    const a = at(t.from),
      b = at(t.to);
    if (!a || !b) throw new Error(`No place for ${t.from} → ${t.to}`);
    if (t.event === 'TAKE') {
      const half = COFFEE.size[0] / 2 + 0.07;
      parts.push(...curved(s, f, key, [a.center[0] - half, a.center[1]], [b.center[0] - half, b.center[1]], -1.3, t.event, lit));
    } else if (t.from === 'off' || t.to === 'off') {
      const other = t.from === 'off' ? b : a,
        paired = arrows.some((u) => u.from === t.to && u.to === t.from),
        y = (other === lay.onPlace ? lay.off.center[1] : other.center[1]) + (paired ? (t.to === 'off' ? 0.13 : -0.13) : 0);
      const left = other.center[0] + other.size[0] / 2 + 0.07,
        right = lay.off.center[0] - lay.off.size[0] / 2 - 0.07;
      const [x1, x2] = t.to === 'off' ? [left, right] : [right, left];
      parts.push(keyed(new Arrow(f.at([x1, y]), f.at([x2, y]), arrowStyle(s, f, lit)), key));
      const below = paired && t.from === 'off';
      parts.push(keyed(new Text(t.event, { fontSize: L * f.k, color: lit ? s.emphasis : s.soft }).moveTo(f.at([(left + right) / 2, y + (below ? -0.27 : 0.27)])), `${key}|label`));
    } else {
      const paired = arrows.some((u) => u.from === t.to && u.to === t.from);
      parts.push(...straight(s, f, key, a, b, t.event, paired, lit, -1));
    }
    words.push(`${t.from} → ${t.to}: ${t.event}${lit ? ' (marked)' : ''}`);
  }
  if (mode === 'flat') {
    // The copy that was forgotten: a dashed red gap where brewing's POWER_OFF should be.
    const y = COFFEE.ys[FORGOT]!,
      left = COFFEE.x + COFFEE.size[0] / 2 + 0.07,
      right = lay.off.center[0] - lay.off.size[0] / 2 - 0.07,
      key = `c:arrow:${FORGOT}:POWER_OFF:off`;
    parts.push(
      keyed(new Line(f.at([left, y]), f.at([right, y]), { stroke: s.bad, strokeWidth: 0.04 * f.k, dashArray: `${0.12 * f.k} ${0.1 * f.k}` }), key),
      keyed(new Text('no POWER_OFF', { fontSize: L * f.k, color: s.bad, weight: 'bold' }).moveTo(f.at([(left + right) / 2, y + 0.27])), `${key}|label`),
    );
    words.push(`${FORGOT} → off: POWER_OFF missing (marked)`);
  }
  if (dispatch) {
    // Who answers POWER_OFF while brewing: brewing first, then its parent.
    const lines = ['POWER_OFF while brewing (green):', '1. brewing: no POWER_OFF', '2. its parent on: has it → off'];
    lines.forEach((text, i) =>
      parts.push(keyed(new Text(text, { fontSize: L * f.k, color: i ? s.palette.ink : s.soft }).moveTo(f.at([2.35, -0.95 - i * 0.55])), `c:dispatch:${i}`)),
    );
    words.push(...lines);
  }
  const n = mode === 'plain' ? { states: places.size, transitions: arrows.length } : mode === 'flat' ? flatCounts(flatten(byHand(chart, FORGOT, 'POWER_OFF'))) : chartCounts(chart);
  const kind = mode === 'plain' ? 'State machine' : mode === 'flat' ? 'Flat' : 'Statechart';
  if (mode !== 'question') parts.push(note(s, f, lay.bounds, `${kind}: ${counted(n)}`));
  return { group: new Group(...parts), words };
}

/** The same events through the statechart and its flat machine, row by row. */
function tracePicture(s: Stage, f: Fit): Drawn {
  const chart = player(2),
    flat = flatten(chart),
    steps = run(chart, RUNS.player);
  let state = flat.initial;
  const rows = [{ event: 'start', chart: ['off'], flat: flat.initial }];
  for (const st of steps) {
    state = flat.transitions.find((t) => t.from === state && t.event === st.event)?.to ?? state;
    rows.push({ event: st.event, chart: st.config, flat: state });
  }
  const label = (name: string) => (name === flat.initial ? 'off' : wordsOf(chart, flat.configurations[name]!).join(' · '));
  const xs = [-5.2, -2.0, 2.4, 5.0],
    top = 2.3,
    gap = 0.85;
  const parts: Mobject[] = ['event', 'statechart: a state per region', 'flat machine: one state', ''].map((h, i) =>
    keyed(new Text(h, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([xs[i]!, top])), `t:head:${i}`),
  );
  const words: string[] = [];
  rows.forEach((r, i) => {
    const y = top - (i + 1) * gap,
      same = flatName(r.chart) === r.flat;
    parts.push(
      keyed(new Text(r.event, { fontSize: F * f.k, color: s.palette.ink, font: 'mono' }).moveTo(f.at([xs[0]!, y])), `t:${i}:0`),
      keyed(new Text(r.chart.join(' + '), { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([xs[1]!, y])), `t:${i}:1`),
      keyed(new Text(label(r.flat), { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([xs[2]!, y])), `t:${i}:2`),
      keyed(new Text(same ? 'same' : 'differs', { fontSize: F * f.k, color: same ? s.good : s.bad }).moveTo(f.at([xs[3]!, y])), `t:${i}:3`),
    );
    words.push(`${r.event}: statechart ${r.chart.join(' + ')}, flat ${label(r.flat)}, ${same ? 'same' : 'differs'}`);
  });
  const fc = flatCounts(flat),
    cc = chartCounts(chart);
  const tail = [`Flat: ${counted(fc)}    Statechart: ${counted(cc)}`, 'At run time both are in one combination; regions shrink only the drawing'];
  tail.forEach((t, i) => parts.push(keyed(new Text(t, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([0, top - rows.length * gap - 0.85 - i * 0.48])), `t:tail:${i}`)));
  return { group: new Group(...parts), words: [...words, ...tail] };
}
// The table's extent, header to the last line under it, in its own units.
const TRACE: Box = [-6.4, -3.5, 6.2, 2.55];

// The check questions' machines, which no step draws. Each changes the frother, or replays the last step's machine.
const atomic = (id: string, on?: Record<string, string>): StateNode => ({ id, type: 'atomic', ...(on ? { on } : {}) });
const frotherRegion = (): StateNode => ({
  id: FROTHER.region,
  type: 'compound',
  initial: FROTHER.states[0],
  children: [atomic(FROTHER.states[0], { [FROTHER.events[0]]: FROTHER.states[1] }), atomic(FROTHER.states[1], { [FROTHER.events[1]]: FROTHER.states[0] })],
});
/** Check 1: a frother with its own power, which works whether the machine is on or off: a region beside the whole machine. */
const frotherOutside = (): StateNode => ({ id: 'kit', type: 'parallel', children: [coffee(), frotherRegion()] });
/** Check 2: a frother that runs on the brewing steam, so it exists only while brewing: a box inside brewing. */
const frotherInBrewing = (): StateNode => {
  const base = coffee();
  const swap = (n: StateNode): StateNode =>
    n.id === 'brewing' ? { ...frotherRegion(), id: 'brewing', on: n.on } : { ...n, ...(n.children ? { children: n.children.map(swap) } : {}) };
  return swap(base);
};
/** The counts and states the check questions ask about, from the model. */
const CHECKS = (() => {
  const inside = flatten(coffeeWithFrother()),
    outside = flatten(frotherOutside()),
    steam = flatten(frotherInBrewing());
  // Outside on, the frother can froth while the machine is off; inside on, it cannot.
  const offFrothing = (m: typeof inside) => Object.values(m.configurations).some((c) => c.includes('off') && c.includes('frothing'));
  if (!offFrothing(outside) || offFrothing(inside)) throw new Error('Only the frother outside on froths while the machine is off');
  // On steam, frothing pairs only with brewing, so two-word names stop at brewing.
  if (Object.values(steam.configurations).some((c) => c.includes('frothing') && !activeStates(frotherInBrewing(), c).includes('brewing')))
    throw new Error('The steam frother froths only while brewing');
  // Check 3: the last step's machine switched off while grinding and frothing, then on again.
  const again = run(coffeeWithFrother(), [...RUNS.frother, 'POWER_ON']).at(-1)!.config;
  return {
    machine: flatten(coffee()).states.length,
    inside: flatCounts(inside),
    outside: flatCounts(outside),
    steam: { flat: flatCounts(steam), chart: chartCounts(frotherInBrewing()) },
    again,
  };
})();

export default class Statecharts extends Scene {
  static meta = {
    id: 'statecharts',
    title: 'What is a statechart, and why use one instead of a state machine?',
    sources: [
      'https://x.com/DavidKPiano/status/2116523008323981315',
      'https://www.state-machine.com/doc/Harel87.pdf',
      'https://www.w3.org/TR/2015/REC-scxml-20150901/',
      'https://www.npmjs.com/package/xstate/v/5.33.3',
    ],
    watch: { current: 'Current states' },
    // The script's answer and check questions (script.md); check holds a step (parent) to stating the answer.
    answer: 'A statechart is a state machine whose states can contain other states, active one at a time or several at once',
    // Sentences that reach past the charts on screen, and the test that holds each against the model and XState.
    claims: [
      { says: 'is always in exactly one of four boxes', test: 'test/statecharts.test.ts: the coffee machine is always in exactly one state' },
      { says: 'A POWER_OFF copied onto every state, and one copy missed', shown: true as const },
      { says: 'playback and volume never affect each other', test: 'test/statecharts.test.ts: every arrow between them changes one word and keeps the other' },
      { says: 'Every name is two words, one per feature', test: 'test/statecharts.test.ts: every flat state while on names one state per region' },
      { says: 'a further feature adds a region of two states where the flat machine doubles', test: 'test/statecharts.test.ts: each on/off feature adds a region of two states' },
      { says: 'Only the drawing changes', test: 'test/statecharts.test.ts: flattening each drawn chart reaches the configurations and transitions XState reaches' },
      { says: 'every state while on would pair one of the four brewing states with still or frothing', test: 'test/statecharts.test.ts: every pair is reachable' },
    ],
    // Questions that change this explainer's frother or replay its last machine, none of which a step shows.
    checks: [
      {
        question:
          'Give the frother its own power, so FROTH and STOP work whether the coffee machine is on or off. Where does the frother region go now, and how many states does the flat machine need?',
        answer: `Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s ${CHECKS.machine} states pairs with still or frothing, off included: ${CHECKS.outside.states} states where the frother inside on needed ${CHECKS.inside.states}.`,
      },
      {
        question:
          'Now the frother runs on the brewing steam, so it can be still or frothing only while brewing, and leaving brewing stops it. Write the flat machine’s state names. Does the second sign still say “region”, and where does the frother go?',
        answer: `The names are off, idle, grinding, brewing · still, brewing · frothing and ready: ${CHECKS.steam.flat.states} states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws ${CHECKS.steam.chart.transitions} transitions where the flat machine draws ${CHECKS.steam.flat.transitions}.`,
      },
      {
        question:
          'In the last step the machine is grinding while the frother is frothing. Press POWER_OFF, then POWER_ON. Is the frother still frothing?',
        answer: `No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: ${CHECKS.again.join(' and ')}. Nothing in the chart remembers where a region was when the machine went off.`,
      },
    ],
  };

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.54 });
    const playerChart = player(2),
      coffeeFlat = flatCounts(flatten(coffee())),
      coffeePlain = flatten(coffee()).transitions.filter((t) => t.from !== 'off' && t.to !== 'off').length,
      coffeeChart = chartCounts(coffee()),
      frotherFlat = flatCounts(flatten(coffeeWithFrother())),
      frotherChart = chartCounts(coffeeWithFrother()),
      playerFlat = flatCounts(flatten(playerChart)),
      // A third feature, as the regions step counts it: the flat machine's states while on, and the chart's states in its regions.
      threeFlat = flatCounts(flatten(player(3))).states - 1,
      threeChart = CONTROLS.slice(0, 3).reduce((n, c) => n + c.states.length, 0);

    const FULL = regionBox('full', { top: 3.05 });
    const big = (b: Box) => fit(b, FULL, scaleFor(b, FULL));

    type Phase = 'machine' | 'copies' | 'parent' | 'multiply' | 'grid' | 'regions' | 'flatten' | 'question' | 'frother';
    // The picture is a function of the model and of which picture is shown. The model, for the two
    // charts a reader could drive, is their configuration (`config`) and the boxes it is in
    // (`current`); which picture is `shown.phase`. So a View checks it against the trace, and
    // rayner check can draw any state a Machine reaches.
    type Model = { current: string[] | null; config?: string[] };
    type Shown = { phase: Phase };
    const [, playing] = PLAYBACK.states,
      [, muted] = VOLUME.states;
    const followCell = cellKey(cellOf([playing, muted]));
    const ACTIVE = activeStates(playerChart, run(playerChart, RUNS.player)[2]!.config);
    let drawn: Drawn = { group: new Group(), words: [] };
    const picture = (st: Model, { phase }: Shown): Drawn => {
      switch (phase) {
        case 'machine':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'plain', { follow: [], lit: [] });
        case 'copies':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'flat', { follow: [], lit: Object.keys(COFFEE.ys).map((id) => `c:arrow:${id}:POWER_OFF:off`) });
        case 'parent':
          return coffeePicture(s, big(coffeeLayout('flat').bounds), 'chart', { follow: st.config ?? [], lit: ['c:arrow:grinding:POWER_OFF:off'] }, true);
        case 'multiply':
          return flatPicture(s, playerChart, big(FLAT.bounds), { follow: [], lit: [] });
        case 'grid':
          return chartPicture(s, playerChart, 'boxed', big(CHART.bounds), { follow: [followCell], lit: [] }, false);
        case 'regions':
          return chartPicture(s, playerChart, 'regions', big(CHART.bounds), { follow: ACTIVE, lit: ['r:arrow:0,0:PLAY:1,0', 'r:arrow:1,0:PAUSE:0,0', 'r:arrow:0,0:MUTE:0,1', 'r:arrow:0,1:UNMUTE:0,0'] });
        case 'flatten':
          return tracePicture(s, big(TRACE));
        case 'question':
          return coffeePicture(s, big(coffeeLayout('question').bounds), 'question', { follow: [], lit: [] });
        case 'frother':
          return coffeePicture(s, big(coffeeLayout('frother').bounds), 'frother', { follow: st.current ?? [], lit: [] });
      }
    };
    this.state = { current: null } satisfies Model;
    this.shown = { phase: 'machine' } satisfies Shown;
    const main = view(this, (st, sh) => (drawn = picture(st as Model, sh as Shown)).group, { place: false });
    const describe = { describe: () => drawn.words.join('; ') };
    const show = (phase: Phase) => { this.shown = { phase } satisfies Shown; };
    /** A new picture: clear the stage and fade the next one in. */
    const fresh = async (next: Phase) => {
      await s.clear({ runTime: 0.35 });
      show(next);
      main.rebuild();
      s.keep(main, describe);
      await this.play(new FadeIn(main, { runTime: 0.6 }));
    };
    const morph = async (next: Phase) => {
      show(next);
      await this.play(main.sync({ match: byKey, runTime: 1.2 }));
    };
    // The two charts a reader could drive, as Machines: each event is the model's send(), and
    // rayner check draws every configuration the events reach. The parent step replays a brew
    // that starts; the frother step the transfer answer's events.
    /** The boxes the picture draws green for a state: the parent step follows the configuration, the frother step every box it is in. */
    const followed = (st: Driven) => ((this.shown as Shown).phase === 'parent' ? st.config : st.current);
    /** The arrow an event takes: the transition written on the state that handled it (its own, or its parent's), keyed as coffeePicture keys it. */
    const arrowFor = (chart: StateNode, from: string, event: string) => {
      const find = (n: StateNode): StateNode | undefined => (n.id === from ? n : (n.children ?? []).map(find).find(Boolean));
      const to = find(chart)!.on![event]!;
      return from === 'on' ? 'c:arrow:grinding:POWER_OFF:off' : to === 'on' ? 'c:arrow:off:POWER_ON:idle' : `c:arrow:${from}:${event}:${to}`;
    };
    // An event the configuration does not handle is discarded (SCXML), so its button would be
    // disabled: the model refuses it, naming the boxes without its arrow. One that is handled travels: the boxes it leaves stop being
    // green, a token runs along the arrow of the state that took it (on's own POWER_OFF when the
    // current state has none), and the boxes it enters turn green.
    const driven = (chart: StateNode) =>
      new Machine<Driven, string>(this, {
        start: drivenStart(chart),
        events: chartEvents(chart),
        next: (state, event) => drivenNext(chart, state, event),
        views: [main],
        match: byKey,
        // 0.35 s to leave, 0.8 s along the arrow, 0.5 s to arrive.
        runTime: 1.65,
        transition: Object.fromEntries(
          chartEvents(chart).map((event) => [
            event,
            (t: Transition<Driven, string>) => {
              const { before, after } = t, c = t.choreograph(main);
              const was = followed(before), now = followed(after);
              const leaving = was.filter((id) => !now.includes(id)), entering = now.filter((id) => !was.includes(id));
              // One token per state that handled the event, travelling its arrow.
              const walks = send(chart, before.config, event).sources.map((from, i) =>
                c.travel(`walk:token:${i}`, new Dot({ radius: 0.11, color: s.emphasis }), c.from(arrowFor(chart, from, event)).children[0] as VMobject, { appear: 0.35, move: 0.8, leave: 0.25 }));
              return new Succession([
                new AnimationGroup([...leaving.map((id) => c.morph(`c:${id}`, { runTime: 0.35 })), ...walks.map((w) => w.appear)]),
                new AnimationGroup(walks.map((w) => w.move)),
                new AnimationGroup([
                  ...walks.map((w) => w.leave),
                  ...entering.map((id) => c.morph(`c:${id}`, { runTime: 0.5 })),
                  c.rest({ runTime: 0.5 }),
                ]),
              ]);
            },
          ]),
        ),
      });
    const brew = driven(coffee());
    const frother = driven(coffeeWithFrother());
    /** Start a chart in its picture, then replay its events through the model. */
    const replay = async (machine: typeof brew, phase: 'parent' | 'frother', events: readonly string[]) => {
      show(phase);
      this.state = machine.spec.start;
      await this.play(main.sync({ match: byKey, runTime: 1.2 }));
      await this.play(machine.replay(events));
    };

    // 1. A concrete machine, and the change that will hurt it.
    await this.step('machine', {
      title: 'A coffee machine, one box at a time',
      line: 'Predict: a power button must switch it off from any state. How many arrows does that add?',
      caption: `This coffee machine is always in exactly one of four boxes: idle, grinding, brewing or ready. Each event moves it along one of ${coffeePlain} arrows: START, GROUND, BREWED and TAKE. The boxes are called states, the arrows transitions, and the whole drawing a state machine. Now give it a power button: the event POWER_OFF switches it off from whichever state it is in, and POWER_ON switches it back on.`,
    });
    main.rebuild();
    s.keep(main, describe);
    await this.play(new FadeIn(main, { runTime: 0.7 }));

    // 2. Shared behaviour is copied.
    await this.step('copies', {
      title: 'A POWER_OFF copied onto every state, and one copy missed',
      line: 'Predict: the marked arrows all do the same thing. How could one arrow do the job?',
      caption: `In this hand-copied machine brewing’s POWER_OFF is missing, so the power button does nothing while the machine brews, until the brew finishes. The copies are needed because in a plain state machine an arrow leaves exactly one state: idle, grinding, brewing and ready each need their own POWER_OFF, and off needs a POWER_ON, ${coffeeFlat.transitions - coffeePlain} more arrows and ${coffeeFlat.transitions} in all. A state added later would need a copy of its own. One event leading from several states to the same place is the first of two signs to look for in a flat machine.`,
    });
    await morph('copies');

    // 3. The box: a parent takes what its children don't. The name arrives here.
    await this.step('parent', {
      title: 'A box around the four states takes the one POWER_OFF',
      line: 'In XState and SCXML, the current state is asked first, then the box around it.',
      caption: `Put the four in a box called on, and give the box the one POWER_OFF: the ${coffeeFlat.transitions} transitions a complete flat machine needs become ${coffeeChart.transitions}. The shared rule is written once on the parent rather than copied onto each child. When POWER_OFF arrives while brewing, brewing is asked first; it has no POWER_OFF arrow, so the box around it, its parent, takes the event. The box is half of the answer: a statechart is a state machine whose states can contain other states, active one at a time or several at once. Inside on, one state is active at a time; the next machine needs several at once.`,
    });
    // The machine starts off; switching it on and starting a brew takes it to brewing, where POWER_OFF arrives.
    await replay(brew, 'parent', RUNS.coffee.slice(0, 3));

    // 4. Independent features multiply.
    await this.step('multiply', {
      title: 'A media player: two on/off features make four flat states',
      line: `Predict: add a third on/off feature, ${SUBTITLES.region}. How many combinations must the flat states name?`,
      caption: `A media player is playing or paused, and muted or unmuted, and playback and volume never affect each other. A plain state machine is in one state at a time, so each state must name both: four combinations, which with off make ${playerFlat.states} states and ${playerFlat.transitions} transitions. Changing playback needs the same transition in both volume settings, and changing volume repeats it for both playback settings. Every name is two words, one per feature, and every arrow between them changes one word and keeps the other. States named by two independent words are the second sign.`,
    });
    await fresh('multiply');
    this.state = { current: null } satisfies Model; // the coffee machine's configuration ends with its pictures

    // 5. Regions: the grid's own words move into two small machines.
    await this.step('regions', {
      title: 'Split the box on into two small machines, called regions',
      line: 'Predict: can a statechart do anything a state machine can’t?',
      caption: `Draw a line through on and give each side one feature: the grid’s words slide apart, and playing · muted becomes playing on one side and muted on the other. Each side is a region, a small machine in one state at a time, and both run at once. A flat state had to name both features at once; a state in a region names only its own, so a further feature adds a region of two states where the flat machine doubles: ${SUBTITLES.region} would make ${threeFlat} combinations, against ${threeChart} states in three regions.`,
    });
    await fresh('grid');
    await morph('regions');
    this.state = { current: ACTIVE } satisfies Model;

    // 6. Same behaviour, smaller drawing.
    await this.step('flatten', {
      title: 'No: flattened, a statechart is an ordinary state machine',
      line: 'Flatten the player and send the same events through both machines.',
      caption:
        'Each row sends the next event to the statechart and to its flat version, and both end in the same states. At run time the player is still in one combination of playback and volume. Only the drawing changes: the statechart describes each feature separately, while the flat machine repeats it for the combinations. The possible combinations still exist; writing their shared behaviour once is what saves space.',
    });
    await fresh('flatten');
    this.state = { current: null } satisfies Model;

    // 7. Transfer: the reader places a new feature.
    await this.step('question', {
      title: 'Your turn: add a milk frother',
      line: 'Predict: where does the frother go, and how big is the flat machine?',
      caption:
        'The frother can be still or frothing at any time while the machine is on, whatever the brewing cycle is doing. Is it a new parent, a new region, or more states in the cycle? And how many states would a flat machine need?',
    });
    await fresh('question');

    // 8. The transfer answer: a second region.
    await this.step('frother', {
      title: 'The frother is a second region, beside the brewing cycle',
      line: `A flat machine would need ${frotherFlat.states} states and ${frotherFlat.transitions} transitions; the statechart draws ${frotherChart.transitions} arrows.`,
      caption: `In a flat machine every state while on would pair one of the four brewing states with still or frothing, like grinding · frothing, all ${frotherFlat.states - 1} pairs reachable, and every arrow between them would change one word and keep the other: the second sign. So the frother goes in a second region inside on, and on’s one POWER_OFF covers both regions. The highlighted boxes are where the machine is after POWER_ON, START and FROTH: grinding in one region and frothing in the other, both at once.`,
    });
    // The machine starts off; the transfer answer's events take it to grinding and frothing.
    await replay(frother, 'frother', RUNS.frother.slice(0, 3));
  }
}
