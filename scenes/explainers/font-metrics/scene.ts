import { Scene, ItalicText, Group, view } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { stagedStep } from '../../../explain/index.ts';
import { SAMPLE, GAP, drawLayout, drawAdvance, drawRulers, drawCuts } from './picture.ts';
import type { Pen } from './picture.ts';

// This page tests one phrase, three EB Garamond cuts (Regular, Bold and Italic outlines, captured and
// bundled) and two diagram labels; it does not compare other fonts. The diagram deliberately compares
// natural EB Garamond measurements with recorded Inter estimates, so its stretch factors describe these two
// labels, not a general conversion between the fonts.
const DIAGRAM = 'graph LR\nA["Ink"] --> B["Paper"]';
type Widths = 'natural' | 'recorded';

// The title, answer and check questions come from script.md's intent header.
export default class FontMetrics extends Scene {
  static meta = {
    id: 'font-metrics',
    sources: ['https://github.com/googlefonts/ebgaramond'],
    textContext: 'explicit' as const,
    lettering: { faces: { sans: 'eb-garamond' }, styles: ['bold', 'italic'] as const },
    // The opening's line speaks of its own two drawn rows: same words, size and gap, two measurements.
    claims: [
      { says: 'only the measurement changes', shown: true as const },
      {
        says: 'Every Garamond glyph here advances less than',
        test: 'test/explain-font-metrics.test.ts: every Garamond glyph in the phrase advances less than a JetBrains Mono cell',
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
    const pen: Pen = { stage: s, text: (value, opts) => this.text(value, opts), phrase, color };
    await s.steps([
      stagedStep({
        id: 'layout',
        title: `Measure the wrong face and the marker lands ${(wrong - actual).toFixed(2)} units too far`,
        line: `Same phrase, size and ${GAP}-unit gap; only the measurement changes.`,
        caption: `Both rows draw “${SAMPLE}” in EB Garamond. Each marker adds the same ${GAP}-unit gap, but the upper row placed it using JetBrains Mono’s ${wrong.toFixed(2)}-unit measurement rather than Garamond’s ${actual.toFixed(2)}. That puts it ${(wrong - actual).toFixed(2)} units too far right. Where does the phrase’s width come from?`,
        state: layout,
        draw: (st) => drawLayout(st, pen),
      }),
      stagedStep({
        id: 'advance',
        title: 'A phrase’s width is the sum of its glyphs’ advances',
        line: `Ticks: where each glyph hands the pen to the next. Dashed: the ${advance.pen.spaces.length} spaces.`,
        caption: `Each glyph moves the pen on by its advance, and the next glyph starts where the pen stopped. The dashed cells are spaces, which move the pen without drawing anything. The ruler adds up all ${advance.pen.starts.length} advances, which is how the lower row placed its marker. Measure the face you draw: each face and cut gives the same text its own advances.`,
        state: advance,
        describe: (st) => `A tick under “${SAMPLE}” at each of its ${st.pen.starts.length - 1} pen positions, and dashed cells around its ${st.pen.spaces.length} spaces`,
        draw: (st) => drawAdvance(st, pen),
      }),
      stagedStep({
        id: 'rulers',
        title: 'The upper marker went 0.5 past a JetBrains Mono ruler',
        line: 'Upper ticks: Garamond’s advances, as drawn. Lower: JetBrains Mono’s, as measured.',
        caption: `This is the opening’s upper row, with both measurements laid under the words from the same start. Each slanted line joins a Garamond pen stop to the same stop in JetBrains Mono. Every Garamond glyph here advances less than Mono’s ${monoRun.glyphs[0]!.ax.toFixed(2)}, so the lines lean further apart at each glyph and the rulers end ${(measuredEnd - drawnEnd).toFixed(2)} units apart. The filled marker sits ${GAP} past the Mono ruler’s end, as the layout placed it. The ring sits ${GAP} past the Garamond ruler’s end, where the lower row put its marker.`,
        state: rulers,
        describe: (st) => {
          const { drawn, measured, markers } = st.rulers;
          return `“${SAMPLE}” in Garamond, as in the opening’s upper row, with its filled marker ${markers.measured.toFixed(2)} units from the start. Under it, two rulers from the same start: Garamond’s ${drawn.length - 1} advances, ending at ${drawn.at(-1)!.toFixed(2)}, and JetBrains Mono’s, ending at ${measured.at(-1)!.toFixed(2)}; thin lines join matching pen stops and spread apart glyph by glyph. A filled marker ${(markers.measured - measured.at(-1)!).toFixed(1)} past the Mono ruler’s end, a ring ${(markers.drawn - drawn.at(-1)!).toFixed(1)} past Garamond’s`;
        },
        draw: (st) => drawRulers(st, pen),
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
    const rows = view(this, (st) => drawCuts(st, CUTS, word, pen), { place: false });
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
