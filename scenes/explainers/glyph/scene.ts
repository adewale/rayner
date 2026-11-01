import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/glyph.ts';
import {
  Scene,
  Text,
  Write,
  Create,
  FadeIn,
  Transform,
  TransformMatchingText,
  TransformMatchingShapes,
  Group,
  Line,
  Dot,
  Underline,
  SurroundingRectangle,
  BraceLabel,
  Cross,
  DOWN,
  shaperFor,
} from '../../../src/index.ts';
import type { Box, Mobject, Vec, MatchSummary, FontName } from '../../../src/index.ts';
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
const pipeline = (font: string) =>
  `graph TB\nFont[${font}] --> Shape[Shape text]\nShape --> Paths[Cubic paths]\nPaths --> SVG[SVG player]\nPaths --> PNG[PNG stills]`;

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

    await readerFirst(this, s, readerFrames(font));
    await this.step('write', {
      detail: true,
      title: 'A letter needs both an outline and a measured width',
      line: 'Write traces the contour; the next step measures its advance.',
      caption:
        'Why can the same word take different space in two fonts? Each letter is an outline from a font bundled with Rayner, with an advance that tells the next letter where to start. Write traces those contours here; the close-up shows points and handles. The next step compares the measured widths before later steps show what changes during a morph. No installed font is needed.',
    });
    await s.clear();
    const text = new Text(WORD, { font, fontSize: font === 'sans' ? 1.5 : 1.15, color: ink, fillOpacity: 0 });
    text.setStroke(ink, 0.018);
    text.moveTo([0, 1.75]);
    await this.play(new Write(text, { runTime: 2.2 }));
    // The first 'o' of the run, drawn large with its control net.
    const oIndex = text.children.findIndex((g) => charOf(text, g) === 'o');
    const big = glyphAlone(font, 'o', 4.6, [-3.9, -1.95]);
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
    const contours = text.children.reduce((n, g) => n + contoursOf(g), 0),
      segments = text.children.reduce((n, g) => n + segmentsOf(g), 0);
    await s.card(
      [
        ['Characters', WORD.length],
        ['Glyph outlines', `${text.children.length} (a space has none)`],
        ['Closed contours', contours],
        ['Cubic curves', segments],
      ],
      { at: [0.6, -4.25, 7.4, -0.75], title: `${NAME[font]}, as paths` },
    );

    await this.step('measure', {
      detail: true,
      title: 'Inter and JetBrains Mono give the same words different widths',
      line: 'Ticks mark each pen position; the brace spans the measured width.',
      caption:
        'The shaper gives every glyph an exact advance; the ticks mark each pen position and the brace spans the measured width. The boxed letters are Inter’s widest and narrowest; in JetBrains Mono every glyph has the same advance.',
    });
    await s.clearOverlays();
    const measured = new Text(WORD, { font, fontSize: SIZE, color: ink });
    measured.setStroke(ink, 0.012);
    const wide = Math.max(mine.width, theirs.width);
    measured.moveTo([-wide / 2, 2.15], [-1, 0]);
    await this.play(new Transform(text, measured, { replace: true }));
    const compare = new Text(WORD, { font: other, fontSize: SIZE, color: soft }).moveTo([-wide / 2, -0.15], [-1, 0]);
    // Measured on fresh runs: moving the drawn copy re-rounds its float32 box.
    const advance = (f: FontName) => new Text(WORD, { font: f, fontSize: SIZE }).advance();
    const units = (f: FontName) => `${advance(f).toFixed(4)} units · ${NAME[f]}`;
    const mineRule = ruler(measured, mine.stops, units(font), hot);
    const theirRule = ruler(compare, theirs.stops, units(other), soft);
    s.keep(compare, mineRule, theirRule);
    await this.play(new Create(mineRule, { runTime: 0.9, lagRatio: 0 }));
    await this.play(new FadeIn(compare, { runTime: 0.5 }), new Create(theirRule, { runTime: 0.9, lagRatio: 0 }));
    // Inter's widest and narrowest letters, boxed by their advance cells in both rows.
    const sans = font === 'sans' ? mine : theirs;
    const widest = sans.advances.indexOf(Math.max(...sans.advances)),
      narrowest = sans.advances.indexOf(Math.min(...sans.advances));
    const cells = new Group();
    for (const [row, run, color] of [
      [measured, mine, hot],
      [compare, theirs, soft],
    ] as const) {
      const [x0, y0, , y1] = row.box()!;
      for (const i of [widest, narrowest]) {
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
      describe: `Boxes around ${NAME.sans}’s widest and narrowest letters, “${sans.chars[widest]}” and “${sans.chars[narrowest]}”, in both rows`,
    });
    await this.play(new Create(cells, { runTime: 0.8, lagRatio: 0 }));
    const spread = (run: ReturnType<typeof shape>) => {
      const a = run.advances,
        lo = Math.min(...a),
        hi = Math.max(...a);
      return hi - lo < 1e-6
        ? `${lo.toFixed(3)} each`
        : `${lo.toFixed(3)} (${run.chars[a.indexOf(lo)]}) to ${hi.toFixed(3)} (${run.chars[a.indexOf(hi)]})`;
    };
    const runs = { [font]: mine, [other]: theirs } as Record<FontName, ReturnType<typeof shape>>;
    const card = await s.card(
      [
        [`${NAME.sans} advances`, spread(runs.sans)],
        [`${NAME.mono} advances`, spread(runs.mono)],
        [`${NAME[font]} − ${NAME[other]}`, `${(advance(font) - advance(other)).toFixed(4)} units`],
      ],
      { at: [-4.2, -4.25, 4.2, -2.3] },
    );
    card.bar.style.fill = hot;
    await card.mark(`${NAME[font]} advances`);
    this.state = { font, width: advance(font), glyphs: measured.children.length };

    await this.step('letterforms', {
      detail: true,
      title: 'The same letter is a different outline in each font',
      line: `Every glyph pairs with its ${SMALL * 100}% copy; across fonts, none pair.`,
      caption: `TransformMatchingShapes pairs glyphs whose outlines are the same path once each is centred and scaled to one size, so position and size do not count. Every glyph pairs with its own copy at ${SMALL * 100}% size; across the two fonts nothing pairs, not even the same letter.`,
    });
    await s.clearOverlays();
    await this.play(measured.animate.moveTo([-wide / 2, 2.35], [-1, 0]), { runTime: 0.5 });
    const [mx0, , mx1] = measured.box()!;
    const smaller = new Text(WORD, { font, fontSize: SIZE * SMALL, color: ink }).moveTo([(mx0 + mx1) / 2, 0.55]);
    const across = new Text(WORD, { font: other, fontSize: SIZE, color: hot }).moveTo([-wide / 2, -1.15], [-1, 0]);
    s.keep(smaller, across);
    // Each morph starts from a copy, so the original row stays to compare against.
    const first = measured.copy(),
      second = measured.copy();
    const index = new Map(first.children.map((g, i) => [g, i]));
    const toSmaller = new TransformMatchingShapes(first, smaller, { runTime: 1.4 });
    await this.play(toSmaller);
    const sameFont = toSmaller.summary();
    const links = s.keep(
      pairLines(toSmaller.pairs, (g) => measured.children[index.get(g)!]!, soft),
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
    this.state.shapePairs = { sameFont: sameFont.matched, otherFont: otherFont.matched };

    await this.step('pipeline', {
      detail: true,
      title: 'Rayner converts every font segment to a cubic',
      line: `${mine.quads + mine.lines + mine.cubics} font segments in, as many cubics out, for SVG and PNG.`,
      caption:
        'The font stores quadratic curves and lines, as the note beside it counts. Rayner raises every segment to a cubic, so one kind of path feeds both the SVG player and PNG stills.',
    });
    await s.clear();
    const d = await s.show({ source: pipeline(NAME[font]) }, { box: regionBox('full', { right: -0.4 }) });
    await d.walk(
      [
        ['Font', 'Shape'],
        ['Shape', 'Paths'],
        ['Paths', 'SVG'],
      ],
      { trail: true, color: hot },
    );
    await d.walk([['Paths', 'PNG']], { trail: true, color: hot });
    const raw = mine.cubics
      ? `${mine.quads} quads, ${mine.lines} lines, ${mine.cubics} cubics`
      : `${mine.quads} quads + ${mine.lines} lines`;
    await d.note('Font', raw, { side: 'right', color: hot });
    await d.note('Paths', `${mine.quads + mine.lines + mine.cubics} cubics`, { side: 'right', color: hot });
    const solid = glyphAlone(font, 'o', 3.6, [3.85, 1.95]);
    solid.setStyle({ fill: ink, fillOpacity: 1, stroke: 'none' });
    const o = solid as Pathed;
    const fmt = (a: Float32Array, i: number, n: number) => Array.from(a.slice(i, i + n), (v) => v.toFixed(2)).join(' ');
    const lines = ['<path d="'];
    o.subpaths.forEach((a, c) => {
      const curves = (a.length - 2) / 6;
      lines.push(`  M ${fmt(a, 0, 2)}`);
      lines.push(`  C ${fmt(a, 2, 6)}`);
      if (c === 0) lines.push(`  C ${fmt(a, 8, 6)}`);
      lines.push(`  … ${curves - (c === 0 ? 2 : 1)} more C … Z`);
    });
    lines.push('"/>');
    await s.enter(solid, { runTime: 0.5, describe: 'A solid “o”, the glyph whose path the code shows' });
    await s.code(lines, {
      at: regionBox('right', { top: 0.7 }),
      title: `the 'o' as SVG path data (scene units)`,
      fontSize: 0.22,
    });

    await this.step('morph', {
      detail: true,
      title: 'A text diff becomes a glyph morph',
      line: 'Paired letters move down; m and s shrink away, h and t grow.',
      caption:
        'TransformMatchingText pairs glyphs of the same letter, longest runs first. The glyphs of cache and the i travel down into the new word, the crossed m and both s glyphs shrink away, and the underlined h and t grow in.',
    });
    await s.clear();
    const before = new Text('cache miss', { font, fontSize: 1.1, color: ink }).moveTo([-7, 1.9], [-1, 0]);
    const after = new Text('cache hit', { font, fontSize: 1.1, color: ink }).moveTo([-7, -1.6], [-1, 0]);
    await s.enter(before, { runTime: 0.5 });
    await s.code(['- cache miss', '+ cache hit'], {
      at: regionBox('full', { left: 3.0, bottom: -0.2 }),
      fontSize: 0.3,
      title: 'label.txt',
      diff: true,
    });
    // The ghost keeps the old word on screen; its glyphs stand for the ones that move.
    const ghost = before.copy().setFill(soft);
    const at = new Map(before.children.map((g, i) => [g, i]));
    const ghostOf = (g: Mobject) => ghost.children[at.get(g)!]!;
    s.keep(ghost, after);
    const morph = new TransformMatchingText(before, after, { runTime: 1.6 });
    await this.play(morph, new FadeIn(ghost, { runTime: 1.6 }));
    const result = morph.summary();
    const letters = (t: Text, gs: Mobject[]) => gs.map((g) => charOf(t, g)).join(' ');
    const pairs = pairLines(morph.pairs, ghostOf, soft);
    const marks = new Group(
      ...morph.removed.map((g) => new Cross(ghostOf(g), { stroke: hot, strokeWidth: 0.035, scale: 0.8 })),
      ...morph.added.map((g) => new Underline(g, { buff: 0.14, stroke: hot, strokeWidth: 0.045 })),
    );
    s.keep(pairs, marks, {
      describe: `Lines join the ${result.matched} paired letters of “cache miss” (${letters(
        before,
        morph.pairs.map(([a]) => a),
      )}) to their places in “cache hit”; the dropped ${letters(before, morph.removed)} are crossed out and the new ${letters(after, morph.added)} underlined`,
    });
    await this.play(new Create(pairs, { runTime: 0.8, lagRatio: 0 }), new Create(marks, { runTime: 0.8, lagRatio: 0 }));
    // The counts, each beside the marks it counts: right of the crossed letters and of the paired lines, under the underlined ones.
    const around = (gs: Mobject[]) => {
      const bs = gs.map((g) => g.box()!);
      return [
        Math.min(...bs.map((b) => b[0])),
        Math.min(...bs.map((b) => b[1])),
        Math.max(...bs.map((b) => b[2])),
        Math.max(...bs.map((b) => b[3])),
      ] as Box;
    };
    await s.callout(
      around(morph.removed.map(ghostOf)),
      `${result.removed} shrink away: ${letters(before, morph.removed)}`,
      { side: 'right', gap: 0.3, color: hot, size: 0.26 },
    );
    await s.callout(
      pairs,
      `${result.matched} paired: ${letters(
        before,
        morph.pairs.map(([a]) => a),
      )}`,
      { side: 'right', gap: 0.35, color: soft, size: 0.26 },
    );
    await s.callout(around(morph.added), `${result.added} grow in: ${letters(after, morph.added)}`, {
      side: 'below',
      gap: 0.45,
      color: hot,
      size: 0.26,
    });

    await this.step('tradeoff', {
      detail: true,
      title: 'This diagram fits Inter labels to recorded widths',
      line: 'Pen-and-ink does not request EB Garamond for this scene.',
      caption:
        'This scene uses pen-and-ink paper and strokes but makes no font-face request. Its diagram labels use embedded Inter, stretched to the textLength widths stored by agentic-mermaid; the two “PNG stills” rulers show the change. The font-metrics example explicitly requests EB Garamond and measures its labels before layout.',
    });
    await s.clear();
    const again = await s.show({ source: pipeline(NAME[font]) }, { box: regionBox('full', { right: -1.4 }) });
    const run = again.snapshot.parts.flatMap((p) => p.shapes).find((sh) => sh.textRun?.text === 'PNG stills')!.textRun!;
    const natural = new Text(run.text, { fontSize: run.size }).advance();
    const k = (run.width ?? natural) / natural;
    await again.mark(['PNG'], { color: hot });
    await again.note('PNG', `stretched ×${k.toFixed(3)}`, { side: 'below', color: hot });
    const plain = new Text(run.text, { fontSize: 0.9, color: soft }).moveTo([-0.6, 2.4], [-1, 0]);
    const fitted = new Text(run.text, { fontSize: 0.9, color: ink });
    fitted.stretch(k, 0);
    fitted.moveTo([-0.6, 0.2], [-1, 0]);
    const w0 = plain.advance(),
      w1 = w0 * k;
    const plainRule = ruler(plain, [0], `Inter's own advance: ${w0.toFixed(3)}`, soft, 0.22);
    const fitRule = ruler(fitted, [0], `textLength width: ${w1.toFixed(3)}`, hot, 0.22);
    s.keep(plain, fitted, plainRule, fitRule);
    await this.play(new FadeIn(plain), new Create(plainRule, { lagRatio: 0 }));
    await this.play(new FadeIn(fitted), new Create(fitRule, { lagRatio: 0 }));
    await s.card(
      [
        ['Shapes and strokes', 'from the style'],
        ['Label width', 'from textLength'],
        ['Letterforms', 'embedded Inter'],
      ],
      { at: [-0.6, -4.25, 7.55, -1.75], title: 'What survives import' },
    );
  }
}
