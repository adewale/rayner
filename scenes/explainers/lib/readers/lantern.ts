import { Group, Circle, Arrow } from '../../../../src/index.ts';
import { label, flow } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(): ReaderFrame[] {
  return [
    {
      id: 'reader-object',
      title: 'What happens to one circle over time?',
      line: 'The scene is a program; the clock samples its animations.',
      caption:
        'The three circles sample one move at different times. At each fixed time step, the clock evaluates the animation and sends the resulting picture to a sink. The source example uses a real transform and checks frames reached by playback and seeking.',
      values: {
        samples: [
          { t: 0, x: -4 },
          { t: 0.5, x: 0 },
          { t: 1, x: 4 },
        ],
      },
      draw: (s) =>
        new Group(
          ...[-4, 0, 4].map(
            (x, i) =>
              new Group(
                new Circle({
                  radius: 0.7,
                  fill: s.emphasis,
                  fillOpacity: 0.2,
                  stroke: s.emphasis,
                  strokeWidth: 0.05,
                }).moveTo([x, 0.6]),
                label(['0 s', '0.5 s', '1 s'][i]!, x, -1, s.palette.ink, 0.75),
              ),
          ),
          label('One move, sampled at three times', 0, 2.7, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-outputs',
      title: 'Must the page and still use different scenes?',
      line: 'One scene and clock feed several outputs.',
      caption:
        'The browser sink displays successive SVG frames. A still samples one time; a trace records step boundaries and descriptions. All three use the same scene program. Playback and seek tests check that they reach the same picture.',
      values: { outputs: ['Browser', 'SVG still', 'Trace'] },
      draw: (s) =>
        new Group(
          flow(s, ['Scene', 'Fixed clock', 'Sink']),
          label('Browser  /  SVG still  /  Trace', 0, -1.6, s.palette.ink, 0.75),
          label('One program; several outputs', 0, -3, s.soft, 0.65),
        ),
    },
  ];
}
