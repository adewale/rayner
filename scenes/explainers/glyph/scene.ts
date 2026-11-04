import { frames as readerFrames } from '../lib/readers/glyph.ts';
import {
  Scene,
  Text,
  Write,
  Create,
  FadeIn,
  TransformMatchingShapes,
  Group,
  Line,
  Dot,
  Underline,
  SurroundingRectangle,
  BraceLabel,
  DOWN,
  shaperFor,
} from '../../../src/index.ts';
import type { Mobject, Vec, MatchSummary, FontName } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';

const WORD = 'Hello, outlines';
const SIZE = 0.9; // the size the fidelity test measures
const SMALL = 0.6; // the smaller copy in the letterforms step
// The heading at 0.54 units is 12 px on a 390 px phone, whose stage is 358 px wide. The first step's
// close-up frames the large lettering it writes, which needs no enlarging, so the heading above it is
// read at its own size there; at the stage's default 0.36 it would be 8 px.
const HEADING = 0.54;
const STYLE = 'pen-and-ink';
const NAME: Record<FontName, string> = { sans: 'Inter', mono: 'JetBrains Mono' };
/** A diagram whose labels the renderer draws in Inter, in both cases. */
const PIPELINE =
  `graph TB\nFont[Inter] --> Shape[Shape text]\nShape --> Paths[Cubic paths]\nPaths --> SVG[SVG player]\nPaths --> PNG[PNG stills]`;

type Pathed = Mobject & { subpaths: Float32Array[] };
const segmentsOf = (g: Mobject) => (g as Pathed).subpaths.reduce((n, a) => n + (a.length - 2) / 6, 0);
const contoursOf = (g: Mobject) => (g as Pathed).subpaths.length;
/** The character a glyph of `t` draws. */
const charOf = (t: Text, g: Mobject) => t.text[(g as unknown as { cluster: number }).cluster]!;

/** What the shaper hands back for a run: segment kinds and per-glyph advances. */
function shape(font: FontName, text: string) {
  const run = shaperFor(font)(text, SIZE);
  const tags: Record<string, number> = {};
  for (const g of run.glyphs) for (const s of g.path ?? []) tags[s.tag] = (tags[s.tag] ?? 0) + 1;
  return {
    width: run.width,
    stops: run.glyphs.map((g) => g.x),
    advances: run.glyphs.map((g) => g.ax),
    chars: run.glyphs.map((g) => text[g.cluster]!),
    quads: tags.QuadTo ?? 0,
    lines: tags.LineTo ?? 0,
    cubics: tags.CubicTo ?? 0,
  };
}

/** A width ruler under a text: a tick at every glyph's pen position, and a brace labelled with the measured width. */
function ruler(text: Text, stops: readonly number[], label: string, color: string, size = 0.24): Group {
  const [x0, y0] = text.box()!;
  const y = y0 - 0.12;
  const g = new Group();
  for (const x of stops.slice(1))
    g.add(new Line([x0 + x, y], [x0 + x, y - 0.14], { stroke: color, strokeWidth: 0.014 }));
  // The brace spans the text's advance box: the width the shaper measured.
  const brace = new BraceLabel(text, label, DOWN, { fontSize: size, color, buff: 0.3, labelBuff: 0.1 });
  brace.brace.setStroke(color, 0.022);
  g.add(brace);
  return g;
}

/** A glyph's control net: on-curve points, cubic handles and the lines between them. */
function controlNet(glyph: Mobject, on: string, off: string): Group {
  const net = new Group();
  for (const a of (glyph as Pathed).subpaths)
    for (let i = 0; i + 7 < a.length; i += 6) {
      const p0: Vec = [a[i]!, a[i + 1]!],
        c1: Vec = [a[i + 2]!, a[i + 3]!],
        c2: Vec = [a[i + 4]!, a[i + 5]!],
        p1: Vec = [a[i + 6]!, a[i + 7]!];
      net.add(
        new Line(p0, c1, { stroke: off, strokeWidth: 0.008 }),
        new Line(c2, p1, { stroke: off, strokeWidth: 0.008 }),
        new Dot({ radius: 0.024, color: off }).moveTo(c1),
        new Dot({ radius: 0.024, color: off }).moveTo(c2),
        new Dot({ radius: 0.042, color: on }).moveTo(p0),
      );
    }
  return net;
}

/** One glyph's outline as a plain path (no text box), its ink centred on `at`. */
function glyphAlone(font: FontName, ch: string, size: number, at: Vec): Pathed {
  const t = new Text(ch, { font, fontSize: size });
  const g = t.children[0]!;
  t.remove(g);
  g.moveTo(at);
  return g as Pathed;
}

/** Thin lines from each source glyph (as `ghost` shows it) to the glyph it was paired with. */
function pairLines(pairs: Array<[Mobject, Mobject]>, ghostOf: (m: Mobject) => Mobject, color: string): Group {
  const g = new Group();
  for (const [a, b] of pairs) {
    const p = ghostOf(a).box()!,
      q = b.box()!;
    g.add(
      new Line([(p[0] + p[2]) / 2, p[1] - 0.1], [(q[0] + q[2]) / 2, q[3] + 0.1], { stroke: color, strokeWidth: 0.012 }),
    );
  }
  return g;
}

export default class GlyphExplainer extends Scene {
  static meta = {
    id: 'glyph',
    title: 'Why does the same text take different space?',
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/src/text.ts'],
    // The script's answer and check questions (script.md); check holds a step (measure) to stating the answer.
    answer: 'Width is the sum of the glyphs’ advances, and each font sets its own',
    claims: [
      {
        says: 'Inter gives each l and i only 0.218',
        test: 'test/explain-glyph.test.ts: Inter gives l and i its narrowest advance',
      },
      {
        says: 'Only the H is wider in Inter',
        test: 'test/explain-glyph.test.ts: only the H is wider than JetBrains Mono’s cell',
      },
      { says: 'Every glyph pairs with its 60% copy; with the other font, none do', shown: true as const },
    ],
    checks: [
      {
        question: 'A space adds no outline. Why can adding one still move the next word farther right?',
        answer:
          'A space has an advance even though it draws no ink. The pen moves by that advance before the next glyph, so the line grows without another outline.',
      },
      {
        question:
          '“illicit” and “mammoth” both have seven letters. Set each in JetBrains Mono instead of Inter: which one grows, and could the other shrink?',
        answer:
          'In JetBrains Mono both are 7 × 0.540 = 3.78 units. “illicit” is mostly thin stems that Inter gives 0.218 each, so it grows from 1.90 to 3.78. Inter gives m 0.788, more than JetBrains Mono’s cell, so “mammoth” shrinks from 4.24 to 3.78.',
      },
      {
        question: 'Could moving or uniformly resizing the Inter glyphs make them match the JetBrains Mono paths that failed to pair?',
        answer: 'No. The matcher already removes position and uniform size before comparing paths. Those operations cannot remove differences in the outlines themselves.',
      },
      {
        question: 'The label “Hello, outlines” is measured in Inter, then drawn in JetBrains Mono to fit that width. Is this label stretched or squeezed?',
        answer:
          'Squeezed: this phrase advances 8.10 units in Mono against 6.02 in Inter. The renderer presses it into the narrower recorded width. A different label needs its own measurements.',
      },
    ],
  };
  static settings = [
    {
      id: 'font',
      label: 'Embedded font',
      default: 'sans',
      options: [
        { value: 'sans', label: 'Inter' },
        { value: 'mono', label: 'JetBrains Mono' },
      ],
    },
  ];
  override async construct() {
    const font = settingsOf(this).font as FontName,
      other: FontName = font === 'sans' ? 'mono' : 'sans',
      s = stage(this, { style: STYLE, headingSize: 0.6 }),
      ink = s.palette.ink,
      hot = s.emphasis,
      soft = s.soft;
    const mine = shape(font, WORD),
      theirs = shape(other, WORD);
    const [widthFrame, shapeFrame] = readerFrames(font);
    // Measured on fresh runs: moving the drawn copy re-rounds its float32 box.
    const advance = (f: FontName) => new Text(WORD, { font: f, fontSize: SIZE }).advance();
    const runs = { [font]: mine, [other]: theirs } as Record<FontName, ReturnType<typeof shape>>;
    const sans = runs.sans,
      mono = runs.mono;
    const wideAt = sans.advances.indexOf(Math.max(...sans.advances)),
      narrowAt = sans.advances.indexOf(Math.min(...sans.advances));
    // Where the difference comes from, character by character: JetBrains Mono's advance minus Inter's.
    const gains = mono.advances.map((a, i) => a - sans.advances[i]!);
    const narrowest = sans.advances[narrowAt]!;
    const stems = sans.chars.flatMap((_, i) => (Math.abs(sans.advances[i]! - narrowest) < 1e-6 ? [i] : []));
    const narrow = gains.flatMap((g, i) => (g > 0.2 && !stems.includes(i) ? [i] : []));
    const wider = gains.flatMap((g, i) => (g < 0 ? [i] : []));
    const rest = gains.flatMap((_, i) => (stems.includes(i) || narrow.includes(i) || wider.includes(i) ? [] : [i]));
    const sum = (is: number[]) => is.reduce((n, i) => n + gains[i]!, 0);
    const spoken = (c: string) => (c === ' ' ? 'space' : c === ',' ? 'comma' : c);
    const named = (is: number[]) => is.map((i) => spoken(sans.chars[i]!)).join(', ');
    /** The same characters as a phrase: “comma, space and t”. */
    const phrase = (is: number[]) => named(is).replace(/, ([^,]+)$/, ' and $1');
    const signed = (x: number) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(3)}`;
    const total = advance('mono') - advance('sans');

    // 1. The puzzle: the same words at the same size, two widths.
    await s.steps([widthFrame!], { kind: 'short' });

    // 2. The answer: each glyph advances the pen by its own width, and each font sets those widths.
    await this.step('measure', {
      title: 'Each glyph moves the pen on by its own advance',
      line: `Boxed in both rows: Inter’s narrowest letters, ${named(stems)}, and its widest, ${sans.chars[wideAt]}.`,
      caption: `A tick marks where the pen starts the next glyph; the distance between ticks is its advance. Width is the sum of the glyphs’ advances, and each font sets its own. JetBrains Mono gives all ${mono.advances.length} characters ${mono.advances[0]!.toFixed(3)}, so its line is ${mono.advances.length} × ${mono.advances[0]!.toFixed(3)} = ${advance('mono').toFixed(2)}. Inter gives each ${[...new Set(stems.map((i) => sans.chars[i]!))].join(' and ')} only ${narrowest.toFixed(3)}, so those ${stems.length} letters supply ${sum(stems).toFixed(2)} of the ${total.toFixed(2)}-unit difference, and the ${phrase(narrow)} add ${sum(narrow).toFixed(2)}. Only the ${phrase(wider)} is wider in Inter, and it gives back ${Math.abs(sum(wider)).toFixed(2)}.`,
    });
    await s.clear();
    const wide = Math.max(mine.width, theirs.width);
    const measured = new Text(WORD, { font, fontSize: SIZE, color: ink });
    measured.setStroke(ink, 0.012);
    measured.moveTo([-wide / 2, 2.4], [-1, 0]);
    const compare = new Text(WORD, { font: other, fontSize: SIZE, color: soft }).moveTo([-wide / 2, 0.1], [-1, 0]);
    const units = (f: FontName) => `${advance(f).toFixed(4)} units · ${NAME[f]}`;
    const mineRule = ruler(measured, mine.stops, units(font), hot);
    const theirRule = ruler(compare, theirs.stops, units(other), soft);
    await s.enter(measured, { runTime: 0.5 });
    s.keep(compare, mineRule, theirRule);
    await this.play(new Create(mineRule, { runTime: 0.9, lagRatio: 0 }));
    await this.play(new FadeIn(compare, { runTime: 0.5 }), new Create(theirRule, { runTime: 0.9, lagRatio: 0 }));
    // Inter's widest letter and all its narrowest ones, boxed by their advance cells in both rows.
    const cells = new Group();
    for (const [row, run, color] of [
      [measured, mine, hot],
      [compare, theirs, soft],
    ] as const) {
      const [x0, y0, , y1] = row.box()!;
      for (const i of [wideAt, ...stems]) {
        const x = x0 + run.stops[i]!;
        cells.add(
          new SurroundingRectangle([x, y0, x + run.advances[i]!, y1], {
            buff: 0.02,
            cornerRadius: 0.03,
            stroke: color,
            strokeWidth: 0.018,
          }),
        );
      }
    }
    s.keep(cells, {
      describe: `Boxes around ${NAME.sans}’s widest letter, “${sans.chars[wideAt]}”, and its narrowest, ${stems.map((i) => `“${sans.chars[i]}”`).join(', ')}, in both rows`,
    });
    await this.play(new Create(cells, { runTime: 0.8, lagRatio: 0 }));
    // The opening's question answered: the difference, JetBrains Mono minus Inter, by groups of characters.
    const groups: [string, number[]][] = [
      [named(stems), stems],
      [named(narrow), narrow],
      [named(wider), wider],
      [`the other ${rest.length}`, rest],
    ];
    const card = await s.card(
      groups.map(([name, is]) => [name, signed(sum(is))]),
      { at: [-4.6, -4.25, 4.6, -1.3], title: `${NAME.mono} − ${NAME.sans}: +${total.toFixed(2)} units` },
    );
    card.bar.style.fill = hot;
    await card.mark(named(stems));
    // The measuring model; the outline step's short picture has a model of its own, after which this one resumes.
    const measuring = {
      font,
      width: advance(font),
      glyphs: measured.children.length,
      gains: Object.fromEntries(groups.map(([name, is]) => [name, +sum(is).toFixed(3)])),
    };
    this.state = { ...measuring };

    // 3. What fills each advance: an outline.
    const big = glyphAlone(font, 'o', 4.6, [-3.9, -1.95]);
    const contours = measured.children.reduce((n, g) => n + contoursOf(g), 0),
      segments = measured.children.reduce((n, g) => n + segmentsOf(g), 0);
    await this.step('write', {
      title: 'The ink is closed outlines, and the space has none',
      line: 'The large o: dots on its outline, and the handles that bend each curve.',
      caption: `The pen traces ${measured.children.length} outlines for ${WORD.length} characters, because the space has an advance but no outline. The large o has ${contoursOf(big)} contours, its outside and its hole. A font supplies both parts of each glyph: the outline that makes its ink and the advance that places the next one.`,
    });
    await s.clear();
    const text = new Text(WORD, { font, fontSize: font === 'sans' ? 1.5 : 1.15, color: ink, fillOpacity: 0 });
    text.setStroke(ink, 0.018);
    text.moveTo([0, 1.75]);
    await this.play(new Write(text, { runTime: 2.2 }));
    // The first 'o' of the run, drawn large with its control net.
    const oIndex = text.children.findIndex((g) => charOf(text, g) === 'o');
    big.setStyle({ fill: ink, fillOpacity: 0 });
    big.setStroke(hot, 0.022);
    const net = controlNet(big, hot, soft);
    const glyphNote = new Text(`'o': ${contoursOf(big)} contours, ${segmentsOf(big)} cubic curves`, {
      fontSize: 0.22,
      color: soft,
    }).moveTo([-3.9, -4.0]);
    const underline = new Underline(text.children[oIndex]!, { buff: 0.12, stroke: hot, strokeWidth: 0.04 });
    s.keep(big, underline, {
      describe: `“${WORD}” traced as outlines, its first “o” underlined and drawn large below`,
    });
    await this.play(new Create(big, { runTime: 1.2 }), new Create(underline, { runTime: 0.6 }));
    s.keep(net, {
      describe:
        'The large “o” with its control net: points on the outline as large dots, handles as small dots on thin lines',
    });
    s.keep(glyphNote);
    await this.play(new FadeIn(net, { runTime: 0.6 }), new FadeIn(glyphNote, { runTime: 0.6 }));
    await s.card(
      [
        ['Characters', WORD.length],
        ['Glyph outlines', text.children.length],
        ['Closed contours', contours],
        ['Cubic curves', segments],
      ],
      { at: [0.6, -4.25, 7.4, -0.75], title: `${NAME[font]}, as paths` },
    );

    // 4. The same letter, two outlines: the prediction.
    await s.steps([shapeFrame!], { kind: 'short' });

    // 5. The answer to it: no glyph pairs across the fonts.
    await this.step('letterforms', {
      title: `Answer: across the two fonts, none of the ${measured.children.length} glyphs pair`,
      line: `Every glyph pairs with its ${SMALL * 100}% copy; with the other font, none do.`,
      caption: `Rayner’s shape matcher, TransformMatchingShapes, compares outlines after removing position and size. The ${SMALL * 100}% copy preserves those paths, so its glyphs pair with the originals. In this phrase the other font changes the paths: none pairs across the fonts. A character name identifies a letter, not a particular outline.`,
    });
    await s.clear();
    const row = new Text(WORD, { font, fontSize: SIZE, color: ink }).moveTo([-wide / 2, 2.35], [-1, 0]);
    await s.enter(row, { runTime: 0.5 });
    const [mx0, , mx1] = row.box()!;
    const smaller = new Text(WORD, { font, fontSize: SIZE * SMALL, color: ink }).moveTo([(mx0 + mx1) / 2, 0.55]);
    const across = new Text(WORD, { font: other, fontSize: SIZE, color: hot }).moveTo([-wide / 2, -1.15], [-1, 0]);
    s.keep(smaller, across);
    // Each morph starts from a copy, so the original row stays to compare against.
    const first = row.copy(),
      second = row.copy();
    const index = new Map(first.children.map((g, i) => [g, i]));
    const toSmaller = new TransformMatchingShapes(first, smaller, { runTime: 1.4 });
    await this.play(toSmaller);
    const sameFont = toSmaller.summary();
    const links = s.keep(
      pairLines(toSmaller.pairs, (g) => row.children[index.get(g)!]!, soft),
      {
        describe: `Lines join each of the ${sameFont.matched} glyphs of the top row to its smaller copy; nothing joins the ${NAME[other]} row`,
      },
    );
    await this.play(new Create(links, { runTime: 0.6, lagRatio: 0 }));
    const toOther = new TransformMatchingShapes(second, across, { runTime: 1.4 });
    await this.play(toOther);
    const otherFont = toOther.summary();
    const paired = (m: MatchSummary) => `${m.matched} of ${m.matched + m.morphed + m.removed} paired`;
    // Each row says how many of its glyphs found a partner, at its right end.
    await s.callout(smaller, paired(sameFont), { side: 'right', gap: 0.35, color: soft, size: 0.26 });
    await s.callout(across, paired(otherFont), { side: 'right', gap: 0.35, color: hot, size: 0.26 });
    this.state = { ...measuring, shapePairs: { sameFont: sameFont.matched, otherFont: otherFont.matched } };

    // 6. The same words in the same font can still take another width: a diagram fitted to recorded widths.
    await this.step('tradeoff', {
      title: 'In a diagram, Inter takes the width the layout recorded',
      line: 'Upper ruler: Inter’s own advance. Lower: the width the layout recorded.',
      caption: 'The layout estimated each label’s width before any glyph was drawn, and the renderer fits the real Inter glyphs to that estimate. “PNG stills” is drawn to the lower ruler, a little narrower than its own advance above, so its letters are squeezed. A label drawn at a width the font did not measure changes shape; the font-metrics example measures the drawn face before it places the boxes.',
    });
    await s.clear();
    const again = await s.show({ source: PIPELINE }, { box: regionBox('full', { right: -1.4 }) });
    const run = again.snapshot.parts.flatMap((p) => p.shapes).find((sh) => sh.textRun?.text === 'PNG stills')!.textRun!;
    const natural = new Text(run.text, { fontSize: run.size }).advance();
    const k = (run.width ?? natural) / natural;
    const plain = new Text(run.text, { fontSize: 0.9, color: soft }).moveTo([-0.6, 2.4], [-1, 0]);
    const fitted = new Text(run.text, { fontSize: 0.9, color: ink });
    fitted.stretch(k, 0);
    fitted.moveTo([-0.6, 0.2], [-1, 0]);
    const w0 = plain.advance(),
      w1 = w0 * k;
    await again.mark(['PNG'], { color: hot });
    await again.note('PNG', `squeezed ×${k.toFixed(3)}`, { side: 'below', color: hot });
    const plainRule = ruler(plain, [0], `Inter's own advance: ${w0.toFixed(3)}`, soft, 0.22);
    const fitRule = ruler(fitted, [0], `recorded width: ${w1.toFixed(3)}`, hot, 0.22);
    s.keep(plain, fitted, plainRule, fitRule);
    await this.play(new FadeIn(plain), new Create(plainRule, { lagRatio: 0 }));
    await this.play(new FadeIn(fitted), new Create(fitRule, { lagRatio: 0 }));
  }
}
