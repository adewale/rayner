import { frames as readerFrames, ruler, pairLines, WORD, SIZE, measuredRows, advanceCells, letterRow, letterTargets } from './picture.ts';
import { Scene, Text, Create, FadeIn, TransformMatchingShapes, shaperFor } from '../../../src/index.ts';
import type { MatchSummary, FontName } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';

const SMALL = 0.6; // the smaller copy in the letterforms step
const STYLE = 'pen-and-ink';
const NAME: Record<FontName, string> = { sans: 'Inter', mono: 'JetBrains Mono' };
// This explainer has no model of its own: every width and outline is the engine's, from the shaped runs of the
// bundled Inter and JetBrains Mono files, never estimated character widths. The phrase has fifteen characters
// but fourteen drawn glyphs, since the space has no outline. The shape-match result holds for this phrase and
// these font files, not for any two fonts; the matcher removes translation and uniform scale, not differences
// in the paths themselves.
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

export default class GlyphExplainer extends Scene {
  static meta = {
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/src/text.ts'],
    claims: [
      {
        says: 'Inter gives each l and i only 0.218',
        test: 'model.test.ts: Inter gives l and i its narrowest advance',
      },
      {
        says: 'Only the H is wider in Inter',
        test: 'model.test.ts: only the H is wider than JetBrains Mono’s cell',
      },
      { says: 'Every glyph pairs with its 60% copy; with the other font, none do', shown: true as const },
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
      caption: `Width is the sum of the glyphs’ advances, and each font sets its own; the gap between two ticks is one advance. JetBrains Mono gives all ${mono.advances.length} characters ${mono.advances[0]!.toFixed(3)}, so its line is ${mono.advances.length} × ${mono.advances[0]!.toFixed(3)} = ${advance('mono').toFixed(2)}. Inter gives each ${[...new Set(stems.map((i) => sans.chars[i]!))].join(' and ')} only ${narrowest.toFixed(3)}: those ${stems.length} letters supply ${sum(stems).toFixed(2)} of the ${total.toFixed(2)}-unit difference, and the ${phrase(narrow)} ${sum(narrow).toFixed(2)}${narrow.some((i) => sans.chars[i] === ' ') ? ', the space without drawing any ink' : ''}. Only the ${phrase(wider)} is wider in Inter, giving back ${Math.abs(sum(wider)).toFixed(2)}.`,
    });
    await s.clear();
    const wide = Math.max(mine.width, theirs.width);
    const { measured, compare } = measuredRows(font, other, wide, ink, soft);
    const units = (f: FontName) => `${advance(f).toFixed(4)} units · ${NAME[f]}`;
    const mineRule = ruler(measured, mine.stops, units(font), hot);
    const theirRule = ruler(compare, theirs.stops, units(other), soft);
    await s.enter(measured, { runTime: 0.5 });
    s.keep(compare, mineRule, theirRule);
    await this.play(new Create(mineRule, { runTime: 0.9, lagRatio: 0 }));
    await this.play(new FadeIn(compare, { runTime: 0.5 }), new Create(theirRule, { runTime: 0.9, lagRatio: 0 }));
    // Inter's widest letter and all its narrowest ones, boxed by their advance cells in both rows.
    const cells = advanceCells(
      [
        [measured, mine, hot],
        [compare, theirs, soft],
      ],
      [wideAt, ...stems],
    );
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

    // 3. The same letter, two outlines: the prediction.
    await s.steps([shapeFrame!], { kind: 'short' });

    // 4. The answer to it: no glyph pairs across the fonts.
    await this.step('letterforms', {
      title: `Answer: across the two fonts, none of the ${measured.children.length} glyphs pair`,
      line: `Every glyph pairs with its ${SMALL * 100}% copy; with the other font, none do.`,
      caption: `Rayner’s shape matcher, TransformMatchingShapes, compares outlines after removing position and size. The ${SMALL * 100}% copy keeps those paths, so all ${measured.children.length} of its glyphs pair with the originals; the space has no outline to pair. In this phrase the other font changes the paths: none pairs across the fonts. A character name identifies a letter, not a particular outline.`,
    });
    await s.clear();
    const row = letterRow(font, wide, ink);
    await s.enter(row, { runTime: 0.5 });
    const { smaller, across } = letterTargets(row, font, other, SMALL, wide, ink, hot);
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
  }
}
