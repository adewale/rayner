import { Group, Text, Line, shaperFor } from '../../../../src/index.ts';
import type { FontName } from '../../../../src/index.ts';
import { label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
const word = 'Hello, outlines',
  size = 0.9;
export function frames(font: FontName): ReaderFrame[] {
  const other: FontName = font === 'sans' ? 'mono' : 'sans',
    name = (f: FontName) => (f === 'sans' ? 'Inter' : 'JetBrains Mono');
  const widths = [font, other].map((f) => shaperFor(f)(word, size).width);
  return [
    {
      id: 'reader-width',
      title: 'Same letters, same width?',
      line: 'Measure the selected face before placing the next object.',
      caption: `At the same font size, “${word}” advances ${widths[0]!.toFixed(2)} units in the first face and ${widths[1]!.toFixed(2)} in the second. Both phrases start at the same left position. Each ruler measures advance, including spacing; glyph ink can extend beyond it.`,
      values: { font, other, word, widths },
      draw: (s) => {
        const g = new Group();
        [font, other].forEach((f, i) => {
          const y = 1.5 - i * 3,
            w = widths[i]!,
            text = new Text(word, { font: f, fontSize: size, color: s.palette.ink }).moveTo([-6.5, y], [-1, 0]);
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
      title: 'Can one character have two outlines?',
      line: 'Character identity and outline geometry give different matches.',
      caption:
        'Both drawings are the character a, with different contours. Text matching pairs them by character identity. Shape matching requires equal geometry. The source walkthrough shows the curve conversion and the matches each rule finds.',
      values: { font, other },
      draw: (s) => {
        const a = new Text('a', { font, fontSize: 3.8, color: s.palette.ink }).moveTo([-4.2, 0.3]),
          b = new Text('a', { font: other, fontSize: 3.8, color: s.palette.ink }).moveTo([4.2, 0.3]);
        return new Group(
          a,
          b,
          label(name(font), -4.2, -2.6, s.soft, 0.7),
          label(name(other), 4.2, -2.6, s.soft, 0.7),
          label('Same character', 0, 2.7, s.palette.ink, 0.7),
        );
      },
    },
  ];
}
