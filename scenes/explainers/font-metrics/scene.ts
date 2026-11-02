import { Scene, ItalicText, Group, Circle } from '../../../src/index.ts';
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
    checks: [
      {
        question: 'In the first step, why does the upper marker sit 2.07 units further right than the lower one?',
        answer:
          'It was placed after JetBrains Mono’s width for the phrase, 6.48 units, but the words are drawn in EB Garamond, which advances 4.41 at the same size; 6.48 − 4.41 = 2.07.',
      },
      {
        question: 'At size 0.9, which EB Garamond cut makes “Ink on paper” widest, and by how much more than Regular?',
        answer: 'Bold: 4.85 units against Regular’s 4.41, 0.44 more. Italic is the narrowest, at 4.24.',
      },
      {
        question:
          'A layout measures the phrase in Regular and puts a marker 0.5 units after it, but the phrase is drawn in Bold. What happens to the gap?',
        answer:
          'It shrinks from 0.5 to 0.06 units: Bold advances 0.44 further than Regular at size 0.9, so the marker nearly touches the words.',
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
      caption: `Both rows draw “${SAMPLE}” in EB Garamond. Each marker adds the same ${GAP}-unit gap, but the upper row placed it using Mono’s ${wrong.toFixed(2)}-unit measurement rather than Garamond’s ${actual.toFixed(2)}. That puts it ${(wrong - actual).toFixed(2)} units too far right. Where does the phrase’s width come from?`,
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
    const ruled = this.text(SAMPLE, { fontSize: 1.2, color }).moveTo([0, 0.8]);
    await this.step('advance', {
      title: 'A phrase’s width is the sum of its glyphs’ advances',
      line: 'The ruler ends after the final glyph’s advance, not at its ink.',
      caption: `Each glyph advances the pen to the next starting point; spaces contribute movement without ink. The ruler sums those advances, ending where another glyph would begin rather than at the last ink. Measure the face you draw: each face and cut gives the same text its own advances.`,
    });
    await s.clear();
    await s.enter(ruled);
    const start = ruled.anchorPoint()[0] - ruled.advance() / 2;
    await s.dimension([start, -0.4], [start + ruled.advance(), -0.4], `${ruled.advance().toFixed(2)} units`, {
      size: 0.7,
      offset: -0.4,
    });
    this.state.advance = ruled.advance();

    // 3. Within one family, every cut is its own face.
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

    // 4. The same rule for a diagram: its boxes come from whichever widths the layout measured.
    await this.step('diagram', {
      title:
        widths === 'natural'
          ? 'Measured in EB Garamond first, each box fits its word'
          : 'Laid out from Inter estimates, the Garamond words are stretched',
      line:
        widths === 'natural'
          ? 'Under each box: how far its word was stretched to fit. Here, not at all.'
          : 'Under each box: how far its word was stretched to fit the width Inter would need.',
      caption: widths === 'natural' ? 'Rayner measures Ink and Paper in EB Garamond before the layout sizes their boxes. Both words keep their natural proportions, so both stretch factors are ×1.000. Change the setting to compare a layout measured for another face.' : 'The layout used Inter estimates, then the renderer fitted Garamond to those recorded widths. Paper needs more stretching than Ink because the width disagreement differs between words. This is the misplaced marker’s problem again: one face was measured and another drawn.',
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
