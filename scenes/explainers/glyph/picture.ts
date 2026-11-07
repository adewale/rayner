import { Group, Text, Line, Rectangle, BraceLabel, SurroundingRectangle, shaperFor } from '../../../src/index.ts';
import type { FontName, Mobject } from '../../../src/index.ts';
import { label } from '../../../explain/drawing.ts';
import type { StagedStep } from '../../../explain/index.ts';
const word = 'Hello, outlines',
  size = 0.9; // the size the fidelity test measures
export { word as WORD, size as SIZE };
const name = (f: FontName) => (f === 'sans' ? 'Inter' : 'JetBrains Mono');
/** The glyph's advance in `f` at the size the rows use. */
const advanceOf = (f: FontName, ch: string) => shaperFor(f)(ch, size).width;

/** The opening question's state: the words' width in each font. */
type WidthState = { font: FontName; other: FontName; word: string; widths: number[] };
/** The shape prediction's state: the l's advance in each font. */
type ShapeState = { font: FontName; other: FontName; l: { sans: number; mono: number } };

/** The opening question, and the two l's that set up the shape-matching prediction. */
export function frames(font: FontName): [StagedStep<WidthState>, StagedStep<ShapeState>] {
  const other: FontName = font === 'sans' ? 'mono' : 'sans';
  const widths = [font, other].map((f) => shaperFor(f)(word, size).width);
  const w = Object.fromEntries([font, other].map((f, i) => [f, widths[i]!])) as Record<FontName, number>;
  const l = { sans: advanceOf('sans', 'l'), mono: advanceOf('mono', 'l') };
  return [
    {
      id: 'reader-width',
      title: `Same words, same size: ${w.sans.toFixed(2)} or ${w.mono.toFixed(2)} units wide`,
      line: `Which letters make up the ${Math.abs(w.mono - w.sans).toFixed(2)}-unit difference?`,
      caption: `At size ${size}, “${word}” is ${widths[0]!.toFixed(2)} units wide in ${name(font)} and ${widths[1]!.toFixed(2)} in ${name(other)}. The same characters start from the same left edge at the same size. The rulers disagree because the fonts assign different spacing. Which letters account for most of the difference?`,
      state: { font, other, word, widths },
      draw: (st, s) => {
        const g = new Group();
        [st.font, st.other].forEach((f, i) => {
          const y = 1.5 - i * 3,
            w = st.widths[i]!,
            text = new Text(st.word, { font: f, fontSize: size, color: s.palette.ink }).moveTo([-6.5, y], [-1, 0]);
          text.key = `word:${f}`;
          g.add(
            text,
            label(name(f), -6.5, y + 1.1, s.palette.ink, 0.65).moveTo([-6.5, y + 1.1], [-1, 0]),
            new Line([-6.5, y - 0.8], [-6.5 + w, y - 0.8], { stroke: s.emphasis, strokeWidth: 0.05 }),
            label(w.toFixed(2), 5.5, y - 0.8, s.palette.ink, 0.7).moveTo([5.5, y - 0.8], [1, 0]),
          );
        });
        return g;
      },
    },
    {
      id: 'reader-shape',
      title: 'To fill its wider cell, JetBrains Mono draws a different l',
      line: 'Will shape matching pair any Inter glyph with a JetBrains Mono one?',
      caption: `The box round each l marks its advance, the width written under it. JetBrains Mono gives it more room and draws a flag and a foot; Inter uses a simpler stem. The character is the same, but its outline, the closed path that makes its ink, has changed. A shape matcher ignores position and size, so the outlines themselves must supply the correspondence.`,
      state: { font, other, l },
      draw: (st, s) => {
        const big = 3.4,
          g = new Group();
        [st.font, st.other].forEach((f, i) => {
          const x = i ? 3.6 : -3.6;
          const t = new Text('l', { font: f, fontSize: big, color: s.palette.ink }).moveTo([x, 0.75]);
          t.key = `l:${f}`;
          const [x0, y0, x1, y1] = t.box()!;
          const cell = new Rectangle({
            width: x1 - x0,
            height: y1 - y0 + 0.3,
            fill: 'none',
            stroke: s.emphasis,
            strokeWidth: 0.03,
          }).moveTo([(x0 + x1) / 2, (y0 + y1) / 2]);
          cell.style.dashArray = '0.12 0.08';
          g.add(
            cell,
            t,
            label(name(f), x, -2.3, s.palette.ink, 0.65),
            label(`advance ${st.l[f].toFixed(3)}`, x, -3.1, s.emphasis, 0.6),
          );
        });
        return g;
      },
    },
  ];
}

/** A width ruler under a text: a tick at every glyph's pen position, and a brace labelled with the measured width. */
export function ruler(text: Text, stops: readonly number[], label: string, color: string, size = 0.24): Group {
  const [x0, y0] = text.box()!;
  const y = y0 - 0.12;
  const g = new Group();
  for (const x of stops.slice(1))
    g.add(new Line([x0 + x, y], [x0 + x, y - 0.14], { stroke: color, strokeWidth: 0.014 }));
  // The brace spans the text's advance box: the width the shaper measured.
  const brace = new BraceLabel(text, label, [0, -1], { fontSize: size, color, buff: 0.3, labelBuff: 0.1 });
  brace.brace.setStroke(color, 0.022);
  g.add(brace);
  return g;
}

/** Thin lines from each source glyph (as `ghost` shows it) to the glyph it was paired with. */
export function pairLines(pairs: Array<[Mobject, Mobject]>, ghostOf: (m: Mobject) => Mobject, color: string): Group {
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

/** The phrase in both fonts from one left edge: the measured row, stroked in ink, over the other font's row. */
export function measuredRows(font: FontName, other: FontName, wide: number, ink: string, soft: string): { measured: Text; compare: Text } {
  const measured = new Text(word, { font, fontSize: size, color: ink });
  measured.setStroke(ink, 0.012);
  measured.moveTo([-wide / 2, 2.4], [-1, 0]);
  const compare = new Text(word, { font: other, fontSize: size, color: soft }).moveTo([-wide / 2, 0.1], [-1, 0]);
  return { measured, compare };
}

/** The glyphs at `at` boxed by their advance cells, in each row's colour. */
export function advanceCells(
  rows: ReadonlyArray<readonly [Text, { readonly stops: readonly number[]; readonly advances: readonly number[] }, string]>,
  at: readonly number[],
): Group {
  const cells = new Group();
  for (const [row, run, color] of rows) {
    const [x0, y0, , y1] = row.box()!;
    for (const i of at) {
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
  return cells;
}

/** The phrase in `font`, the row the letterforms step morphs copies of. */
export const letterRow = (font: FontName, wide: number, ink: string) =>
  new Text(word, { font, fontSize: size, color: ink }).moveTo([-wide / 2, 2.35], [-1, 0]);

/** The row's two targets: a `small` copy centred under it, and the phrase in the other font below. */
export function letterTargets(row: Text, font: FontName, other: FontName, small: number, wide: number, ink: string, hot: string) {
  const [mx0, , mx1] = row.box()!;
  const smaller = new Text(word, { font, fontSize: size * small, color: ink }).moveTo([(mx0 + mx1) / 2, 0.55]);
  const across = new Text(word, { font: other, fontSize: size, color: hot }).moveTo([-wide / 2, -1.15], [-1, 0]);
  return { smaller, across };
}
