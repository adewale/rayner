import { Scene, Group, Text, Rectangle, Arrow, CurvedArrow, Line, FadeIn, view } from 'rayner';
import type { Mobject, MatchKey, Vec, Box } from 'rayner';
import { stage, settingsOf, regionBox } from 'rayner/explain';
import type { Stage } from 'rayner/explain';
import { CONTROLS, FOLLOW, player, muteWhilePlaying, boxed, flatten, run, activeStates, chartCounts, flatCounts } from '../lib/statecharts.ts';
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
/** A combination the machine never reaches: its words greyed in a dashed box, labelled above. */
function emptyBox(s: Stage, f: Fit, prefix: string, cell: Cell, center: Vec) {
  const k = cellKey(cell),
    words = [PLAYBACK.states[cell[0]]!, VOLUME.states[cell[1]]!];
  const label = keyed(new Text('never reached', { fontSize: L * f.k, color: s.soft }).moveTo(f.at([center[0], center[1] + CELL[1] / 2 + 0.25])), `${prefix}never:${k}`);
  return [...stateBox(s, f, `${prefix}cell:${k}`, center, CELL, words.map((t, i) => ({ key: `${prefix}ghost:${k}:${i}`, text: t })), false, true), label];
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
  text.moveTo(f.at([apex[0] + n[0] * 0.26, apex[1] + n[1] * 0.26]));
  return [arrow, text];
}
const note = (s: Stage, f: Fit, bounds: Box, text: string) =>
  keyed(new Text(text, { fontSize: L * f.k, color: s.soft }).moveTo(f.at([(bounds[0] + bounds[2]) / 2, bounds[1] + 0.22])), 'note');
const counted = (n: { states: number; transitions: number }) => `${n.states} states · ${n.transitions} transitions`;
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
  words.push(`off${look.follow.includes('off') ? ' (followed)' : ''}`);
  for (const [name, cell] of cells) {
    const k = cellKey(cell),
      w = wordsOf(chart, flat.configurations[name]!);
    parts.push(...stateBox(s, f, `cell:${k}`, place(cell).center, CELL, w.map((t, i) => ({ key: `word:${k}:${i}`, text: t })), look.follow.includes(k)));
    words.push(w.join(' · ') + (look.follow.includes(k) ? ' (followed)' : ''));
  }
  if (twoCols)
    for (const r of [0, 1])
      for (const c of [0, 1])
        if (![...cells.values()].some((x) => x[0] === r && x[1] === c)) {
          const k = cellKey([r, c]);
          parts.push(...emptyBox(s, f, '', [r, c], place([r, c]).center));
          words.push(`${PLAYBACK.states[r]} · ${VOLUME.states[c]}, never reached`);
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

type ChartKind = 'boxed' | 'regions' | 'nested';
/**
 * The statechart. `boxed`: the flat grid inside on, which carries POWER once. `regions`: playback and
 * volume side by side in on. `nested`: volume inside playing. A state takes the key of the grid part
 * it comes from, so changing kind moves those parts instead of redrawing them.
 */
function chartPicture(s: Stage, source: StateNode, kind: ChartKind, f: Fit, look: Look): Drawn {
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
    if ([...boxKey.values()].some((k) => k.endsWith(',1')))
      for (const r of [0, 1])
        for (const c of [0, 1]) {
          const k = cellKey([r, c]);
          if (![...boxKey.values()].includes(`r:cell:${k}`))
            parts.push(...emptyBox(s, f, 'r:', [r, c], [CHART.cols[c]!, CHART.rows[r]!]));
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
  } else {
    // Volume inside playing: paused on the left, the playing box on the right holding unmuted and muted.
    const inner: Box = [-1.0, -2.7, 4.9, 1.35];
    const [paused, playing] = PLAYBACK.states;
    places.set(paused, { center: [-3.3, CHART.rows[0]!], size: STATE });
    boxKey.set(paused, 'r:cell:0,0');
    wordKeys.set(paused, [{ key: 'r:word:0,0:0', text: paused }]);
    places.set(playing, { center: [(inner[0] + inner[2]) / 2, (inner[1] + inner[3]) / 2], size: [inner[2] - inner[0], inner[3] - inner[1]] });
    VOLUME.states.forEach((id, i) => {
      places.set(id, { center: [2.6, i ? -1.85 : 0.3], size: STATE });
      boxKey.set(id, `r:cell:1,${i}`);
      wordKeys.set(id, [{ key: `r:word:1,${i}:1`, text: id }]);
    });
    const followed = look.follow.includes(playing);
    parts.push(box('r:playing', inner, followed, 0.16), keyed(new Text(playing, { fontSize: F * f.k, color: s.palette.ink }).moveTo(f.at([inner[0] + 0.8, inner[3] - 0.3])), 'r:word:1,1:0'));
    words.push(`${playing}${followed ? ' (followed)' : ''}, holding ${VOLUME.states.join(' and ')}`);
  }
  for (const [id, key] of boxKey) {
    const p = places.get(id)!,
      followed = look.follow.includes(id) || look.follow.includes(key.slice('r:cell:'.length));
    parts.push(...stateBox(s, f, key, p.center, p.size, wordKeys.get(id)!, followed));
    words.push(wordKeys.get(id)!.map((w) => w.text).join(' · ') + (followed ? ' (followed)' : ''));
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
  const lineage: Record<string, string> =
    kind === 'nested'
      ? { PLAY: '0,0:PLAY:1,0', PAUSE: '1,0:PAUSE:0,0', MUTE: '1,0:MUTE:1,1', UNMUTE: '1,1:UNMUTE:1,0' }
      : { PLAY: '0,0:PLAY:1,0', PAUSE: '1,0:PAUSE:0,0', MUTE: '0,0:MUTE:0,1', UNMUTE: '0,1:UNMUTE:0,0' };
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
  parts.push(note(s, f, CHART.bounds, `Statechart: ${counted(chartCounts(chart))}`));
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

export default class Statecharts extends Scene {
  static meta = {
    id: 'statecharts',
    title: 'What does a statechart add to a state machine?',
    sources: [
      'https://x.com/DavidKPiano/status/2116523008323981315',
      'https://www.state-machine.com/doc/Harel87.pdf',
      'https://www.w3.org/TR/2015/REC-scxml-20150901/',
      'https://www.npmjs.com/package/xstate/v/5.33.3',
    ],
    watch: { flat: 'Flat state', active: 'Statechart states' },
  };
  static settings = [
    {
      id: 'mute',
      label: 'Mute works',
      default: 'always',
      options: [
        { value: 'always', label: 'Paused or playing' },
        { value: 'playing', label: 'Only while playing' },
      ],
    },
  ];

  override async construct() {
    const always = settingsOf(this).mute !== 'playing';
    const s = stage(this, { style: 'github-light', headingSize: 0.54 });
    const chart = always ? player(2) : muteWhilePlaying(),
      one = player(1),
      flat = flatten(chart),
      before = flatCounts(flatten(one)),
      after = flatCounts(flat),
      final = chartCounts(chart);
    const powerOff = flat.transitions.filter((t) => t.event === 'POWER' && t.to === flat.initial).length;

    const FULL = regionBox('full', { top: 3.05 }),
      LEFT = regionBox('left', { top: 3.05, right: -0.1 }),
      RIGHT = regionBox('right', { top: 3.05, left: 0.1 });
    const half = Math.min(scaleFor(FLAT.bounds, LEFT), scaleFor(CHART.bounds, RIGHT));
    const fullFit = fit(FLAT.bounds, FULL, scaleFor(FLAT.bounds, FULL, 0.95)),
      leftFit = fit(FLAT.bounds, LEFT, half),
      rightFit = fit(CHART.bounds, RIGHT, half);

    // The two pictures, each a function of the chart it draws, where, and how it is marked.
    let flatChart = one,
      flatFit = fullFit,
      flatLook: Look = { follow: [], lit: [] };
    let flatDrawn = flatPicture(s, flatChart, flatFit, flatLook);
    const left = view(() => (flatDrawn = flatPicture(s, flatChart, flatFit, flatLook)).group, { place: false });
    let kind: ChartKind = 'boxed',
      chartLook: Look = { follow: [], lit: [] };
    let chartDrawn = chartPicture(s, chart, kind, rightFit, chartLook);
    const right = view(() => (chartDrawn = chartPicture(s, chart, kind, rightFit, chartLook)).group, { place: false });
    const sync = (v: typeof left | typeof right) => v.sync({ match: byKey, runTime: 1.2 });
    const said = (d: () => Drawn, what: string) => () => `${what}: ${d().words.join('; ')}`;

    // 1. The small machine before the button.
    await this.step('player', {
      title: 'Three states. What will a mute button add?',
      line: always ? 'Mute will work while paused or while playing.' : 'Mute will work only while playing.',
      caption: `The player is off, paused or playing. PLAY and PAUSE move between paused and playing, and each of those already needs its own POWER arrow back to off: ${before.states} states and ${before.transitions} transitions.`,
    });
    s.keep(left, { describe: said(() => flatDrawn, 'Flat state machine') });
    await this.play(new FadeIn(left, { runTime: 0.6 }));
    this.state = { flat: null, active: null };

    // 2. The button splits states and copies their arrows: the copies are the arrows of an old kind on a new place.
    const oldKeys = new Set(flatPicture(s, one, fullFit, flatLook).group.children.map((m) => m.key));
    const oldEvents = new Set(flatten(one).transitions.map((t) => t.event));
    const copies = flatPicture(s, chart, fullFit, flatLook)
      .group.children.map((m) => m.key ?? '')
      .filter((k) => k.startsWith('arrow:') && !oldKeys.has(k) && oldEvents.has(k.split(':')[2]!));
    await this.step('mute', {
      title: always ? 'Mute splits both states and copies their arrows' : 'Mute splits only playing',
      line: always ? `${after.states} states now; every arrow out of paused or playing has a marked copy.` : 'paused · muted never happens, so that box stays empty.',
      caption: always
        ? `A flat machine needs one state per combination, so paused and playing each split into an unmuted and a muted copy. The copies keep every arrow, marked: PLAY and PAUSE appear in both columns and ${powerOff} POWER arrows return to off. ${after.states} states and ${after.transitions} transitions, up from ${before.states} and ${before.transitions}.`
        : `Because mute works only while playing, only playing splits, into unmuted and muted copies. paused · muted is a combination this player never reaches. The copies keep their arrows, marked: PAUSE now leaves both playing states and POWER all ${powerOff}. ${after.states} states and ${after.transitions} transitions, up from ${before.states} and ${before.transitions}.`,
    });
    flatChart = chart;
    flatLook = { follow: [], lit: copies };
    await this.play(sync(left));

    // 3. A box around the combinations carries POWER once.
    const followCell = cellKey(cellOf([PLAYBACK.states[1], VOLUME.states[1]]));
    const powerKeys = flatDrawn.group.children.map((m) => m.key ?? '').filter((k) => k.startsWith('arrow:') && k.endsWith(':POWER:off'));
    await this.step('box', {
      title: 'A box around them needs POWER only once',
      line: `on handles POWER for every state inside: 1 arrow, not ${powerOff}.`,
      caption: `On the right, a box called on holds the ${always ? 'four' : 'three'} states. An event no state inside handles goes to the box, so one POWER arrow from on replaces the ${powerOff} marked on the left. on is a state too: the player is in on and in one state inside it. Both drawings mark playing · muted, the state to follow.`,
    });
    flatFit = leftFit;
    flatLook = { follow: [followCell], lit: powerKeys };
    chartLook = { follow: [followCell], lit: ['r:power:off'] };
    s.keep(right, { describe: said(() => chartDrawn, 'Statechart') });
    right.rebuild();
    await this.play(sync(left), new FadeIn(right, { runTime: 1.2 }));
    this.state = { flat: 'playing · muted', active: ['on', 'playing · muted'] };

    // 4. The pivotal change: the grid's words become regions, or volume goes inside playing.
    const followed = run(chart, FOLLOW).at(-2)!.config;
    const activeNow = activeStates(chart, followed);
    await this.step(
      'split',
      always
        ? {
            title: 'Each combination is one state from each region',
            line: 'playing · muted becomes playing beside muted.',
            caption:
              'The grid’s rows and columns are two separate choices, so keep only the choices: playback is paused or playing, and volume is unmuted or muted, side by side in on, split by the dashed line. The marked playing · muted becomes playing in one region and muted in the other, and each button’s arrows are drawn once.',
          }
        : {
            title: 'Volume goes inside playing, not beside it',
            line: 'Regions side by side would allow paused with muted.',
            caption:
              'Separate regions would let paused and muted be active together, the combination this player never reaches. Instead unmuted and muted go inside playing, the only place mute works, and one PAUSE arrow from the playing box replaces two. The marked playing · muted is muted inside playing.',
          },
    );
    kind = always ? 'regions' : 'nested';
    chartLook = {
      follow: activeNow,
      lit: always ? ['r:arrow:0,0:PLAY:1,0', 'r:arrow:1,0:PAUSE:0,0', 'r:arrow:0,0:MUTE:0,1', 'r:arrow:0,1:UNMUTE:0,0'] : ['r:arrow:1,0:PAUSE:0,0'],
    };
    flatLook = { follow: [followCell], lit: [] };
    await this.play(sync(right), sync(left));
    this.state = { flat: 'playing · muted', active: activeNow };

    // 5. Same behaviour: POWER from the followed state reaches off in both drawings.
    const last = run(chart, FOLLOW).at(-1)!;
    await this.step('power', {
      title: `Same behaviour, ${final.transitions} transitions instead of ${after.transitions}`,
      line: `POWER leaves playing · muted by its own arrow, or by ${last.sources.join(', ')}’s.`,
      caption: always
        ? `From playing and muted, POWER reaches off by that state’s own arrow on the left and by on’s one arrow on the right, leaving both regions. XState reaches the same state after every event in both. The statechart pays one extra state, on, for ${after.transitions - final.transitions} fewer transitions, because mute and play never constrain each other.`
        : `From playing and muted, POWER reaches off by that state’s own arrow on the left and by on’s one arrow on the right. XState reaches the same state after every event in both. The statechart pays ${final.states - after.states} extra states, on and playing, for ${after.transitions - final.transitions} fewer transitions. Because mute depends on playing, nesting, not regions, removed the copies.`,
    });
    flatLook = { follow: ['off'], lit: [`arrow:${followCell}:POWER:off`] };
    chartLook = { follow: ['off'], lit: ['r:power:off'] };
    await this.play(sync(left), sync(right));
    this.state = { flat: 'off', active: last.config };
  }
}
