import { Scene, Group, Text, Rectangle, Arrow, CurvedArrow, Line, Circle, FadeIn, view } from 'rayner';
import type { Mobject, MatchKey, Vec, Box } from 'rayner';
import { stage, regionBox } from 'rayner/explain';
import type { Stage } from 'rayner/explain';
import { CONTROLS, RUNS, player, coffee, boxed, flatten, run, activeStates, chartCounts, flatCounts } from '../lib/statecharts.ts';
import type { StateNode, FlatMachine } from '../lib/statecharts.ts';

// Every box and arrow below is drawn from a model state or transition; only positions are chosen
// here. Parts are keyed by where they sit in the grid of playback × volume, so a state keeps its
// identity as the pictures change: paused becomes paused · unmuted, a box's words become the
// states of the regions, and duplicates fade.

const [PLAYBACK, VOLUME] = CONTROLS as [(typeof CONTROLS)[0], (typeof CONTROLS)[1]];
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
const FLAT = { bounds: [-6.35, -4.0, 5.3, 3.0] as Box, off: [-5.15, 0] as Vec, cols: [-0.95, 3.65], rows: [1.25, -1.25] };
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

function keyed<T extends Mobject>(m: T, key: string): T {
  m.key = key;
  return m;
}
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

/** Morphs pair parts by key: glyphs by their text and place in it, shapes by their place in the keyed part. */
const byKey: MatchKey = (p) => {
  let m: Mobject = p;
  const path: number[] = [];
  while (!m.key) {
    const parent = m.parent;
    if (!parent) return undefined;
    path.unshift(parent.children.indexOf(m));
    m = parent;
  }
  return m instanceof Text ? `${m.key}|${m.text}|${path.join('.')}` : `${m.key}|${path.join('.')}`;
};


// The coffee machine: a column of on states with off to its right, flat or inside the box on.
const COFFEE = {
  bounds: [-6.4, -3.75, 4.9, 3.45] as Box,
  x: -2.4,
  ys: { idle: 2.05, grinding: 0.65, brewing: -0.75, ready: -2.15 } as Record<string, number>,
  size: [2.4, 0.8] as Vec,
  off: [3.0, -0.05] as Vec,
  offSize: [1.3, 5.0] as Vec,
  on: [-5.45, -2.9, -0.7, 3.2] as Box,
};
/** The coffee machine, flat (each on state has its own POWER_OFF) or as the statechart (one POWER_OFF on on). */
function coffeePicture(s: Stage, f: Fit, asChart: boolean, look: Look): Drawn {
  const chart = coffee(),
    parts: Mobject[] = [],
    words: string[] = [];
  const places = new Map<string, Place>([['off', { center: COFFEE.off, size: COFFEE.offSize }]]);
  for (const [id, y] of Object.entries(COFFEE.ys)) places.set(id, { center: [COFFEE.x, y], size: COFFEE.size });
  const onBox: Place = { center: [(COFFEE.on[0] + COFFEE.on[2]) / 2, (COFFEE.on[1] + COFFEE.on[3]) / 2], size: [COFFEE.on[2] - COFFEE.on[0], COFFEE.on[3] - COFFEE.on[1]] };
  if (asChart) {
    const followed = look.follow.includes('on');
    parts.push(
      keyed(
        new Rectangle({ width: onBox.size[0] * f.k, height: onBox.size[1] * f.k, cornerRadius: 0.2 * f.k, fill: 'none', stroke: followed ? s.good : s.soft, strokeWidth: (followed ? 0.06 : 0.03) * f.k }).moveTo(f.at(onBox.center)),
        'c:on',
      ),
      keyed(new Text('on', { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([COFFEE.on[0] + 0.42, COFFEE.on[3] - 0.32])), 'c:on|w'),
    );
    words.push(`on, a box holding ${Object.keys(COFFEE.ys).join(', ')}${followed ? ' (current)' : ''}`);
  }
  for (const [id, p] of places) {
    parts.push(...stateBox(s, f, `c:${id}`, p.center, p.size, [{ key: `c:${id}|w`, text: id }], look.follow.includes(id)));
    words.push(id + (look.follow.includes(id) ? ' (current)' : ''));
  }
  parts.push(...start(s, f, 'c:start:machine', places.get('off')!, 'above'));
  words.push('start → off');
  if (asChart) {
    parts.push(...start(s, f, 'c:start:on', places.get('idle')!, 'above'));
    words.push('start of on → idle');
  }
  // The arrows: every transition of the flat machine, or every transition the chart writes, from the model.
  const arrows = asChart
    ? (() => {
        const out: { from: string; event: string; to: string }[] = [];
        const collect = (n: StateNode) => {
          for (const [event, to] of Object.entries(n.on ?? {})) out.push({ from: n.id, event, to });
          for (const c of n.children ?? []) collect(c);
        };
        collect(chart);
        return out;
      })()
    : flatten(chart).transitions;
  // A box arrow keeps the key of a state arrow it replaces, so the other copies fade.
  const lineage = (t: { from: string; event: string; to: string }) =>
    t.from === 'on' ? 'c:arrow:grinding:POWER_OFF:off' : t.to === 'on' ? 'c:arrow:off:POWER_ON:idle' : `c:arrow:${t.from}:${t.event}:${t.to}`;
  for (const t of arrows) {
    const key = lineage(t),
      lit = look.lit.includes(key);
    const at = (id: string) => (id === 'on' ? onBox : places.get(id));
    const a = at(t.from),
      b = at(t.to);
    if (!a || !b) throw new Error(`No place for ${t.from} → ${t.to}`);
    if (t.event === 'TAKE') {
      // Round the left of the column, from ready back to idle.
      const half = COFFEE.size[0] / 2 + 0.07;
      parts.push(...curved(s, f, key, [a.center[0] - half, a.center[1]], [b.center[0] - half, b.center[1]], -1.3, t.event, lit));
    } else if (t.from === 'off' || t.to === 'off') {
      // To and from the tall off box: straight across, at the row of the state (or the middle of on).
      const other = t.from === 'off' ? b : a,
        paired = arrows.some((u) => u.from === t.to && u.to === t.from),
        y = (other === onBox ? 0 : other.center[1]) + (paired ? (t.to === 'off' ? 0.13 : -0.13) : 0);
      const left = other.center[0] + other.size[0] / 2 + 0.07,
        right = COFFEE.off[0] - COFFEE.offSize[0] / 2 - 0.07;
      const [x1, x2] = t.to === 'off' ? [left, right] : [right, left];
      parts.push(keyed(new Arrow(f.at([x1, y]), f.at([x2, y]), arrowStyle(s, f, lit)), key));
      const below = paired && t.from === 'off';
      parts.push(keyed(new Text(t.event, { fontSize: L * f.k, color: lit ? s.emphasis : s.soft }).moveTo(f.at([(left + right) / 2, y + (below ? -0.27 : 0.27)])), `${key}|label`));
    } else {
      parts.push(...straight(s, f, key, a, b, t.event, false, lit, -1));
    }
    words.push(`${t.from} → ${t.to}: ${t.event}${lit ? ' (marked)' : ''}`);
  }
  const n = asChart ? chartCounts(chart) : flatCounts(flatten(chart));
  parts.push(note(s, f, COFFEE.bounds, `${asChart ? 'Statechart' : 'Flat'}: ${counted(n)}`));
  return { group: new Group(...parts), words };
}

/** Two booleans for playback, every combination, the one that should be impossible marked; struck once regions rule it out. */
function booleanPicture(s: Stage, f: Fit, ruledOut: boolean): Drawn {
  const rows: [string, string, string, boolean][] = [
    ['false', 'false', 'neither?', false],
    ['true', 'false', 'playing', false],
    ['false', 'true', 'paused', false],
    ['true', 'true', 'both: impossible', true],
  ];
  const xs = [-3.2, -0.9, 2.2],
    top = 1.9,
    gap = 0.95;
  const parts: Mobject[] = [
    keyed(new Text('Two booleans for playback', { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([-0.6, top + 1.1])), 'b:title'),
    ...['isPlaying', 'isPaused', 'means'].map((h, i) => keyed(new Text(h, { fontSize: L * f.k, color: s.soft, font: i < 2 ? 'mono' : 'sans' }).moveTo(f.at([xs[i]!, top])), `b:head:${i}`)),
  ];
  rows.forEach(([a, b, m, bad], r) => {
    const y = top - (r + 1) * gap,
      color = bad ? s.bad : s.palette.ink;
    parts.push(
      keyed(new Text(a, { fontSize: L * f.k, color, font: 'mono' }).moveTo(f.at([xs[0]!, y])), `b:${r}:0`),
      keyed(new Text(b, { fontSize: L * f.k, color, font: 'mono' }).moveTo(f.at([xs[1]!, y])), `b:${r}:1`),
      keyed(new Text(m, { fontSize: L * f.k, color }).moveTo(f.at([xs[2]!, y])), `b:${r}:2`),
    );
  });
  const words = ['Two booleans for playback, isPlaying and isPaused', ...rows.map(([a, b, m]) => `${a}, ${b}: ${m}`)];
  if (ruledOut) {
    const y = top - 4 * gap;
    parts.push(keyed(new Text('with regions: cannot be written', { fontSize: L * f.k, color: s.bad }).moveTo(f.at([-0.6, y - 0.75])), 'b:why'));
    words.push('with regions, the impossible row cannot be written: a region is in one state');
  }
  return { group: new Group(...parts), words };
}
const BOOLEANS: Box = [-4.3, -2.75, 3.9, 3.35];

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
    watch: { current: 'Current states', takenBy: 'Event taken by' },
  };

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.54 });
    const playerChart = player(2),
      flatPlayer = flatCounts(flatten(playerChart)),
      chartPlayer = chartCounts(playerChart);
    const coffeeFlat = flatCounts(flatten(coffee())),
      coffeeChart = chartCounts(coffee());

    const FULL = regionBox('full', { top: 3.05 }),
      LEFT = regionBox('left', { top: 3.05, right: -0.45 }),
      RIGHT = regionBox('right', { top: 3.05, left: 0.45 });
    const half = Math.min(scaleFor(FLAT.bounds, LEFT), scaleFor(CHART.bounds, LEFT));
    const DEFINE = regionBox('full', { top: 2.6, bottom: -3.2 });

    // Two pictures, each a function of the step: `main` on the left (or the whole stage), `aside` on the right.
    type Phase = 'what' | 'copies' | 'parent' | 'multiply' | 'regions' | 'flatten';
    let phase: Phase = 'what';
    const followCell = cellKey(cellOf([PLAYBACK.states[1], VOLUME.states[1]]));
    const ACTIVE = ['on', PLAYBACK.states[1], VOLUME.states[1]];
    const coffeeRun = run(coffee(), RUNS.coffee);
    const brewing = coffeeRun[2]!.config;
    let mainDrawn: Drawn = { group: new Group(), words: [] },
      asideDrawn: Drawn = { group: new Group(), words: [] };
    const mainPicture = (): Drawn => {
      switch (phase) {
        case 'what': {
          const d = chartPicture(s, playerChart, 'regions', fit(CHART.bounds, DEFINE, scaleFor(CHART.bounds, DEFINE, 0.75)), { follow: [], lit: [] }, false);
          return d;
        }
        case 'copies':
          return coffeePicture(s, fit(COFFEE.bounds, FULL, scaleFor(COFFEE.bounds, FULL, 0.95)), false, { follow: [], lit: ['grinding', 'idle', 'brewing', 'ready'].map((id) => `c:arrow:${id}:POWER_OFF:off`) });
        case 'parent':
          return coffeePicture(s, fit(COFFEE.bounds, FULL, scaleFor(COFFEE.bounds, FULL, 0.95)), true, { follow: brewing, lit: ['c:arrow:grinding:POWER_OFF:off'] });
        case 'multiply':
          return chartPicture(s, playerChart, 'boxed', fit(CHART.bounds, LEFT, half), { follow: [followCell], lit: [] });
        case 'regions':
        case 'flatten':
          return chartPicture(s, playerChart, 'regions', fit(CHART.bounds, LEFT, half), { follow: ACTIVE, lit: phase === 'regions' ? ['r:arrow:0,0:PLAY:1,0', 'r:arrow:1,0:PAUSE:0,0', 'r:arrow:0,0:MUTE:0,1', 'r:arrow:0,1:UNMUTE:0,0'] : [] });
      }
    };
    const asidePicture = (): Drawn => {
      if (phase === 'flatten') return flatPicture(s, playerChart, fit(FLAT.bounds, RIGHT, half), { follow: [followCell], lit: [] });
      return booleanPicture(s, fit(BOOLEANS, RIGHT, scaleFor(BOOLEANS, RIGHT, 0.85)), phase === 'regions');
    };
    const main = view(() => (mainDrawn = mainPicture()).group, { place: false });
    const aside = view(() => (asideDrawn = asidePicture()).group, { place: false });
    const sync = (v: typeof main) => v.sync({ match: byKey, runTime: 1.2 });
    s.keep(main, { describe: () => mainDrawn.words.join('; ') });

    // 1. What it is: the definition, with the parts named on one small chart.
    await this.step('what', {
      title: 'A statechart is a state machine with states inside states',
      line: 'on is a parent state; the dashed line splits it into two regions.',
      caption:
        'A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don’t handle goes to the parent. And a state can be split into regions, each in one state at the same time.',
    });
    main.rebuild();
    const defineFit = fit(CHART.bounds, DEFINE, scaleFor(CHART.bounds, DEFINE, 0.75));
    const callout = (text: string, at: Vec, key: string) => keyed(new Text(text, { fontSize: L * defineFit.k * 1.25, color: s.emphasis }).moveTo(defineFit.at(at)), key);
    const parentNote = callout('a parent state: on holds the others', [2.4, CHART.on[3] + 0.45], 'n:parent');
    const regionNote = callout('two regions, each in one state at once', [0, CHART.on[1] - 0.45], 'n:regions');
    await this.play(new FadeIn(main, { runTime: 0.7 }));
    await s.enter(parentNote, regionNote, { describe: 'Labels: on is a parent state holding the others; the dashed line splits it into two regions, each in one state at once' });

    // 2. Why: shared behaviour is copied onto every state.
    await this.step('copies', {
      title: 'Shared behaviour is copied onto every state',
      line: 'Predict: what could replace these four POWER_OFF arrows?',
      caption: `In a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow, marked: ${coffeeFlat.states} states and ${coffeeFlat.transitions} transitions.`,
    });
    await s.clear({ runTime: 0.35 });
    phase = 'copies';
    main.rebuild();
    s.keep(main, { describe: () => mainDrawn.words.join('; ') });
    await this.play(new FadeIn(main, { runTime: 0.7 }));

    // 3. A parent takes what its children don't handle.
    const takenBy = coffeeRun.at(-1)!.sources;
    await this.step('parent', {
      title: 'One POWER_OFF on the box does the job',
      line: `brewing has no POWER_OFF, so its parent ${takenBy.join(', ')} answers.`,
      caption: `Put the four in a box called on, and one POWER_OFF on the box does the job. The current state is asked first, then its parent: brewing has no POWER_OFF, so on takes it and the machine switches off. ${coffeeFlat.transitions} transitions become ${coffeeChart.transitions}.`,
    });
    phase = 'parent';
    await this.play(sync(main));
    this.state = { current: activeStates(coffee(), brewing), takenBy };

    // 4. Independent features multiply, and booleans hide the same problem.
    await this.step('multiply', {
      title: 'Independent features multiply',
      line: 'Predict: how many combinations with a third on/off button?',
      caption:
        'A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that. Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible.',
    });
    await s.clear({ runTime: 0.35 });
    phase = 'multiply';
    main.rebuild();
    aside.rebuild();
    s.keep(main, { describe: () => `Player: ${mainDrawn.words.join('; ')}` });
    s.keep(aside, { describe: () => asideDrawn.words.join('; ') });
    await this.play(new FadeIn(main, { runTime: 0.7 }), new FadeIn(aside, { runTime: 0.7 }));
    this.state = { current: ['on', 'playing · muted'], takenBy: null };

    // 5. Regions keep the independent parts apart.
    await this.step('regions', {
      title: 'Regions keep playback and volume apart',
      line: 'Predict: can a statechart do anything a state machine can’t?',
      caption:
        'Regions keep playback and volume apart, as two small machines side by side, so the impossible combination can’t be written: playback is paused or playing, never both. The marked playing · muted is now playing in one region and muted in the other. A third on/off button would make 8 combinations, but only one more region.',
    });
    phase = 'regions';
    await this.play(sync(main), sync(aside));
    this.state = { current: activeStates(playerChart, run(playerChart, RUNS.player)[2]!.config), takenBy: null };

    // 6. Same behaviour, smaller drawing.
    await this.step('flatten', {
      title: 'Flatten it and the same machine comes back',
      line: `${flatPlayer.transitions} transitions flat, ${chartPlayer.transitions} in the statechart; the marked states match.`,
      caption: `Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour, and XState reaches the same state after every event in both. What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows.`,
    });
    phase = 'flatten';
    await this.play(sync(main), sync(aside));
  }
}
