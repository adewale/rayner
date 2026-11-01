import { Group } from '../../../../src/index.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(): ReaderFrame[] {
  return [
    {
      id: 'reader-build',
      title: 'Who does the rendering work?',
      line: 'Move diagram layout from the reader’s browser to the build.',
      caption:
        'Rayner runs diagram layout during the build and stores the resulting geometry in the HTML file. The reader runs SVG animation code using that geometry. This makes the file larger while avoiding a diagram-layout dependency in the reader’s browser.',
      values: { layout: 'build', runtime: 'SVG scene' },
      draw: (s) =>
        new Group(
          flow(s, ['Author scene', 'Build diagrams', 'Portable page']),
          label('Build machine', -4.7, 2.6, s.soft, 0.7),
          label('Reader', 4.7, 2.6, s.soft, 0.7),
          label('Captured geometry travels with the page', 0, -1.8, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-cost',
      title: 'What do extra settings cost?',
      line: 'Every combination is a case to build and verify.',
      caption:
        'Three refill rates and two policies require six built cases. The reader can switch among those cases. An unrestricted input would also need a runtime model and checks for values outside that prepared set.',
      values: { rates: 3, policies: 2, cases: 6 },
      draw: (s) =>
        table(
          ['', 'Policy A', 'Policy B'],
          [
            ['Rate 1', 'case 1', 'case 2'],
            ['Rate 2', 'case 3', 'case 4'],
            ['Rate 4', 'case 5', 'case 6'],
          ],
          s,
          { xs: [-5, 0, 5], y: 2.6, gap: 1.55 },
        ),
    },
  ];
}
