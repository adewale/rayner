import { frames as readerFrames, SEEDS, GREY, px } from '../lib/readers/pen-and-pencil.ts';
import { Scene, VMobject, Group, Line, Text, Create, FadeOut, LaggedStart } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf, Diagram, diagramsOf } from '../../../explain/index.ts';
import {
  WORLD,
  TITLE,
  HAND,
  FREEHAND,
  freehand,
  rng,
  timelineFacts,
  hand,
  pressures,
  pencilWidth,
  deviation,
  hatch,
  boxPolygon,
  unowned,
  inside,
  hershey,
  fit,
  boundsOf,
  tag,
  scenery,
} from '../lib/pen-and-pencil.ts';
import type { Pt, Box, Layer } from '../lib/pen-and-pencil.ts';

const STYLE = 'pen-and-ink';
/** The page's warm-black pen, from the study. */
const INK = '#2b2320';
const CONSTRUCTION = '#5b8fd0';
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
const SHARPEN = 60;
/** Owned paper keeps this margin clear around it. */
const MARGIN = 0.12;
const FOCUS = 1; // Midnight
/** The chart's share of the stage: the lower half, and a little more for the layout's own margin. */
const CHART_BOX: Box = [-7.55, -4.25, 7.55, 0.5];

type Pathed = Mobject & { subpaths: Float32Array[] };
const pathed = (m: Mobject): m is Pathed => Array.isArray((m as Pathed).subpaths) && m.hasPoints();
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
const grow = (b: Box, by: number): Box => [b[0] - by, b[1] - by, b[2] + by, b[3] + by];
const union = (boxes: readonly Box[]): Box => boundsOf(boxes.map((b) => [[b[0], b[1]] as Pt, [b[2], b[3]] as Pt]));

/** One timeline period read back as marks: its label box, marker, string and event tag. */
function anatomy(d: Diagram, i: number) {
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
function polylines(
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
const fmt = (n: number, d = 3) => n.toFixed(d);

export default class PenAndPencil extends Scene {
  static meta = {
    id: 'pen-and-pencil',
    title: 'Can hand-drawn strokes keep a diagram’s layout?',
    sources: [
      'https://pele-art-diagrams.vercel.app/',
      'https://github.com/rheos/secondunit-videos/blob/main/references/pele-diagrams/README.md',
      'https://pele.run',
      'https://paulbourke.net/dataformats/hershey/',
      'https://github.com/rough-stuff/rough/wiki',
    ],
    // The script's answer and check questions (script.md); reader-separate states the answer.
    answer:
      'Lay the chart out first and let the hand only trace it, so a new drawing changes each stroke’s wobble and leaves every box where the layout put it',
    // Sentences about every line, box or stroke: the test that holds each, or "shown" where the sentence
    // speaks only of the drawing on screen in its own step. The hand is the explainer's own model.
    claims: [
      { says: 'every line setting off from where the previous one stopped', shown: true as const },
      {
        says: 'so every error is carried into every later corner',
        test: 'test/explain-pen-and-pencil.test.ts: with error, each corner carries the ones before',
      },
      {
        says: 'leaves every box where the layout put it',
        test: 'test/explain-pen-and-pencil.test.ts: traced on its laid-out marks, a drawing with any seed leaves every box where the layout put it',
      },
      { says: 'Agentic Mermaid fixes every box first', shown: true as const },
      { says: 'Every box, marker and label has its place before any ink', shown: true as const },
      { says: 'it places every period box, marker and event box', shown: true as const },
      {
        says: 'they are the same in both drawings',
        test: 'test/explain-pen-and-pencil.test.ts: both drawings trace the same marks',
      },
      {
        says: 'every plank, tag and word lands in the dashed boxes the first drawing used',
        test: 'test/explain-pen-and-pencil.test.ts: both drawings trace the same marks',
      },
      {
        says: 'every error rode along into the lines after it',
        test: 'test/explain-pen-and-pencil.test.ts: with error, each corner carries the ones before',
      },
    ],
    checks: [
      {
        question:
          'Give the spring hand of the third step the opening’s route instead: a point that moves corner to corner as the opening’s hand did, each line starting where the last one stopped and up to 2° and 3% off. Would words still poke out of their boxes?',
        answer:
          'Yes. The spring keeps the ink close to whatever route it chases, but that route has wandered just as the opening’s boxes did, so the boxes still end up far from where the layout put them. The opening’s drawing was made exactly this way. What keeps the words inside is a route laid out before any ink; the spring only keeps each stroke near its route.',
      },
      {
        question:
          'Lower the spring hand’s damping to a quarter of its value, so the pen overshoots at every corner before settling. Would a second drawing then move any box?',
        answer:
          'No. The ink would stray further from its marks, about 0.02 units instead of 0.005 in this model. But each stroke still starts at rest on its own laid-out mark and chases only that mark, so the overshoot never carries into the next stroke, and every box stays where the layout put it.',
      },
    ],
  };
  static settings = [
    {
      id: 'hand',
      label: 'Draw the plate',
      default: 'second',
      options: [
        { value: 'first', label: 'First drawing' },
        { value: 'second', label: 'Second drawing' },
      ],
    },
  ];
  override async construct() {
    const which = settingsOf(this).hand as string,
      seed = SEEDS[which as keyof typeof SEEDS],
      s = stage(this, { style: STYLE, headingSize: 0.6 });
    const facts = timelineFacts(WORLD);
    const drop = (...mobs: Mobject[]) => this.play(...mobs.map((m) => new FadeOut(m, { runTime: 0.3 })));


    // The layout, read back as marks before the first step: the opening already draws on it.
    const spec = { source: WORLD, style: STYLE };
    const plan = new Diagram(this, spec, await diagramsOf(this).diagram(spec), { box: CHART_BOX });
    const parts = facts.map((_, i) => anatomy(plan, i));
    const railMob = plan.get('rail').family().find(pathed)!;
    const rail = railMob.box()! as Box;
    const chart = union([...parts.flatMap((p) => [p.period.box, p.event.box]), rail]);
    const focus = parts[FOCUS]!;

    // ---- Everything the plate needs, worked out from the marks before anything is drawn.
    const outlineCount = parts.reduce((n, p) => n + p.outlines, 0),
      filledCount = parts.reduce((n, p) => n + p.filled, 1),
      wordCount = parts.reduce((n, p) => n + p.words, 0);
    const construction = polylines(
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

    const penRand = rng(seed),
      pencilRand = rng(seed + 1),
      sceneRand = rng(seed + 2);
    // The ring the camera closes on: the hand's ink against the ring as laid out.
    const ringInk = hand(focus.ring, HAND, penRand);
    const ringStray = deviation(ringInk, focus.ring);

    // The paper the chart and the title own; the scenery is cut away there.
    const titleBox: Box = [-2.9, 2.6, 1.7, 3.05];
    const owned = [grow(chart, MARGIN), grow(titleBox, MARGIN)];

    // Chart objects, ink and pencil, with every word's box kept clear.
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
    const chartInk = chartPen.map((l) => hand(l, HAND, penRand));
    const chartStray = Math.max(ringStray, ...chartInk.map((ink, i) => deviation(ink, chartPen[i]!)));
    const dots = parts.map((p) => p.dot);

    // Words last: Hershey letters fitted into each label's box, and the plate's title in the sky.
    const letters = [
      ...parts.flatMap((p) => [
        fit(hershey(p.period.text).strokes, p.period.label),
        fit(hershey(p.event.text).strokes, p.event.label),
      ]),
      fit(hershey(TITLE).strokes, titleBox),
    ];
    const letterCount = letters.reduce((n, l) => n + l.length, 0);

    const pressure = pressures(
      scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, rng(seed + 2)).reduce((n, l) => n + l.pen.length, 0) +
        chartInk.length,
      penRand,
    );
    const layers: Layer[] = scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, sceneRand);
    let pi = 0,
      pencilIndex = 0;
    const sceneInk = layers.map((l) => l.pen.map((line) => hand(line, HAND, penRand)));
    /** The scenery as the drawing with seed `sd` lays it down: its layers, and their ink from a pen that drew the ring and the chart first. */
    const sceneryOf = (sd: number) => {
      const pen = rng(sd),
        bounds: Box = [-7.55, chart[3] - 0.3, 7.55, 3.15];
      hand(focus.ring, HAND, pen);
      const chartCount = chartPen.map((l) => hand(l, HAND, pen)).length;
      pressures(scenery(bounds, owned, rng(sd + 2)).reduce((n, l) => n + l.pen.length, 0) + chartCount, pen);
      const ls = scenery(bounds, owned, rng(sd + 2));
      return { layers: ls, ink: ls.map((l) => l.pen.map((line) => hand(line, HAND, pen))) };
    };
    if (JSON.stringify(sceneryOf(seed).ink) !== JSON.stringify(sceneInk))
      throw new Error('sceneryOf must replay this drawing’s own scenery exactly');
    const sceneGroups = layers.map((l, li) => {
      const g = new Group();
      for (const seg of l.pencil)
        g.add(
          new Line(seg[0] as Vec, seg[1] as Vec, {
            stroke: TINTS[l.tint]!,
            strokeWidth: pencilWidth(pencilIndex++, 0.016, SHARPEN),
            strokeOpacity: 0.7,
            lineCap: 'round',
          }),
        );
      for (const ink of sceneInk[li]!) g.add(polylines([ink], INK, 0.022 * pressure[pi++]!));
      return g;
    });
    const scenePoints = [...sceneInk.flat(2), ...layers.flatMap((l) => l.pencil.flat())];
    const trespass = scenePoints.filter((p) => owned.some((b) => inside(p, grow(b, -MARGIN)))).length;

    // The chart in pencil and ink, then the words.
    const tints = new Group();
    for (const { seg, tint } of chartPencil)
      tints.add(
        new Line(seg[0] as Vec, seg[1] as Vec, {
          stroke: TINTS[tint]!,
          strokeWidth: pencilWidth(pencilIndex++, 0.016, SHARPEN),
          strokeOpacity: 0.55,
          lineCap: 'round',
        }),
      );
    const inked = new Group(
      ...chartInk.map((l) => polylines([l], INK, 0.022 * pressure[pi++]!)),
      polylines(dots, INK, 0.01, { fill: true }),
    );
    const wordGroup = new Group(...letters.map((l) => polylines(l, INK, 0.02)));
    const sharpenings = Math.floor(pencilIndex / SHARPEN);
    const objects = parts.length * 3 + 1;
    // The second drawing is laid over the first's: the first's scenery in grey, and the boxes both were drawn in.
    // Only the sea's pencil strokes and the gulls are placed by chance; the hills, rock and lighthouse are fixed.
    const first = which === 'first' ? null : sceneryOf(SEEDS.first);
    const firstScenery = first
      ? new Group(
          polylines(
            first.layers.find((l) => l.name === 'sea')!.pencil.map(([a, b]) => [a, b]),
            GREY,
            0.02,
            { opacity: 0.8 },
          ),
          polylines(first.ink[first.layers.findIndex((l) => l.name === 'gulls')]!, GREY, 0.02, { opacity: 0.8 }),
        )
      : null;
    const sharedBoxes = new Group(
      ...parts.flatMap((p) => [p.period.box, p.event.box]).map((b) => polylines([[...boxPolygon(b), [b[0], b[1]]]], TINTS.bands!, 0.018)),
    );
    for (const m of sharedBoxes.family()) m.style.dashArray = '0.08 0.06';
    // ---- The free hand, which the opening shows and the ending sets above the traced chart.
    // It draws the rail and every box, marker ring and string itself, each line starting where the
    // last one ended; the words keep the places the layout gave them.
    const closed = (poly: readonly Pt[]): Pt[] => [...poly, poly[0]!];
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
    // How far each laid-out corner of a box ended up, and which words poke out of the box drawn round them.
    const maxOff = Math.max(
      ...holders.map(({ line }) =>
        Math.max(...meant[line]!.map((q, i) => Math.hypot(drifted[line]![i]![0] - q[0], drifted[line]![i]![1] - q[1]))),
      ),
    );
    const outside = (poly: readonly Pt[], label: Box) => {
      const b = boundsOf([poly]);
      return !(inside([label[0], label[1]], b) && inside([label[2], label[3]], b));
    };
    const misses = holders.filter(({ line, label }) => outside(drifted[line]!, label));
    if (holders.some(({ line, label }) => outside(meant[line]!, label)))
      throw new Error('Every laid-out word must sit inside its laid-out box; the first and last steps say so');
    const chartWords = letters.slice(0, -1);
    // Both charts at one scale, the free one above the traced one.
    const k = Math.min(14.8 / (chart[2] - chart[0]), 2.8 / (chart[3] - chart[1]));
    const [cx, cy] = [(chart[0] + chart[2]) / 2, (chart[1] + chart[3]) / 2];
    const place = (g: Group, y: number) => {
      g.scale(k, { aboutPoint: [cx, cy] });
      for (const m of g.family()) m.style.strokeWidth *= k;
      return g.shift([-cx, y - cy]);
    };
    const freeDrawing = (y: number) =>
      place(
        new Group(
          ...freeInk.map((l) => polylines([l], INK, 0.022)),
          ...chartWords.map((l) => polylines(l, INK, 0.02)),
          ...misses.map(({ label }) => polylines([closed(boxPolygon(grow(label, 0.04)))], TINTS.bands!, 0.03)),
        ),
        y,
      );
    const wordCountFree = holders.length;


    // 1. The failure on the real timeline: a hand that places its own strokes pushes words out of their boxes.
    await this.step('text', {
      title: 'Can a wobbling hand draw this timeline and keep its words in their boxes?',
      line: 'What must be fixed before any ink?',
      caption: `The words stayed where the layout placed them, but ${misses.length} of ${wordCountFree} poke out of their boxes. This simulated hand chained imperfect moves, every line setting off from where the previous one stopped. A displaced endpoint became the next line’s starting point. What must be fixed before the ink begins?`,
    });
    await s.clear();
    const source = await s.code(WORLD.split('\n'), { at: [-7.55, 1.2, -2.95, 2.75], fontSize: 0.3, enter: false });
    const opening = freeDrawing(-1.5);
    const tallyLine = new Text(`${misses.length} of ${wordCountFree} words outside the box drawn round them`, {
      fontSize: 0.34,
      color: s.palette.ink,
    }).moveTo([2.4, 1.95]);
    await s.enter(source, opening, tallyLine, {
      describe: `The timeline’s four lines of text, and below them the timeline drawn by a hand that sets off each line from where the last stopped: its boxes, rings and strings wander from left to right, and ${misses.length} of the ${wordCountFree} words, outlined in red, stick out of their boxes.`,
    });
    s.opening(opening);
    this.state.periods = facts.length;

    // 2. Why the boxes wander, and the fix in miniature: the route is fixed first, and the hand only follows it.
    await s.steps(readerFrames(seed), { kind: 'short' });

    // 3. For the real timeline, the layout comes first.

    await this.step('layout', {
      title: 'For the real timeline, Agentic Mermaid fixes every box first',
      line: 'Every box, marker and label has its place before any ink.',
      caption: 'Agentic Mermaid turns the timeline text into geometry: it places every period box, marker and event box, sizing the boxes using Inter’s letter widths. The hand receives those positions rather than deciding them while it draws. rough.js uses the same separation in its rectangle API: the caller supplies the corner and size, while roughness affects the strokes.',
    });
    await s.clear();
    // The timeline's text stays in view in a corner while the layout it became arrives.
    const corner = await s.code(WORLD.split('\n'), { at: [-7.55, 1.5, -2.95, 2.75], fontSize: 0.3, enter: false });
    await s.enter(corner);
    const d = await s.show({ source: WORLD }, { box: CHART_BOX });
    await d.mark([`period:period-${FOCUS}`], { as: 'measured' });
    const [ex0, ey0, ex1] = focus.event.box;
    const width = await s.dimension([ex0, ey0], [ex1, ey0], `${fmt(ex1 - ex0, 2)} units`, { offset: -0.3 });

    await this.step('marks', {
      title: 'The hand is given the layout’s marks and nothing else',
      line: 'Blue pencil: the route the chart’s ink follows.',
      caption: `The construction pencil traces the fixed outlines before the ink follows them. These marks separate where the chart belongs from how its strokes look; they are the same in both drawings. The ${wordCount} words have places to fit before either drawing begins.`,
    });
    await drop(width);
    await d.hide();
    const traced = await s.sketch(construction, {
      tool: 'pencil',
      color: CONSTRUCTION,
      runTime: 3,
      describe: `The timeline’s layout traced in thin blue construction pencil: ${facts.length} period boxes, ${facts.length} event boxes, their markers and strings, the rail and an empty box where each word will go`,
    });
    traced.key = 'construction:marks';
    const tally = await s.callout(
      parts[2]!.period.box,
      `${outlineCount} outlines · ${filledCount} filled shapes · ${wordCount} words`,
      { side: 'above', gap: 0.45 },
    );
    tally.key = 'construction:tally';
    s.opening(traced, tally);
    this.state.marks = { outlines: outlineCount, filled: filledCount, words: wordCount };

    const INK_WIDTH = 0.006;
    await this.step('hand', {
      title: 'Close on Midnight’s marker, the ink lies on the blue ring',
      line: 'Pale blue band: the ring as laid out. Dark line: the spring hand’s ink.',
      caption: `The pale band is the fixed ring; the dark line is the spring hand’s ink. This ring strays at most ${fmt(ringStray)} units from its route, while the largest deviation across the chart is ${fmt(chartStray)}. A wobbly stroke can remain close to its route without making the next object inherit its error.`,
    });
    await drop(corner, tally);
    // Midnight's marker stays in blue; the rest of the construction is set aside so no line crosses the heading.
    // The ring as a pale band several ink widths wide, so the blue still shows either side of the ink.
    const ring = polylines([focus.ring], CONSTRUCTION, INK_WIDTH * 6, { opacity: 0.35 });
    await s.enter(ring, polylines([focus.string, focus.dot], CONSTRUCTION, 0.014, { opacity: 0.85 }), {
      runTime: 0.2,
      describe: 'Midnight’s marker in blue construction pencil: its ring as a pale band, the dot inside and the string below',
    });
    await this.play(traced.animate.setOpacity(0), { runTime: 0.3 });
    await s.focus(ring, { margin: 0.55 });
    await s.sketch(polylines([ringInk], INK, INK_WIDTH), {
      tool: 'pen',
      runTime: 2,
      describe: 'Close on the Midnight marker: the pen’s ink lying on the blue ring it follows',
    });
    this.state.hand = { stray: Number(fmt(ringStray)) };

    await this.step('plate', {
      title:
        which === 'first'
          ? 'The chart is drawn on its marks, and the words last'
          : 'Laid over the first drawing, the second fills the same boxes',
      line:
        which === 'first'
          ? `Objects, then words; no ink strays over ${fmt(chartStray)} from its mark.`
          : 'Grey: the first drawing’s sea and gulls. Dashed red: the shared boxes.',
      caption: which === 'first' ? `The planks, hanging tags and rope follow the fixed marks; the words fit the boxes those marks define. The drawing seed also places sea strokes and gulls, which can move without changing the chart’s geometry. This visual treatment follows the credited pele-art-diagrams examples. Which of these marks would a second drawing move?` : `The sea strokes and gulls move with the seed, and the ink wobbles differently. The construction stays fixed, so every plank, tag and word lands in the dashed boxes the first drawing used. The decorative strokes can change without deciding where a label belongs. The planks, tags and rope follow the credited pele-art-diagrams examples.`,
    });
    await s.focus('all');
    await this.play(traced.animate.setOpacity(1), { runTime: 0.3 });
    s.keep(sceneGroups[0]!, ...sceneGroups.slice(1), {
      describe:
        'Around the blue construction lines, a world drawn far to near: hatched hills on the left, a sea of short blue strokes, a rock and a striped lighthouse on the right with a yellow beam, and three gulls; the paper the chart and the title own is left bare',
    });
    await this.play(
      new LaggedStart(
        sceneGroups.map((g) => new Create(g, { runTime: 2.2, lagRatio: 0.03 })),
        { lagRatio: 0.55 },
      ),
    );
    s.keep(tints, {
      describe: `Light pencil tints on the chart: ochre on the ${facts.length} period planks, blue on the ${facts.length} event tags, every word’s box left clear`,
    });
    await this.play(new Create(tints, { runTime: 1.2, lagRatio: 0.02 }));
    await s.sketch(inked, {
      tool: 'pen',
      runTime: 3.2,
      describe: `The timeline drawn as objects in warm-black ink over its blue construction: ${facts.length} periods as planks, ${facts.length} events as tags on strings, marker rings and a rope rail`,
    });
    await s.sketch(wordGroup, {
      tool: 'pen',
      runTime: 2.4,
      describe: `Every word of the chart in Hershey single-stroke letters, and the title “${TITLE}” in the sky`,
    });
    if (firstScenery) {
      await s.sketch(firstScenery, {
        tool: false,
        runTime: 1,
        describe: 'The first drawing’s sea strokes and gulls laid over this one in grey, in other places than this drawing’s',
      });
      await s.sketch(sharedBoxes, {
        tool: false,
        runTime: 0.8,
        describe: `Dashed red outlines on the ${facts.length * 2} laid-out period and event boxes, the same for both drawings; every plank and tag sits on them`,
      });
      s.opening(firstScenery, sharedBoxes);
    }
    s.opening(tints, inked, wordGroup, ...sceneGroups);
    this.state.scene = { layers: layers.map((l) => l.name), trespass };
    this.state.plate = { objects, stray: Number(fmt(chartStray)), letters: letterCount, sharpenings };

    await this.step('freehand', {
      title: `Traced on fixed marks, all ${wordCountFree} words stay in their boxes`,
      line: 'Top: the opening’s drawing. Bottom: the finished plate.',
      caption: `Both drawings have imperfect strokes. In the upper one, every error rode along into the lines after it, displacing boxes from the words. Below, each stroke starts from its own fixed mark, so the ${wordCountFree} words fit their boxes. The difference comes from how this model constructs the route, not from making its pen perfectly steady.`,
    });
    await s.clear();
    const freePanel = freeDrawing(1.15);
    const tracedPanel = place(new Group(tints.copy(), inked.copy(), polylines([ringInk], INK, 0.022), ...chartWords.map((l) => polylines(l, INK, 0.02))), -2.6);
    const heads = new Group(
      new Text('Each line begun at the end of the last', { fontSize: 0.3, color: s.palette.ink, weight: 'bold', anchor: 'start' }).moveTo([-7.4, 2.75], [-1, 0]),
      new Text('Traced on the layout’s marks', { fontSize: 0.3, color: s.palette.ink, weight: 'bold', anchor: 'start' }).moveTo(
        [-7.4, -0.85],
        [-1, 0],
      ),
    );
    await s.enter(heads, freePanel, tracedPanel, {
      describe: `Two drawings of the timeline. Above, drawn by a hand that sets off each line from where the last stopped: the boxes, rings and strings wander from left to right, and ${misses.length} of the ${wordCountFree} words, outlined in red, stick out of their boxes. Below, the same chart traced on the layout’s marks, every word inside its box.`,
    });
    s.opening(freePanel, tracedPanel);
    this.state.freehand = { misses: misses.length, words: wordCountFree, maxOff: Number(fmt(maxOff)) };
  }
}
