import { Scene, ItalicText, Group, Circle, Line, Rectangle, view } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { staged } from '../lib/staged.ts';

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
    /** The phrase in EB Garamond at the rows' size, drawn afresh for each picture. */
    const phrase = () => this.text(SAMPLE, { fontSize: 0.9, color });
    const run = phrase().shapeRun(SAMPLE, 0.9);
    const spaces = run.glyphs.filter((g) => SAMPLE[g.cluster] === ' ');
    const monoRun = this.text(SAMPLE, { font: 'mono', fontSize: 0.9 }).shapeRun(SAMPLE, 0.9);
    const stopsOf = (r: typeof run) => [...r.glyphs.map((g) => g.x), r.glyphs.at(-1)!.x + r.glyphs.at(-1)!.ax];

    // Each step's picture is drawn from the measurements its state records, and check redraws it from them.
    // 1. The failure: the marker goes where the measured width ends, and the wrong face is measured.
    const layout = {
      layout: { wrong: this.text(SAMPLE, { font: 'mono', fontSize: 0.9 }).advance(), actual: this.text(SAMPLE, { fontSize: 0.9 }).advance() },
    };
    // 2. The answer: a phrase's width is the sum of its glyphs' advances, which belong to the face. The
    // lower row of the opening again, at its size: the ruler's total is the 4.41 the marker used. `pen`:
    // where each glyph starts, and each space's start and advance, which the ticks and dashed cells mark.
    const advance = {
      ...layout,
      advance: phrase().advance(),
      pen: { starts: run.glyphs.map((g) => g.x), spaces: spaces.map((g) => ({ x: g.x, advance: g.ax })) },
    };
    // 3. The opening's upper row again, with both measurements under it, pen stop by pen stop: the marker's
    // position came from JetBrains Mono's advances, which belong to glyphs that were never drawn.
    const drawnStops = stopsOf(run),
      measuredStops = stopsOf(monoRun);
    const rulers = {
      ...advance,
      rulers: {
        drawn: drawnStops,
        measured: measuredStops,
        markers: { drawn: drawnStops.at(-1)! + GAP, measured: measuredStops.at(-1)! + GAP },
      },
    };
    const { wrong, actual } = layout.layout;
    const measuredEnd = rulers.rulers.measured.at(-1)!,
      drawnEnd = rulers.rulers.drawn.at(-1)!;
    const START = -5.3,
      TOP = 1.4;
    await s.steps([
      staged({
        id: 'layout',
        title: `Measure the wrong face and the marker lands ${(wrong - actual).toFixed(2)} units too far`,
        line: `Same phrase, size and ${GAP}-unit gap; only the measurement changes.`,
        caption: `Both rows draw “${SAMPLE}” in EB Garamond. Each marker adds the same ${GAP}-unit gap, but the upper row placed it using JetBrains Mono’s ${wrong.toFixed(2)}-unit measurement rather than Garamond’s ${actual.toFixed(2)}. That puts it ${(wrong - actual).toFixed(2)} units too far right. Where does the phrase’s width come from?`,
        state: layout,
        draw: (st) => {
          const comparison = new Group();
          comparison.key = 'font-layout';
          const rows = [
            [`Measured as Mono: ${st.layout.wrong.toFixed(2)}`, st.layout.wrong],
            [`Measured as Garamond: ${st.layout.actual.toFixed(2)}`, st.layout.actual],
          ] as const;
          for (const [i, [name, width]] of rows.entries()) {
            const y = 1.4 - i * 3.0;
            comparison.add(
              phrase().moveTo([START, y], [-1, 0]),
              new Circle({ radius: 0.22, fill: s.emphasis, stroke: 'none' }).moveTo([START + width + GAP, y]),
              this.text(name, { fontSize: 0.7, color }).moveTo([START, y + 1.1], [-1, 0]),
            );
          }
          return comparison;
        },
      }),
      staged({
        id: 'advance',
        title: 'A phrase’s width is the sum of its glyphs’ advances',
        line: `Ticks: where each glyph hands the pen to the next. Dashed: the ${advance.pen.spaces.length} spaces.`,
        caption: `Each glyph moves the pen on by its advance, and the next glyph starts where the pen stopped. The dashed cells are spaces, which move the pen without drawing anything. The ruler adds up all ${advance.pen.starts.length} advances, which is how the lower row placed its marker. Measure the face you draw: each face and cut gives the same text its own advances.`,
        state: advance,
        draw: (st) => {
          const ruled = phrase().moveTo([0, 1.0]);
          const [x0, y0, , y1] = ruled.box()!;
          const ticks = new Group();
          for (const x of st.pen.starts.slice(1))
            ticks.add(new Line([x0 + x, y0 - 0.08], [x0 + x, y0 - 0.3], { stroke: s.emphasis, strokeWidth: 0.02 }));
          for (const g of st.pen.spaces) {
            const cell = new Rectangle({ width: g.advance, height: y1 - y0, fill: 'none', stroke: s.emphasis, strokeWidth: 0.02 }).moveTo([
              x0 + g.x + g.advance / 2,
              (y0 + y1) / 2,
            ]);
            cell.style.dashArray = '0.08 0.06';
            ticks.add(cell);
          }
          return new Group(ruled, ticks);
        },
      }),
    ]);
    // The ruler's total under the phrase. The stage draws a dimension itself, so it joins the step's
    // picture here, from the width the step's state records.
    {
      const [x0, y0] = phrase().moveTo([0, 1.0]).box()!;
      const width = (this.state as typeof advance).advance;
      await s.dimension([x0, y0 - 0.5], [x0 + width, y0 - 0.5], `${width.toFixed(2)} units`, {
        size: 0.7,
        offset: -0.4,
      });
    }
    await s.steps([
      staged({
        id: 'rulers',
        title: 'The upper marker went 0.5 past a JetBrains Mono ruler',
        line: 'Upper ticks: Garamond’s advances, as drawn. Lower: JetBrains Mono’s, as measured.',
        caption: `This is the opening’s upper row, with both measurements laid under the words from the same start. Each slanted line joins a Garamond pen stop to the same stop in JetBrains Mono. Every Garamond glyph here advances less than Mono’s ${monoRun.glyphs[0]!.ax.toFixed(2)}, so the lines lean further apart at each glyph and the rulers end ${(measuredEnd - drawnEnd).toFixed(2)} units apart. The filled marker sits ${GAP} past the Mono ruler’s end, as the layout placed it. The ring sits ${GAP} past the Garamond ruler’s end, where the lower row put its marker.`,
        state: rulers,
        draw: (st) => {
          const { drawn, measured, markers } = st.rulers;
          const upper = phrase().moveTo([START, TOP], [-1, 0]);
          const yDrawn = upper.box()![1] - 0.12,
            yMeasured = yDrawn - 2.2;
          const tick = (x: number, y: number) => new Line([START + x, y], [START + x, y - 0.3], { stroke: s.emphasis, strokeWidth: 0.025 });
          const drawnRuler = new Group(
            new Line([START, yDrawn], [START + drawn.at(-1)!, yDrawn], { stroke: s.emphasis, strokeWidth: 0.025 }),
            ...drawn.map((x) => tick(x, yDrawn)),
          );
          const measuredRuler = new Group(
            new Line([START, yMeasured], [START + measured.at(-1)!, yMeasured], { stroke: s.emphasis, strokeWidth: 0.025 }),
            ...measured.map((x) => tick(x, yMeasured + 0.3)),
          );
          const links = new Group(
            ...drawn.map(
              (x, i) => new Line([START + x, yDrawn - 0.34], [START + measured[i]!, yMeasured + 0.34], { stroke: s.soft, strokeWidth: 0.015 }),
            ),
          );
          drawnRuler.key = 'font-rulers-drawn';
          measuredRuler.key = 'font-rulers-measured';
          // Each marker sits its gap past its ruler's end, where the state records it.
          const marker = new Circle({ radius: 0.22, fill: s.emphasis, stroke: 'none' }).moveTo([START + markers.measured, TOP]);
          const ring = new Circle({ radius: 0.22, fill: 'none', stroke: s.emphasis, strokeWidth: 0.04 }).moveTo([START + markers.drawn, TOP]);
          // Each ruler's name and total to the right of the fan, level with its ruler.
          const nameX = START + measured.at(-1)! + 0.4;
          const names = new Group(
            this.text(`Garamond: ${drawn.at(-1)!.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yDrawn - 0.15], [-1, 0]),
            this.text(`JetBrains Mono: ${measured.at(-1)!.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yMeasured - 0.15], [-1, 0]),
          );
          // A dashed guide up from the Mono ruler's end to the words' row, the gap to the left of the filled marker.
          // The Garamond ruler ends under the last letter, so the ring needs none.
          const guides = new Line([START + measured.at(-1)!, yMeasured], [START + measured.at(-1)!, TOP], { stroke: s.soft, strokeWidth: 0.015 });
          guides.style.dashArray = '0.08 0.06';
          return new Group(upper, marker, drawnRuler, measuredRuler, links, guides, ring, names);
        },
      }),
    ]);

    // 4. Within one family, every cut is its own face. The rows are a view of the advances the state
    // records, and are described from them.
    const CUTS = ['Regular', 'Bold', 'Italic'] as const;
    const word = (cut: (typeof CUTS)[number]) =>
      cut === 'Italic'
        ? new ItalicText(SAMPLE, { fontSize: 0.9, color, shaping: this.textShaping })
        : this.text(SAMPLE, { fontSize: 0.9, color, weight: cut === 'Bold' ? 'bold' : 'normal' });
    await this.step('cuts', {
      title: 'Bold and italic are faces of their own, with their own advances',
      line: 'Same text, size 0.9: three cuts, three widths.',
      caption: 'Regular, Bold and Italic supply different glyphs and metrics. Bold here advances farther than Regular, so a marker placed using Regular’s measurement would leave less room after the bold words. The cut must agree between measurement and drawing, just as the font family must.',
    });
    await s.clear();
    this.state = { ...rulers, advances: Object.fromEntries(CUTS.map((cut) => [cut, word(cut).advance()])) };
    const advances = () => this.state.advances as Record<string, number>;
    const rows = view(
      this,
      (st) => {
        const g = new Group();
        for (const [index, cut] of CUTS.entries()) {
          const y = 2.0 - index * 2.0;
          g.add(
            this.text(cut, { fontSize: 0.7, color }).moveTo([-5.6, y]),
            word(cut).moveTo([0, y]),
            this.text((st.advances as Record<string, number>)[cut]!.toFixed(2), { fontSize: 0.7, color }).moveTo([5.2, y]),
          );
        }
        return g;
      },
      { place: false },
    );
    s.opening(rows);
    await s.enter(rows, {
      describe: () =>
        `The same words in three EB Garamond cuts: ${Object.entries(advances())
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
    // Each word's stretch, from the width the captured layout recorded for it, goes into the state
    // first, and the notes say what the state holds. A note is placed by the diagram itself, so it is
    // added here rather than drawn by a view.
    const WORDS = [
      ['A', 'Ink'],
      ['B', 'Paper'],
    ] as const;
    this.state.stretch = Object.fromEntries(
      WORDS.map(([, text]) => {
        const run = d.snapshot.parts.flatMap((p) => p.shapes).find((sh) => sh.textRun?.text === text)!.textRun!;
        const natural = this.text(text, { fontSize: run.size }).advance();
        return [text, (run.width ?? natural) / natural];
      }),
    );
    const stretch = this.state.stretch as Record<string, number>,
      annotations: Group[] = [];
    for (const [id, text] of WORDS)
      annotations.push(await d.note(id, `stretched ×${stretch[text]!.toFixed(3)}`, { side: 'below', color: s.emphasis, size: 0.66 }));
    s.opening(d.get('A'), d.get('B'), d.get('edge:A->B#0'), ...annotations);
  }
}
