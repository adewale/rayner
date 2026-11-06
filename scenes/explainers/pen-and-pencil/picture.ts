import { Group, VMobject, Circle, Line, Text } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { hand, HAND, FREEHAND, freehand, rng, deviation, boxPolygon, boundsOf, hatch, unowned, tag, hershey, fit, pencilWidth, TITLE } from './model.ts';
import type { Pt, Box, Layer } from './model.ts';
import { label } from '../../../explain/drawing.ts';
import type { StagedStep, Diagram } from '../../../explain/index.ts';
import { stagedStep } from '../../../explain/index.ts';

// Only these two seeds are pictured. The layout's construction is shared between them; the
// decorative marks (sea strokes, gulls) depend on the seed. The magnifier compares each drawing's
// actual ink with the construction band, so it must not suggest the ink is identical across seeds.
/** The two drawings the plate compares: the first in grey, the second in ink. */
export const SEEDS = { first: 1967, second: 7 } as const;
export const GREY = '#6f6a66';
const BAND = '#69a9cf';
const DASHED = '#c0584a';
/** The stage is 16 units wide, so a page 1280 px wide draws a unit 80 px long. */
export const PX_PER_UNIT = 1280 / 16;
export const px = (units: number) => `${(units * PX_PER_UNIT).toFixed(1)} px`;

/** Four period boxes in a row, as a layout would place them; their names sit at the centres. */
const NAMES = ['Dusk', 'Midnight', 'Small hours', 'Dawn'];
const W = 3,
  H = 1.1,
  PITCH = 3.55,
  X0 = -7.1,
  TOP = 1.2;
const laid: Box[] = NAMES.map((_, i) => [X0 + i * PITCH, TOP - H, X0 + i * PITCH + W, TOP]);

/**
 * The four boxes drawn by a hand that places its own strokes: each side starts where the last one
 * ended, and the pen moves on to the next box from where it lifted. Every box is drawn left to right.
 */
function freeBoxes(seed: number): Pt[][] {
  const moves: Pt[] = [];
  NAMES.forEach((_, i) => {
    moves.push([W, 0], [0, -H], [-W, 0], [0, H]);
    if (i < NAMES.length - 1) moves.push([PITCH, 0]);
  });
  const corners = freehand([X0, TOP], moves, FREEHAND, rng(seed + 3));
  // Five corners per box (the fifth closes it, or nearly), then one pen-up move.
  return NAMES.map((_, i) => corners.slice(i * 5, i * 5 + 5));
}
const offset = (a: readonly Pt[], b: readonly Pt[]) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1])));
/** Each box as drawn by a hand that places its own strokes, from that drawing's seed. */
const freeInk = (seed: number) => freeBoxes(seed).map((b) => hand(b, HAND, rng(seed)));
/** The inset: a window LENS units either side of a point, magnified ZOOM times, drawn at INSET. */
const LENS = 0.025,
  ZOOM = 36,
  INSET: Pt = [0.5, -0.2];
/**
 * A route traced by the two drawings, from their seeds, and where they are furthest apart: the
 * second drawing's point furthest from the first, which the inset magnifies.
 */
function traced(target: readonly Pt[], seeds: { first: number; second: number }) {
  const ink = { first: hand(target, HAND, rng(seeds.first)), second: hand(target, HAND, rng(seeds.second)) };
  const far = ink.second.reduce(
    (best, p) => {
      const d = deviation([p], ink.first);
      return d > best.d ? { p, d } : best;
    },
    { p: ink.second[0]!, d: -1 },
  );
  /** The runs of a stroke inside the inset's window, magnified into it. */
  const lensed = (points: readonly Pt[]): Pt[][] => {
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (const q of points) {
      const dx = q[0] - far.p[0],
        dy = q[1] - far.p[1];
      if (Math.hypot(dx, dy) <= LENS) run.push([INSET[0] + dx * ZOOM, INSET[1] + dy * ZOOM]);
      else if (run.length) runs.push(run), (run = []);
    }
    if (run.length) runs.push(run);
    return runs.filter((r) => r.length > 1);
  };
  return { ink, far, lensed };
}
// One path per polyline: a hand's stroke has hundreds of points.
const path = (points: readonly Pt[], color: string, width: number, opacity = 1, dash?: string) => {
  const vm = new VMobject({ stroke: color, strokeWidth: width, strokeOpacity: opacity, fill: 'none', lineCap: 'round', lineJoin: 'round' });
  vm.startNewPath(points[0]! as Vec);
  for (const q of points.slice(1)) vm.addLineTo(q as Vec);
  if (dash) vm.style.dashArray = dash;
  return vm;
};

export function frames(seed: number): StagedStep[] {
  // The failure: both drawings place their own boxes, and the boxes drift apart.
  const free = { first: freeBoxes(SEEDS.first), second: freeBoxes(SEEDS.second) };
  const apart = NAMES.map((_, i) => offset(free.first[i]!, free.second[i]!));
  // The laid-out corners in the order the hand draws them: top left, top right, bottom right, bottom left, top left.
  const closed = (b: Box): Pt[] => [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]], [b[0], b[3]]];
  const fromLayout = NAMES.map((_, i) => Math.max(offset(free.first[i]!, closed(laid[i]!)), offset(free.second[i]!, closed(laid[i]!))));
  // The fix: one route, fixed first, traced by both drawings.
  const target: Pt[] = [
    [-6, 1],
    [-2, 1],
    [-2, -1.5],
    [3, -1.5],
    [3, 1],
    [6, 1],
  ];
  const { ink } = traced(target, SEEDS);
  const stray = Math.max(deviation(ink.first, target), deviation(ink.second, target));
  const between = Math.max(deviation(ink.first, ink.second), deviation(ink.second, ink.first));
  // The picture shows the dark line inside the wide grey one everywhere; refuse to draw it otherwise.
  if (between > 0.06 - 0.0175) throw new Error(`The two drawings are ${between} apart, wider than the grey line shows`);
  const worst = Math.max(...apart);
  return [
    stagedStep({
      id: 'reader-drift',
      title: 'If the hand places the boxes, a second drawing moves them',
      line: 'Grey: the first drawing. Dark: the second. Dashed: where the boxes belong.',
      caption: `Each imperfect move changes where the next one begins, so every error is carried into every later corner. Across four boxes the small deviations accumulate: two seeds place the same box as much as ${worst.toFixed(2)} units apart. Could the pen wobble without deciding the next box’s position?`,
      state: { seeds: { first: SEEDS.first, second: SEEDS.second }, apart: apart.map((d) => Number(d.toFixed(3))), fromLayout: fromLayout.map((d) => Number(d.toFixed(3))) },
      draw: (st, s) =>
        new Group(
          ...laid.map((b) => path([...boxPolygon(b), boxPolygon(b)[0]!], DASHED, 0.03, 0.8, '0.12 0.1')),
          ...freeInk(st.seeds.first).map((l) => path(l, GREY, 0.045, 0.9)),
          ...freeInk(st.seeds.second).map((l) => path(l, s.palette.ink, 0.045)),
          ...NAMES.map((n, i) => label(n, (laid[i]![0] + laid[i]![2]) / 2, (laid[i]![1] + laid[i]![3]) / 2, s.palette.ink, 0.42)),
          label(`Up to ${Math.max(...st.apart).toFixed(2)} units apart: the boxes moved`, 0, -2.3, s.palette.ink, 0.56),
        ),
    }),
    stagedStep({
      id: 'reader-separate',
      title: 'With the route fixed first, two drawings stay on it',
      line: 'Blue band: the route the layout fixed. Grey and dark: two drawings of it.',
      caption: `The route now fixes the corners before drawing. A simulated pen follows it like a mass pulled by a damped spring, and the next stroke starts from its own fixed mark. The magnifier shows different ink near the same route. The fix, in this hand model: lay the chart out first and let the hand only trace it, so a new drawing changes each stroke’s wobble and leaves every box where the layout put it.`,
      state: { seed, seeds: { first: SEEDS.first, second: SEEDS.second }, stray, between, target, ink: seed === SEEDS.first ? ink.first : ink.second },
      draw: (st, s) => {
        const { ink, far, lensed } = traced(st.target, st.seeds);
        const lens = new Circle({ radius: LENS * ZOOM, stroke: s.soft, strokeWidth: 0.025, fill: s.palette.paper, fillOpacity: 1 }).moveTo(INSET as Vec);
        const spot = new Circle({ radius: 0.09, stroke: s.soft, strokeWidth: 0.025 }).moveTo(far.p as Vec);
        const lead = new Line(far.p as Vec, [INSET[0], INSET[1] - LENS * ZOOM] as Vec, { stroke: s.soft, strokeWidth: 0.02 });
        lead.style.dashArray = '0.06 0.05';
        return new Group(
          path(st.target, BAND, 0.32, 0.45),
          path(ink.first, GREY, 0.12, 0.55),
          path(ink.second, s.palette.ink, 0.035),
          spot,
          lead,
          lens,
          ...lensed(ink.first).map((r) => path(r, GREY, 0.07, 0.8)),
          ...lensed(ink.second).map((r) => path(r, s.palette.ink, 0.035)),
          label('Blue: the route the layout fixed', 0, 2.55, s.palette.ink, 0.62),
          // Above the gap between the route's two upper corners, clear of the band.
          label(`×${ZOOM}: ${far.d.toFixed(3)} apart`, INSET[0], 1.72, s.palette.ink, 0.62),
          label(`Two drawings, within ${st.stray.toFixed(3)} units of it`, 0, -2.9, s.palette.ink, 0.62),
        );
      },
    }),
  ];
}

// The real timeline's marks, read back from the laid-out diagram, and the polylines every plate stroke is drawn as.
export type Pathed = Mobject & { subpaths: Float32Array[] };
export const pathed = (m: Mobject): m is Pathed => Array.isArray((m as Pathed).subpaths) && m.hasPoints();
const hasText = (m: Mobject) => typeof (m as { text?: unknown }).text === 'string';

/** Points along one subpath of a captured path, eight per cubic. */
function samples(m: Pathed, i: number): Pt[] {
  const a = m.subpaths[i]!,
    vm = m as unknown as VMobject,
    curves = (a.length / 2 - 1) / 3;
  const out: Pt[] = [[a[0]!, a[1]!]];
  for (let c = 0; c < curves; c++) for (let k = 1; k <= 8; k++) out.push(vm.pointOnCurve(i, c, k / 8) as Pt);
  return out;
}
const lines = (m: Pathed) => m.subpaths.map((_, i) => samples(m, i));
/** One timeline period read back as marks: its label box, marker, string and event tag. */
export function anatomy(d: Diagram, i: number) {
  const kids = d.get(`period:period-${i}`).children;
  const texts = kids.filter(hasText).sort((a, b) => b.box()![1] - a.box()![1]);
  const paths = kids.filter((m): m is Pathed => !hasText(m) && pathed(m));
  const outlined = paths.filter((m) => m.style.fill === 'none' || !m.style.fillOpacity);
  const boxes = outlined.filter((m) => m.subpaths.length === 4).sort((a, b) => b.box()![1] - a.box()![1]);
  // The string is the narrower single outline, the ring the wider; the dot is the smallest fill.
  const [string, ring] = outlined.filter((m) => m.subpaths.length === 1).sort((a, b) => a.width() - b.width()) as [
    Pathed,
    Pathed,
  ];
  const dot = paths.filter((m) => !outlined.includes(m)).sort((a, b) => a.width() - b.width())[0]!;
  return {
    period: {
      box: boxes[0]!.box()! as Box,
      sides: lines(boxes[0]!),
      label: texts[0]!.box()! as Box,
      text: (texts[0] as unknown as { text: string }).text,
    },
    event: {
      box: boxes[1]!.box()! as Box,
      sides: lines(boxes[1]!),
      label: texts[1]!.box()! as Box,
      text: (texts[1] as unknown as { text: string }).text,
    },
    ring: lines(ring)[0]!,
    string: lines(string)[0]!,
    dot: lines(dot)[0]!,
    marks: paths.length + texts.length,
    outlines: outlined.reduce((n, m) => n + m.subpaths.length, 0),
    filled: paths.length - outlined.length,
    words: texts.length,
  };
}

/** Polylines as one path, a subpath each. */
export function polylines(
  ls: readonly (readonly Pt[])[],
  stroke: string,
  strokeWidth: number,
  opts: { fill?: boolean; opacity?: number } = {},
): VMobject {
  const vm = new VMobject({
    stroke,
    strokeWidth,
    strokeOpacity: opts.opacity ?? 1,
    fill: opts.fill ? stroke : 'none',
    fillOpacity: opts.fill ? 1 : 0,
    lineCap: 'round',
    lineJoin: 'round',
  });
  for (const l of ls) {
    vm.startNewPath(l[0]! as Vec);
    for (const p of l.slice(1)) vm.addLineTo(p as Vec);
    if (opts.fill) vm.closePath();
  }
  return vm;
}

// ---- The plate: the real timeline drawn on its marks, the scenery around it, and the free hand's drawing.
/** The page's warm-black pen, from the study. */
export const INK = '#2b2320';
export const CONSTRUCTION = '#5b8fd0';
/** Light pencil tints; the palette is the same in every scenario. */
const TINTS: Record<string, string> = {
  hills: '#7f9a6c',
  sea: '#6f93b3',
  rock: '#9a7f5c',
  bands: '#c0584a',
  beam: '#d9a632',
  plank: '#c08f45',
  tag: '#7aa6c2',
};
/** Pencils are re-sharpened after this many strokes. */
export const SHARPEN = 60;
/** Owned paper keeps this margin clear around it. */
export const MARGIN = 0.12;
/** The pen's width in the close-up on Midnight's ring. */
const INK_WIDTH = 0.006;

export const grow = (b: Box, by: number): Box => [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
export const union = (boxes: readonly Box[]): Box => boundsOf(boxes.map((b) => [[b[0], b[1]] as Pt, [b[2], b[3]] as Pt]));
const closed = (poly: readonly Pt[]): Pt[] => [...poly, poly[0]!];

/** One timeline period's marks, as anatomy reads them. */
export type Part = ReturnType<typeof anatomy>;

/** The layout traced in thin blue construction pencil: every box, marker, string, word box and the rail. */
export const constructionMarks = (parts: readonly Part[], rail: Box) =>
  polylines(
    [
      ...parts.flatMap((p) => [
        ...p.period.sides,
        ...p.event.sides,
        p.ring,
        p.string,
        p.dot,
        boxPolygon(p.period.label).concat([[p.period.label[0], p.period.label[1]]]),
        boxPolygon(p.event.label).concat([[p.event.label[0], p.event.label[1]]]),
      ]),
      boxPolygon(rail).concat([[rail[0], rail[1]]]),
    ],
    CONSTRUCTION,
    0.014,
    { opacity: 0.85 },
  );

/**
 * The chart as objects, laid on its marks with every word's box kept clear: the lines the pen will ink (planks with
 * their grain, tags with their holes, strings, every ring but `focus`'s, already inked, and the rail as a rope) and
 * the pencil tint strokes. The hatching draws from `pencilRand`, plank then tag, period by period.
 */
export function chartObjects(parts: readonly Part[], focus: Part, rail: Box, pencilRand: () => number) {
  const words = parts.flatMap((p) => [p.period.label, p.event.label]).map((b) => grow(b, 0.05));
  const chartPen: Pt[][] = [],
    chartPencil: { seg: [Pt, Pt]; tint: string }[] = [];
  for (const p of parts) {
    // A plank for the period: its outline, grain either side of the word, an ochre tint.
    chartPen.push(...p.period.sides);
    const [x0, y0, x1, y1] = p.period.box,
      l = p.period.label;
    for (const f of [0.3, 0.7]) {
      const y = y0 + (y1 - y0) * f;
      chartPen.push(
        [
          [x0 + 0.06, y],
          [l[0] - 0.08, y],
        ],
        [
          [l[2] + 0.08, y],
          [x1 - 0.06, y],
        ],
      );
    }
    for (const seg of hatch(
      boxPolygon(grow(p.period.box, -0.03)),
      { angle: 60, spacing: 0.06, shortfall: 0.05 },
      pencilRand,
    ))
      for (const piece of unowned(seg, words, 0.01))
        chartPencil.push({ seg: [piece[0]!, piece.at(-1)!], tint: 'plank' });
    // A tag for the event, hung on the string from the marker, with a hole where the string ties on.
    const shape = tag(p.event.box);
    chartPen.push([...shape, shape[0]!]);
    const hx = (p.event.box[0] + p.event.box[2]) / 2,
      hy = p.event.box[3] - 0.06;
    chartPen.push(
      Array.from(
        { length: 13 },
        (_, k) =>
          [hx + 0.028 * Math.cos((k / 12) * 2 * Math.PI), hy + 0.028 * Math.sin((k / 12) * 2 * Math.PI)] as Pt,
      ),
    );
    for (const seg of hatch(
      shape.map(([x, y]) => [x + (x < hx ? 0.03 : -0.03), y + (y < hy ? 0.03 : -0.03)] as Pt),
      { angle: 120, spacing: 0.06, shortfall: 0.05 },
      pencilRand,
    ))
      for (const piece of unowned(seg, [...words, [hx - 0.06, hy - 0.06, hx + 0.06, hy + 0.06]], 0.01))
        chartPencil.push({ seg: [piece[0]!, piece.at(-1)!], tint: 'tag' });
    // The ring the camera closed on is already inked; the others are drawn with the plate.
    chartPen.push(p.string);
    if (p !== focus) chartPen.push(p.ring);
  }
  // The rail as a rope: two strands and a twist every 0.14.
  const ry = (rail[1] + rail[3]) / 2;
  chartPen.push(
    [
      [rail[0], ry + 0.025],
      [rail[2], ry + 0.025],
    ],
    [
      [rail[0], ry - 0.025],
      [rail[2], ry - 0.025],
    ],
  );
  for (let x = rail[0] + 0.07; x < rail[2]; x += 0.14)
    chartPen.push([
      [x - 0.03, ry - 0.025],
      [x + 0.03, ry + 0.025],
    ]);
  return { chartPen, chartPencil };
}

/** Words last: Hershey letters fitted into each label's box, and the plate's title in `titleBox`, the sky. */
export const plateLetters = (parts: readonly Part[], titleBox: Box) => [
  ...parts.flatMap((p) => [
    fit(hershey(p.period.text).strokes, p.period.label),
    fit(hershey(p.event.text).strokes, p.event.label),
  ]),
  fit(hershey(TITLE).strokes, titleBox),
];

/**
 * How many pencil strokes and pen pressures the plate has used so far. The scenery draws first, then the chart's tints
 * and ink, so each pencil's width and each line's pressure follow on from the last.
 */
export type Strokes = { pencil: number; pressure: number };
/** The scenery, a group per layer: its pencil strokes, then its ink. */
export const drawScenery = (layers: readonly Layer[], sceneInk: readonly Pt[][][], pressure: readonly number[], n: Strokes) =>
  layers.map((l, li) => {
    const g = new Group();
    for (const seg of l.pencil)
      g.add(
        new Line(seg[0] as Vec, seg[1] as Vec, {
          stroke: TINTS[l.tint]!,
          strokeWidth: pencilWidth(n.pencil++, 0.016, SHARPEN),
          strokeOpacity: 0.7,
          lineCap: 'round',
        }),
      );
    for (const ink of sceneInk[li]!) g.add(polylines([ink], INK, 0.022 * pressure[n.pressure++]!));
    return g;
  });
/** The chart's pencil tints. */
export function drawTints(chartPencil: readonly { seg: [Pt, Pt]; tint: string }[], n: Strokes) {
  const tints = new Group();
  for (const { seg, tint } of chartPencil)
    tints.add(
      new Line(seg[0] as Vec, seg[1] as Vec, {
        stroke: TINTS[tint]!,
        strokeWidth: pencilWidth(n.pencil++, 0.016, SHARPEN),
        strokeOpacity: 0.55,
        lineCap: 'round',
      }),
    );
  return tints;
}
/** The chart's ink, each line at its pressure, and the markers' dots filled. */
export const drawInked = (chartInk: readonly Pt[][], dots: readonly Pt[][], pressure: readonly number[], n: Strokes) =>
  new Group(
    ...chartInk.map((l) => polylines([l], INK, 0.022 * pressure[n.pressure++]!)),
    polylines(dots, INK, 0.01, { fill: true }),
  );
/** The words, in single-stroke letters. */
export const drawWords = (letters: readonly Pt[][][]) => new Group(...letters.map((l) => polylines(l, INK, 0.02)));
/** The first drawing's sea strokes and gulls, in grey, to lay over the second. */
export const drawFirstScenery = (first: { layers: readonly Layer[]; ink: readonly Pt[][][] }) =>
  new Group(
    polylines(
      first.layers.find((l) => l.name === 'sea')!.pencil.map(([a, b]) => [a, b]),
      GREY,
      0.02,
      { opacity: 0.8 },
    ),
    polylines(first.ink[first.layers.findIndex((l) => l.name === 'gulls')]!, GREY, 0.02, { opacity: 0.8 }),
  );
/** The laid-out period and event boxes, dashed red: the boxes both drawings fill. */
export function drawSharedBoxes(parts: readonly Part[]) {
  const sharedBoxes = new Group(
    ...parts.flatMap((p) => [p.period.box, p.event.box]).map((b) => polylines([[...boxPolygon(b), [b[0], b[1]]]], TINTS.bands!, 0.018)),
  );
  for (const m of sharedBoxes.family()) m.style.dashArray = '0.08 0.06';
  return sharedBoxes;
}

/**
 * The free hand's drawing of the chart. It draws the rail and every box, marker ring and string itself, each line
 * starting where the last one ended; the words keep the places the layout gave them. `meant` is the route as laid
 * out, `holders` the lines that hold a word, `drifted` where the hand's corners landed (from rng(seed + 5)), and
 * `freeInk` its ink along them (from rng(seed + 6)).
 */
export function freehandChart(parts: readonly Part[], rail: Box, seed: number) {
  const ry = (rail[1] + rail[3]) / 2;
  // The rail first, as a hand drawing a timeline would, then each period's box, string, ring and tag.
  const meant: Pt[][] = [
    [
      [rail[0], ry],
      [rail[2], ry],
    ],
  ];
  const holders: { line: number; label: Box }[] = [];
  for (const p of parts) {
    holders.push({ line: meant.length, label: p.period.label });
    meant.push(closed(boxPolygon(p.period.box)), p.string, p.ring);
    holders.push({ line: meant.length, label: p.event.label });
    meant.push(closed(tag(p.event.box)));
  }
  const moves: Pt[] = [];
  meant.forEach((l, j) => {
    if (j) moves.push([l[0]![0] - meant[j - 1]!.at(-1)![0], l[0]![1] - meant[j - 1]!.at(-1)![1]]);
    for (let i = 1; i < l.length; i++) moves.push([l[i]![0] - l[i - 1]![0], l[i]![1] - l[i - 1]![1]]);
  });
  const corners = freehand(meant[0]![0]!, moves, FREEHAND, rng(seed + 5));
  let at = 0;
  const drifted = meant.map((l, j) => {
    if (j) at++; // the pen-up move lands on this line's first corner
    const out = corners.slice(at, at + l.length);
    at += l.length - 1;
    return out;
  });
  const freeInk = drifted.map((l) => hand(l, HAND, rng(seed + 6)));
  return { meant, holders, drifted, freeInk };
}

/** A chart drawing scaled so the chart is 14.8 wide or 2.8 tall, its strokes with it, and centred at height y. */
function placeChart(g: Group, y: number, chart: Box) {
  const k = Math.min(14.8 / (chart[2] - chart[0]), 2.8 / (chart[3] - chart[1]));
  const [cx, cy] = [(chart[0] + chart[2]) / 2, (chart[1] + chart[3]) / 2];
  g.scale(k, { aboutPoint: [cx, cy] });
  for (const m of g.family()) m.style.strokeWidth *= k;
  return g.shift([-cx, y - cy]);
}
/** The free hand's chart at height y: its ink, the words where the layout put them, and a red box round each word that pokes out. */
export const freeDrawing = (freeInk: readonly Pt[][], chartWords: readonly Pt[][][], misses: readonly { label: Box }[], chart: Box, y: number) =>
  placeChart(
    new Group(
      ...freeInk.map((l) => polylines([l], INK, 0.022)),
      ...chartWords.map((l) => polylines(l, INK, 0.02)),
      ...misses.map(({ label }) => polylines([closed(boxPolygon(grow(label, 0.04)))], TINTS.bands!, 0.03)),
    ),
    y,
    chart,
  );
/** The opening's count of words outside their boxes. */
export const tallyLine = (misses: number, words: number, ink: string) =>
  new Text(`${misses} of ${words} words outside the box drawn round them`, {
    fontSize: 0.34,
    color: ink,
  }).moveTo([2.4, 1.95]);

/** Midnight's ring as a pale band several ink widths wide, so the blue still shows either side of the ink. */
export const ringBand = (focus: Part) => polylines([focus.ring], CONSTRUCTION, INK_WIDTH * 6, { opacity: 0.35 });
/** Midnight's string and dot in construction pencil. */
export const markerMarks = (focus: Part) => polylines([focus.string, focus.dot], CONSTRUCTION, 0.014, { opacity: 0.85 });
/** The pen's ink on the ring, at the close-up's width. */
export const ringInkLine = (ringInk: readonly Pt[]) => polylines([ringInk], INK, INK_WIDTH);
/** The plate's chart again, traced on its marks, at height y: its tints, its ink, Midnight's ring and the words. */
export const tracedChart = (tints: Group, inked: Group, ringInk: readonly Pt[], chartWords: readonly Pt[][][], chart: Box, y: number) =>
  placeChart(new Group(tints.copy(), inked.copy(), polylines([ringInk], INK, 0.022), ...chartWords.map((l) => polylines(l, INK, 0.02))), y, chart);
/** The headings over the last step's two drawings. */
export const panelHeads = (ink: string) =>
  new Group(
    new Text('Each line begun at the end of the last', { fontSize: 0.3, color: ink, weight: 'bold', anchor: 'start' }).moveTo([-7.4, 2.75], [-1, 0]),
    new Text('Traced on the layout’s marks', { fontSize: 0.3, color: ink, weight: 'bold', anchor: 'start' }).moveTo(
      [-7.4, -0.85],
      [-1, 0],
    ),
  );
