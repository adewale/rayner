import { Scene, ItalicText, Group, Circle, Line, Rectangle, Create } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';

const SAMPLE = 'Ink on paper';
/** The gap each marker asks for after the phrase, in stage units. */
const GAP = 0.5;
const DIAGRAM = 'graph LR\nA["Ink"] --> B["Paper"]';
type Widths = 'natural' | 'recorded';

export default class FontMetrics extends Scene {
  static meta = {
    id: 'font-metrics',
    title: 'Why must font measurement match the drawn face?',
    sources: ['https://github.com/googlefonts/ebgaramond'],
    textContext: 'explicit' as const,
    lettering: { faces: { sans: 'eb-garamond' }, styles: ['bold', 'italic'] as const },
    // The script's answer and check questions (script.md); check holds a step (advance) to stating the answer.
    answer: 'Measure the face you draw: each face and cut gives the same text its own advances',
    // The opening's line speaks of its own two drawn rows: same words, size and gap, two measurements.
    claims: [
      { says: 'only the measurement changes', shown: true as const },
      {
        says: 'Every Garamond glyph here advances less than',
        test: 'test/explain-font-metrics.test.ts: every Garamond glyph in the phrase advances less than a JetBrains Mono cell',
      },
    ],
    checks: [
      {
        question:
          'Reverse the opening’s mistake: measure “Ink on paper” in EB Garamond, draw it in JetBrains Mono, and put the marker 0.5 units after the measured width. Where does the marker land?',
        answer:
          'On the words. It goes 4.41 + 0.5 = 4.91 units from the start, but the JetBrains Mono phrase runs to 6.48, so the marker sits about 1.57 units before the phrase ends.',
      },
      {
        question:
          'A layout measures the phrase in Regular and puts a marker 0.5 units after it, but the phrase is drawn in Bold. What happens to the gap?',
        answer:
          'It shrinks from 0.5 to 0.06 units: Bold advances 0.44 further than Regular at size 0.9, so the marker nearly touches the words.',
      },
      {
        question: 'Add a trailing space, “Ink on paper ”. No ink changes. Does the marker move?',
        answer:
          'Yes. The space has an advance, so the measured width grows by that advance, and the marker, placed after the width, moves right by the same amount.',
      },
      {
        question: 'In some other diagram, a box reads “stretched ×1.000”. What does that say about how its word was measured?',
        answer:
          'Its recorded width equals the drawn word’s own advance: the layout measured the face, cut and size the renderer drew, or a face that happens to give that word the same advance.',
      },
    ],
  };
  static settings = [
    {
      id: 'widths',
      label: 'Diagram widths',
      default: 'natural',
      options: [
        { value: 'natural', label: 'Measured in EB Garamond' },
        { value: 'recorded', label: 'Inter estimates' },
      ],
    },
  ];

  override async construct() {
    const widths = settingsOf(this).widths as Widths;
    const s = stage(this, { headingSize: 0.6, style: 'pen-and-ink' });
    const color = s.palette.ink;
    const wrong = this.text(SAMPLE, { font: 'mono', fontSize: 0.9 }).advance(),
      actual = this.text(SAMPLE, { fontSize: 0.9 }).advance();

    // 1. The failure: the marker goes where the measured width ends, and the wrong face is measured.
    await this.step('layout', {
      title: `Measure the wrong face and the marker lands ${(wrong - actual).toFixed(2)} units too far`,
      line: `Same phrase, size and ${GAP}-unit gap; only the measurement changes.`,
      caption: `Both rows draw “${SAMPLE}” in EB Garamond. Each marker adds the same ${GAP}-unit gap, but the upper row placed it using JetBrains Mono’s ${wrong.toFixed(2)}-unit measurement rather than Garamond’s ${actual.toFixed(2)}. That puts it ${(wrong - actual).toFixed(2)} units too far right. Where does the phrase’s width come from?`,
    });
    const comparison = new Group();
    comparison.key = 'font-layout';
    for (const [i, name] of [`Measured as Mono: ${wrong.toFixed(2)}`, `Measured as Garamond: ${actual.toFixed(2)}`].entries()) {
      const y = 1.4 - i * 3.0;
      const word = this.text(SAMPLE, { fontSize: 0.9, color }).moveTo([-5.3, y], [-1, 0]);
      const width = i === 0 ? wrong : word.advance();
      comparison.add(
        word,
        new Circle({ radius: 0.22, fill: s.emphasis, stroke: 'none' }).moveTo([-5.3 + width + GAP, y]),
        this.text(name, { fontSize: 0.7, color }).moveTo([-5.3, y + 1.1], [-1, 0]),
      );
    }
    this.state.layout = { wrong, actual };
    s.reading(comparison);
    await s.enter(comparison);

    // 2. The answer: a phrase's width is the sum of its glyphs' advances, which belong to the face.
    // The lower row of the opening again, at its size: the ruler's total is the 4.41 the marker used.
    const ruled = this.text(SAMPLE, { fontSize: 0.9, color }).moveTo([0, 1.0]);
    const run = ruled.shapeRun(SAMPLE, 0.9);
    const spaces = run.glyphs.filter((g) => SAMPLE[g.cluster] === ' ');
    await this.step('advance', {
      title: 'A phrase’s width is the sum of its glyphs’ advances',
      line: `Ticks: where each glyph hands the pen to the next. Dashed: the ${spaces.length} spaces.`,
      caption: `Each glyph moves the pen on by its advance, and the next glyph starts where the pen stopped. The dashed cells are spaces, which move the pen without drawing anything. The ruler adds up all ${run.glyphs.length} advances, which is how the lower row placed its marker. Measure the face you draw: each face and cut gives the same text its own advances.`,
    });
    await s.clear();
    await s.enter(ruled);
    const [x0, y0, , y1] = ruled.box()!;
    const ticks = new Group();
    for (const g of run.glyphs.slice(1))
      ticks.add(new Line([x0 + g.x, y0 - 0.08], [x0 + g.x, y0 - 0.3], { stroke: s.emphasis, strokeWidth: 0.02 }));
    for (const g of spaces) {
      const cell = new Rectangle({ width: g.ax, height: y1 - y0, fill: 'none', stroke: s.emphasis, strokeWidth: 0.02 }).moveTo([
        x0 + g.x + g.ax / 2,
        (y0 + y1) / 2,
      ]);
      cell.style.dashArray = '0.08 0.06';
      ticks.add(cell);
    }
    s.keep(ticks, {
      describe: `A tick under “${SAMPLE}” at each of its ${run.glyphs.length - 1} pen positions, and dashed cells around its ${spaces.length} spaces`,
    });
    await this.play(new Create(ticks, { runTime: 0.8, lagRatio: 0 }));
    await s.dimension([x0, y0 - 0.5], [x0 + ruled.advance(), y0 - 0.5], `${ruled.advance().toFixed(2)} units`, {
      size: 0.7,
      offset: -0.4,
    });
    s.reading(ruled, ticks);
    this.state.advance = ruled.advance();

    // 3. The opening's upper row again, with both measurements under it, pen stop by pen stop: the marker's
    // position came from JetBrains Mono's advances, which belong to glyphs that were never drawn.
    const monoRun = this.text(SAMPLE, { font: 'mono', fontSize: 0.9 }).shapeRun(SAMPLE, 0.9);
    const stopsOf = (r: typeof run) => [...r.glyphs.map((g) => g.x), r.glyphs.at(-1)!.x + r.glyphs.at(-1)!.ax];
    const drawnStops = stopsOf(run),
      measuredStops = stopsOf(monoRun);
    const drawnEnd = drawnStops.at(-1)!,
      measuredEnd = measuredStops.at(-1)!;
    await this.step('rulers', {
      title: 'The upper marker went 0.5 past a JetBrains Mono ruler',
      line: 'Upper ticks: Garamond’s advances, as drawn. Lower: JetBrains Mono’s, as measured.',
      caption: `This is the opening’s upper row, with both measurements laid under the words from the same start. Each slanted line joins a Garamond pen stop to the same stop in JetBrains Mono. Every Garamond glyph here advances less than Mono’s ${monoRun.glyphs[0]!.ax.toFixed(2)}, so the lines lean further apart at each glyph and the rulers end ${(measuredEnd - drawnEnd).toFixed(2)} units apart. The filled marker sits ${GAP} past the Mono ruler’s end, as the layout placed it. The ring sits ${GAP} past the Garamond ruler’s end, where the lower row put its marker.`,
    });
    await s.clear();
    const start = -5.3,
      top = 1.4;
    const upper = this.text(SAMPLE, { fontSize: 0.9, color }).moveTo([start, top], [-1, 0]);
    const yDrawn = upper.box()![1] - 0.12,
      yMeasured = yDrawn - 2.2;
    const tick = (x: number, y: number) => new Line([start + x, y], [start + x, y - 0.3], { stroke: s.emphasis, strokeWidth: 0.025 });
    const drawnRuler = new Group(
      new Line([start, yDrawn], [start + drawnEnd, yDrawn], { stroke: s.emphasis, strokeWidth: 0.025 }),
      ...drawnStops.map((x) => tick(x, yDrawn)),
    );
    const measuredRuler = new Group(
      new Line([start, yMeasured], [start + measuredEnd, yMeasured], { stroke: s.emphasis, strokeWidth: 0.025 }),
      ...measuredStops.map((x) => tick(x, yMeasured + 0.3)),
    );
    const links = new Group(
      ...drawnStops.map(
        (x, i) => new Line([start + x, yDrawn - 0.34], [start + measuredStops[i]!, yMeasured + 0.34], { stroke: s.soft, strokeWidth: 0.015 }),
      ),
    );
    drawnRuler.key = 'font-rulers-drawn';
    measuredRuler.key = 'font-rulers-measured';
    const marker = new Circle({ radius: 0.22, fill: s.emphasis, stroke: 'none' }).moveTo([start + measuredEnd + GAP, top]);
    const ring = new Circle({ radius: 0.22, fill: 'none', stroke: s.emphasis, strokeWidth: 0.04 }).moveTo([start + drawnEnd + GAP, top]);
    // Each ruler's name and total to the right of the fan, level with its ruler.
    const nameX = start + measuredEnd + 0.4;
    const names = new Group(
      this.text(`Garamond: ${drawnEnd.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yDrawn - 0.15], [-1, 0]),
      this.text(`JetBrains Mono: ${measuredEnd.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yMeasured - 0.15], [-1, 0]),
    );
    // A dashed guide up from the Mono ruler's end to the words' row, the gap to the left of the filled marker.
    // The Garamond ruler ends under the last letter, so the ring needs none.
    const guides = new Line([start + measuredEnd, yMeasured], [start + measuredEnd, top], { stroke: s.soft, strokeWidth: 0.015 });
    guides.style.dashArray = '0.08 0.06';
    await s.enter(upper, marker, {
      runTime: 0.4,
      describe: `“${SAMPLE}” in Garamond, as in the opening’s upper row, with its filled marker ${(measuredEnd + GAP).toFixed(2)} units from the start`,
    });
    s.keep(drawnRuler, measuredRuler, links, guides, ring, names, {
      describe: `Under “${SAMPLE}”, two rulers from the same start: Garamond’s ${run.glyphs.length} advances, ending at ${drawnEnd.toFixed(2)}, and JetBrains Mono’s, ending at ${measuredEnd.toFixed(2)}; thin lines join matching pen stops and spread apart glyph by glyph. A filled marker ${GAP} past the Mono ruler’s end, a ring ${GAP} past Garamond’s`,
    });
    await this.play(new Create(drawnRuler, { runTime: 0.6, lagRatio: 0 }), new Create(measuredRuler, { runTime: 0.6, lagRatio: 0 }));
    await this.play(new Create(links, { runTime: 0.8, lagRatio: 0.1 }), new Create(guides, { runTime: 0.5, lagRatio: 0 }), new Create(ring, { runTime: 0.5 }), new Create(names, { runTime: 0.5, lagRatio: 0 }));
    s.reading(upper, drawnRuler, measuredRuler, marker, ring, names);
    this.state.rulers = {
      drawn: drawnStops,
      measured: measuredStops,
      markers: { drawn: drawnEnd + GAP, measured: measuredEnd + GAP },
    };

    // 4. Within one family, every cut is its own face.
    const cuts = ['Regular', 'Bold', 'Italic'].map((cut) => ({
      cut,
      word:
        cut === 'Italic'
          ? new ItalicText(SAMPLE, { fontSize: 0.9, color, shaping: this.textShaping })
          : this.text(SAMPLE, { fontSize: 0.9, color, weight: cut === 'Bold' ? 'bold' : 'normal' }),
    }));
    const advances: Record<string, number> = Object.fromEntries(cuts.map(({ cut, word }) => [cut, word.advance()]));
    await this.step('cuts', {
      title: 'Bold and italic are faces of their own, with their own advances',
      line: 'Same text, size 0.9: three cuts, three widths.',
      caption: 'Regular, Bold and Italic supply different glyphs and metrics. Bold here advances farther than Regular, so a marker placed using Regular’s measurement would leave less room after the bold words. The cut must agree between measurement and drawing, just as the font family must.',
    });
    await s.clear();
    const rows = new Group();
    for (const [index, { cut, word }] of cuts.entries()) {
      const y = 2.0 - index * 2.0;
      word.moveTo([0, y]);
      rows.add(
        this.text(cut, { fontSize: 0.7, color }).moveTo([-5.6, y]),
        word,
        this.text(word.advance().toFixed(2), { fontSize: 0.7, color }).moveTo([5.2, y]),
      );
    }
    this.state.advances = advances;
    s.reading(rows);
    await s.enter(rows, {
      describe: () =>
        `The same words in three EB Garamond cuts: ${Object.entries(advances)
          .map(([cut, advance]) => `${cut}, advance ${advance.toFixed(2)}`)
          .join('; ')}. Each cut was requested and captured from its own source font.`,
    });

    // 5. The same rule for a diagram: its boxes come from whichever widths the layout measured.
    await this.step('diagram', {
      title:
        widths === 'natural'
          ? 'Measured in EB Garamond first, each box fits its word'
          : 'Laid out from Inter estimates, the Garamond words are stretched',
      line:
        widths === 'natural'
          ? 'Under each box: how far its word was stretched to fit. Here, not at all.'
          : 'Under each box: how far its word was stretched to fit the width Inter would need.',
      caption: widths === 'natural' ? 'Rayner measures Ink and Paper in EB Garamond before the layout sizes their boxes. Both words keep their natural proportions, so both stretch factors are ×1.000. If the layout had used Inter’s estimates instead, would both words stretch by the same factor?' : 'The layout used Inter estimates, then the renderer fitted the Garamond words to those recorded widths. Each factor is a word’s recorded width over its own Garamond advance, and Paper’s is larger than Ink’s, so no single scale turns Inter widths into Garamond ones. This is the misplaced marker’s problem again: one face was measured and another drawn.',
    });
    await s.clear();
    const d = await s.show(widths === 'natural' ? { source: DIAGRAM, lettering: 'natural' } : { source: DIAGRAM });
    const stretch: Record<string, number> = {},
      annotations: Group[] = [];
    for (const [id, text] of [
      ['A', 'Ink'],
      ['B', 'Paper'],
    ] as const) {
      const run = d.snapshot.parts.flatMap((p) => p.shapes).find((sh) => sh.textRun?.text === text)!.textRun!;
      const natural = this.text(text, { fontSize: run.size }).advance();
      stretch[text] = (run.width ?? natural) / natural;
      annotations.push(await d.note(id, `stretched ×${stretch[text]!.toFixed(3)}`, { side: 'below', color: s.emphasis, size: 0.66 }));
    }
    s.reading(d.get('A'), d.get('B'), d.get('edge:A->B#0'), ...annotations);
    this.state.stretch = stretch;
  }
}
