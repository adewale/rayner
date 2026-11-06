import {
  frames as readerFrames, SEEDS, anatomy, pathed, CONSTRUCTION, SHARPEN, MARGIN, grow, union, constructionMarks, chartObjects,
  plateLetters, drawScenery, drawTints, drawInked, drawWords, drawFirstScenery, drawSharedBoxes, freehandChart,
  freeDrawing, tallyLine, ringBand, markerMarks, ringInkLine, tracedChart, panelHeads,
} from './picture.ts';
import type { Strokes } from './picture.ts';
import { Scene, Create, FadeOut, LaggedStart } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, Diagram, diagramsOf } from '../../../explain/index.ts';
import {
  WORLD,
  TITLE,
  HAND,
  rng,
  timelineFacts,
  hand,
  pressures,
  deviation,
  inside,
  boundsOf,
  scenery,
} from './model.ts';
import type { Pt, Box, Layer } from './model.ts';

const STYLE = 'pen-and-ink';
const FOCUS = 1; // Midnight
/** The chart's share of the stage: the lower half, and a little more for the layout's own margin. */
const CHART_BOX: Box = [-7.55, -4.25, 7.55, 0.5];

const fmt = (n: number, d = 3) => n.toFixed(d);

export default class PenAndPencil extends Scene {
  static meta = {
    sources: [
      'https://pele-art-diagrams.vercel.app/',
      'https://github.com/rheos/secondunit-videos/blob/main/references/pele-diagrams/README.md',
      'https://pele.run',
      'https://paulbourke.net/dataformats/hershey/',
      'https://github.com/rough-stuff/rough/wiki',
    ],
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
    const construction = constructionMarks(parts, rail);

    // The hand's draws stay here, as the model's: penRand inks the ring, the chart, the pressures and the scenery in that order.
    const penRand = rng(seed),
      pencilRand = rng(seed + 1),
      sceneRand = rng(seed + 2);
    // The ring the camera closes on: the hand's ink against the ring as laid out.
    const ringInk = hand(focus.ring, HAND, penRand);
    const ringStray = deviation(ringInk, focus.ring);

    // The paper the chart and the title own; the scenery is cut away there.
    const titleBox: Box = [-2.9, 2.6, 1.7, 3.05];
    const owned = [grow(chart, MARGIN), grow(titleBox, MARGIN)];

    // Chart objects, ink and pencil, with every word's box kept clear (the hatching draws from pencilRand).
    const { chartPen, chartPencil } = chartObjects(parts, focus, rail, pencilRand);
    const chartInk = chartPen.map((l) => hand(l, HAND, penRand));
    const chartStray = Math.max(ringStray, ...chartInk.map((ink, i) => deviation(ink, chartPen[i]!)));
    const dots = parts.map((p) => p.dot);

    // Words last: Hershey letters fitted into each label's box, and the plate's title in the sky.
    const letters = plateLetters(parts, titleBox);
    const letterCount = letters.reduce((n, l) => n + l.length, 0);

    const pressure = pressures(
      scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, rng(seed + 2)).reduce((n, l) => n + l.pen.length, 0) +
        chartInk.length,
      penRand,
    );
    const layers: Layer[] = scenery([-7.55, chart[3] - 0.3, 7.55, 3.15], owned, sceneRand);
    // The scenery takes the first pencils and pressures, the chart the rest.
    const strokes: Strokes = { pencil: 0, pressure: 0 };
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
    const sceneGroups = drawScenery(layers, sceneInk, pressure, strokes);
    const scenePoints = [...sceneInk.flat(2), ...layers.flatMap((l) => l.pencil.flat())];
    const trespass = scenePoints.filter((p) => owned.some((b) => inside(p, grow(b, -MARGIN)))).length;

    // The chart in pencil and ink, then the words.
    const tints = drawTints(chartPencil, strokes);
    const inked = drawInked(chartInk, dots, pressure, strokes);
    const wordGroup = drawWords(letters);
    const sharpenings = Math.floor(strokes.pencil / SHARPEN);
    const objects = parts.length * 3 + 1;
    // The second drawing is laid over the first's: the first's scenery in grey, and the boxes both were drawn in.
    // Only the sea's pencil strokes and the gulls are placed by chance; the hills, rock and lighthouse are fixed.
    const first = which === 'first' ? null : sceneryOf(SEEDS.first);
    const firstScenery = first ? drawFirstScenery(first) : null;
    const sharedBoxes = drawSharedBoxes(parts);
    // ---- The free hand, which the opening shows and the ending sets above the traced chart (picture.ts).
    const { meant, holders, drifted, freeInk } = freehandChart(parts, rail, seed);
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
    const freeAt = (y: number) => freeDrawing(freeInk, chartWords, misses, chart, y);
    const wordCountFree = holders.length;


    // 1. The failure on the real timeline: a hand that places its own strokes pushes words out of their boxes.
    await this.step('text', {
      title: 'Can a wobbling hand draw this timeline and keep its words in their boxes?',
      line: 'What must be fixed before any ink?',
      caption: `The words stayed where the layout placed them, but ${misses.length} of ${wordCountFree} poke out of their boxes. This simulated hand chained imperfect moves, every line setting off from where the previous one stopped. A displaced endpoint became the next line’s starting point. What must be fixed before the ink begins?`,
    });
    await s.clear();
    const source = await s.code(WORLD.split('\n'), { at: [-7.55, 1.2, -2.95, 2.75], fontSize: 0.3, enter: false });
    const opening = freeAt(-1.5);
    const tally0 = tallyLine(misses.length, wordCountFree, s.palette.ink);
    await s.enter(source, opening, tally0, {
      describe: `The timeline’s four lines of text, and below them the timeline drawn by a hand that sets off each line from where the last stopped: its boxes, rings and strings wander from left to right, and ${misses.length} of the ${wordCountFree} words, outlined in red, stick out of their boxes.`,
    });
    s.opening(opening);
    this.state.periods = facts.length;

    // 2. Why the boxes wander, and the fix in miniature: the route is fixed first, and the hand only follows it.
    await s.steps(readerFrames(seed), { kind: 'short' });

    // 3. For the real timeline, the layout comes first.

    await this.step('layout', {
      kind: 'detail',
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
      caption: `Agentic Mermaid lays the real timeline out first, sizing each box from its words’ measured widths. The construction pencil traces those fixed outlines, and the ink then follows them. These marks separate where the chart belongs from how its strokes look; they are the same in both drawings. The ${wordCount} words have places to fit before either drawing begins.`,
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

    await this.step('hand', {
      title: 'Close on Midnight’s marker, the ink lies on the blue ring',
      line: 'Pale blue band: the ring as laid out. Dark line: the spring hand’s ink.',
      caption: `The pale band is the fixed ring; the dark line is the spring hand’s ink. This ring strays at most ${fmt(ringStray)} units from its route, while the largest deviation across the chart is ${fmt(chartStray)}. A wobbly stroke can remain close to its route without making the next object inherit its error.`,
    });
    await drop(corner, tally);
    // Midnight's marker stays in blue; the rest of the construction is set aside so no line crosses the heading.
    // The ring as a pale band several ink widths wide, so the blue still shows either side of the ink.
    const ring = ringBand(focus);
    await s.enter(ring, markerMarks(focus), {
      runTime: 0.2,
      describe: 'Midnight’s marker in blue construction pencil: its ring as a pale band, the dot inside and the string below',
    });
    await this.play(traced.animate.setOpacity(0), { runTime: 0.3 });
    await s.focus(ring, { margin: 0.55 });
    await s.sketch(ringInkLine(ringInk), {
      tool: 'pen',
      runTime: 2,
      describe: 'Close on the Midnight marker: the pen’s ink lying on the blue ring it follows',
    });
    this.state.hand = { stray: Number(fmt(ringStray)) };

    await this.step('plate', {
      kind: 'detail',
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
      line: 'Top: the opening’s drawing. Bottom: the same chart traced on its marks.',
      caption: `Both drawings have imperfect strokes. In the upper one, every error rode along into the lines after it, displacing boxes from the words. Below, each stroke starts from its own fixed mark, so the ${wordCountFree} words fit their boxes. The difference comes from how this model constructs the route, not from making its pen perfectly steady.`,
    });
    await s.clear();
    const freePanel = freeAt(1.15);
    const tracedPanel = tracedChart(tints, inked, ringInk, chartWords, chart, -2.6);
    const heads = panelHeads(s.palette.ink);
    await s.enter(heads, freePanel, tracedPanel, {
      describe: `Two drawings of the timeline. Above, drawn by a hand that sets off each line from where the last stopped: the boxes, rings and strings wander from left to right, and ${misses.length} of the ${wordCountFree} words, outlined in red, stick out of their boxes. Below, the same chart traced on the layout’s marks, every word inside its box.`,
    });
    s.opening(freePanel, tracedPanel);
    this.state.freehand = { misses: misses.length, words: wordCountFree, maxOff: Number(fmt(maxOff)) };
  }
}
