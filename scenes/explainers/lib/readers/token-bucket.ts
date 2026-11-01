import { Group, Circle, Rectangle } from '../../../../src/index.ts';
import { TokenBucket } from '../models.ts';
import { label, bars } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(rate: number): ReaderFrame[] {
  const b = new TokenBucket(rate, 5);
  const burst = Array.from({ length: 6 }, () => b.allow(0));
  const before = b.tokens,
    ok = b.allow(0.5),
    found = b.tokens + (ok ? 1 : 0),
    after = b.tokens;
  return [
    {
      id: 'reader-burst',
      title: 'Can six requests spend five tokens?',
      line: 'All six requests arrive together.',
      caption:
        'The bucket starts with five tokens. Each of the first five requests spends one and gets 200. Request 6 gets 429 because it arrives at the same instant, before any refill can accrue.',
      values: { rate, burst },
      draw: (s) =>
        new Group(
          label('Starting tokens', 0, 2.55, s.palette.ink, 0.75),
          ...burst.map((yes, i) => {
            const x = (i - 2.5) * 2.5;
            const request = new Group(
              new Rectangle({
                width: 2.15,
                height: 2,
                fill: s.palette.paper,
                stroke: yes ? s.emphasis : s.bad,
                strokeWidth: 0.045,
              }).moveTo([x, -0.3]),
              label(`R${i + 1}`, x, 0.25, s.palette.ink, 0.75),
              label(yes ? '200' : '429', x, -0.6, yes ? s.palette.ink : s.bad, 0.82),
            );
            request.key = `burst:${i}:${yes ? 200 : 429}`;
            return new Group(
              ...(i < 5
                ? [new Circle({ radius: 0.38, fill: s.emphasis, stroke: s.soft, strokeWidth: 0.04 }).moveTo([x, 1.7])]
                : [label('×', x, 1.7, s.bad, 0.9)]),
              request,
            );
          }),
          label('Six requests at the same instant', 0, -2.5, s.palette.ink, 0.75),
        ),
    },
    {
      id: 'reader-refill',
      title: 'What does half a second buy?',
      line: `Refill speed: ${rate} token${rate === 1 ? '' : 's'} per second.`,
      caption: `At 0.5 s, elapsed time adds 0.5 × ${rate} = ${found} tokens. The request ${ok ? 'spends one token and gets 200' : 'has less than one token and gets 429'}, leaving ${after}. Refill is calculated when the request arrives.`,
      values: { rate, before, found, after, ok },
      draw: (s) =>
        new Group(
          bars(
            s,
            [
              { label: 'Before the wait', value: before, display: String(before) },
              { label: 'On arrival: add elapsed × rate', value: found, display: String(found) },
              { label: `After the request: ${ok ? 200 : 429}`, value: after, display: String(after) },
            ],
            5,
          ),
          label('Five-token capacity', 0, -4, s.soft, 0.6),
        ),
    },
  ];
}
