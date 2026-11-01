import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/pen-and-pencil.ts';
import { Scene, VMobject, Group, Line, Create, FadeOut, LaggedStart } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
import {
  WORLD,
  TITLE,
  PLATES,
  HAND,
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
/** Light pencil tints; the palette is the same in every case. */
const TINTS: Record<string, string> = {
  hills: '#7f9a6c',
  sea: '#6f93b3',
  rock: '#9a7f5c',
  bands: '#c0584a',
  beam: '#d9a632',
  plank: '#c08f45',
  tag: '#7aa6c2',
};
const SEEDS: Record<string, number> = { first: 1967, second: 7 };
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
    ],
  };
  static settings = [
    {
      id: 'hand',
      label: 'Draw the plate',
      default: 'first',
      options: [
        { value: 'first', label: 'First drawing' },
        { value: 'second', label: 'Second drawing' },
      ],
    },
  ];
  override async construct() {
    const which = settingsOf(this).hand as string,
      seed = SEEDS[which]!,
      s = stage(this, { style: STYLE, headingSize: 0.6 });
    const facts = timelineFacts(WORLD);
    const drop = (...mobs: Mobject[]) => this.play(...mobs.map((m) => new FadeOut(m, { runTime: 0.3 })));

    await readerFirst(this, s, readerFrames(seed));
    await this.step('text', {
      detail: true,
      title: 'Can a hand draw a diagram without moving its labels?',
      line: 'A timeline names four periods but gives none of them positions.',
      caption:
        'A simulated hand makes every stroke a little different. If it also decided where the words and boxes went, the timeline could lose its structure. This example starts with four named periods and no positions; the next steps lay out their boxes before drawing them by hand. The pele page uses the same separation for four charts, though this timeline is our own model, not its code.',
    });
    await s.clear();
    const source = await s.code(WORLD.split('\n'), {
      at: regionBox('top', { right: -0.4, bottom: 0.9 }),
      fontSize: 0.3,
      enter: false,
    });
    const plates = await s.card(PLATES, {
      at: regionBox('top', { left: 0.2, bottom: 0.9 }),
      title: 'The page’s four plates',
      enter: false,
    });
    await s.enter(source, plates);
    this.state.periods = facts.length;

    await this.step('layout', {
      detail: true,
      title: 'The layout engine fixes every box, marker and label',
      line: 'The engine places every box; the drawing never moves one.',
      caption:
        'On the page pele lays the chart out, measuring each label with Hershey letter widths so the boxes fit the hand lettering. Here Agentic Mermaid does the layout with Inter’s widths, so the lettering is fitted into the boxes later. The dimension gives one event box’s width in stage units.',
    });
    // The text stays in view, carried into a corner, while the layout it became arrives.
    await drop(plates);
    await s.carry(source, [-7.55, 1.5, -2.95, 3.25]);
    const d = await s.show({ source: WORLD }, { box: CHART_BOX });
    // Read every mark before anything restyles the diagram.
    const parts = facts.map((_, i) => anatomy(d, i));
    const railMob = d.get('rail').family().find(pathed)!;
    const rail = railMob.box()! as Box;
    const chart = union([...parts.flatMap((p) => [p.period.box, p.event.box]), rail]);
    const focus = parts[FOCUS]!;
    await d.mark([`period:period-${FOCUS}`], { as: 'measured' });
    const [ex0, ey0, ex1] = focus.event.box;
    const width = await s.dimension([ex0, ey0], [ex1, ey0], `${fmt(ex1 - ex0, 2)} units`, { offset: -0.3 });

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

    await this.step('marks', {
      detail: true,
      title: 'Fixed layout marks guide the hand’s later strokes',
      line: 'Every later stroke is drawn from these marks alone.',
      caption: `Like the page, which flattens pele’s SVG into marks a script can select, the drawing reads the layout back: ${outlineCount} outlines, ${filledCount} filled shapes and ${wordCount} words. A blue construction pencil traces them first, and every later stroke is drawn from these marks alone.`,
    });
    await drop(width);
    await d.hide();
    const traced = await s.draw(construction, {
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
    s.reading(traced, tally);
    this.state.marks = { outlines: outlineCount, filled: filledCount, words: wordCount };

    await this.step('hand', {
      detail: true,
      title: `The hand strays at most ${fmt(ringStray)} units from the line it follows`,
      line: 'A damped spring chases the line; tremor shakes it.',
      caption: `The pen is a mass on a damped spring, ${HAND.frequency} Hz with damping ${HAND.damping}, chasing a point that moves along the line at ${HAND.speed} units a second, shaken by tremor of up to ${HAND.tremor}. Close on the Midnight marker, the spring smooths the tremor into slow wobbles about the blue ring.`,
    });
    await drop(source, tally);
    const ring = polylines([focus.ring], CONSTRUCTION, 0.004);
    await s.focus(ring, { margin: 0.55 });
    await s.draw(polylines([ringInk], INK, 0.006), {
      tool: 'pen',
      runTime: 2,
      describe: 'Close on the Midnight marker: the pen’s ink following the blue ring, wobbling gently about it',
    });
    this.state.hand = { stray: Number(fmt(ringStray)) };

    const pressure = pressures(
      scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, rng(seed + 2)).reduce((n, l) => n + l.pen.length, 0) +
        chartInk.length,
      penRand,
    );
    const layers: Layer[] = scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, sceneRand);
    let pi = 0,
      pencilIndex = 0;
    const sceneInk = layers.map((l) => l.pen.map((line) => hand(line, HAND, penRand)));
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
    // The owned paper, shown: dashed outlines the scenery is cut around.
    const ownedShown = new Group(
      ...owned.map((b) => polylines([[...boxPolygon(b), [b[0], b[1]]]], TINTS.bands!, 0.016, { opacity: 0.8 })),
    );
    for (const m of ownedShown.family()) m.style.dashArray = '0.08 0.06';

    await this.step('scene', {
      detail: true,
      title: 'The made-up world is drawn far to near, around the chart',
      line: 'Hills, sea, lighthouse, gulls: never on paper the chart owns.',
      caption: `Hills, sea, a rock with its lighthouse and beam, then gulls: ${layers.length} layers, far to near. The chart and the title own the paper inside the dashed lines, with a ${MARGIN} margin, so the scenery is cut away there: ${trespass} scenery points land on owned paper.`,
    });
    await s.focus('all');
    await s.draw(ownedShown, {
      tool: false,
      runTime: 0.8,
      describe: 'Dashed red outlines round the chart and the title: the paper they own',
    });
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
    this.state.scene = { layers: layers.map((l) => l.name), trespass };

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
    await this.step('plate', {
      title: 'The chart is drawn last, then its words',
      line: `Objects, then words; no ink strays over ${fmt(chartStray)} from its mark.`,
      caption:
        which === 'first'
          ? `Periods become planks, events become tags hung on strings, and the rail becomes a rope: ${objects} objects drawn on the laid-out marks, no ink more than ${fmt(chartStray)} units from them. Hershey letters come last, inside the boxes the layout gave; a second drawing changes the strokes and scenery without moving the chart’s laid-out boxes.`
          : `The second drawing used another seed, so its strokes and scenery differ from the first. No chart ink lies more than ${fmt(chartStray)} units from the same laid-out marks; the chart’s planks, tags and words stayed in their boxes.`,
    });
    await drop(ownedShown);
    s.keep(tints, {
      describe: `Light pencil tints on the chart: ochre on the ${facts.length} period planks, blue on the ${facts.length} event tags, every word’s box left clear`,
    });
    await this.play(new Create(tints, { runTime: 1.2, lagRatio: 0.02 }));
    await s.draw(inked, {
      tool: 'pen',
      runTime: 3.2,
      describe: `The timeline drawn as objects in warm-black ink over its blue construction: ${facts.length} periods as planks, ${facts.length} events as tags on strings, marker rings and a rope rail`,
    });
    await s.draw(wordGroup, {
      tool: 'pen',
      runTime: 2.4,
      describe: `Every word of the chart in Hershey single-stroke letters, and the title “${TITLE}” in the sky`,
    });
    s.reading(tints, inked, wordGroup, ...sceneGroups);
    this.state.plate = { objects, stray: Number(fmt(chartStray)), letters: letterCount, sharpenings };
  }
}
