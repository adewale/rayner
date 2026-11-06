import { Group, Text, Line, Rectangle, shaperFor } from '../../../src/index.ts';
import type { FontName } from '../../../src/index.ts';
import { label } from '../../../explain/drawing.ts';
import type { StagedStep } from '../../../explain/index.ts';
import { stagedStep } from '../../../explain/index.ts';
const word = 'Hello, outlines',
  size = 0.9;
const name = (f: FontName) => (f === 'sans' ? 'Inter' : 'JetBrains Mono');
/** The glyph's advance in `f` at the size the rows use. */
const advanceOf = (f: FontName, ch: string) => shaperFor(f)(ch, size).width;

/** The opening question, and the two l's that set up the shape-matching prediction. */
export function frames(font: FontName): StagedStep[] {
  const other: FontName = font === 'sans' ? 'mono' : 'sans';
  const widths = [font, other].map((f) => shaperFor(f)(word, size).width);
  const w = Object.fromEntries([font, other].map((f, i) => [f, widths[i]!])) as Record<FontName, number>;
  const l = { sans: advanceOf('sans', 'l'), mono: advanceOf('mono', 'l') };
  return [
    stagedStep({
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
    }),
    stagedStep({
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
    }),
  ];
}
