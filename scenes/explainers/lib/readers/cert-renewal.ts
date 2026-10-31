import { Group, Rectangle, Line } from '../../../../src/index.ts';
import { summarize, LIFETIMES, DAY } from '../cert-renewal.ts';
import type { LifetimeKey, Rule } from '../cert-renewal.ts';
import { bars, label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(key: LifetimeKey, rule: Rule): ReaderFrame[] {
  const life = LIFETIMES[key],
    fixed = summarize('fixed30', key),
    fraction = summarize('fraction', key),
    selected = rule === 'fixed30' ? fixed : fraction;
  const units = key === '160h' ? 1 : DAY,
    unit = key === '160h' ? 'h' : 'days',
    f = (h: number) => `${+(h / units).toFixed(1)} ${unit}`;
  return [
    {
      id: 'reader-due',
      title: 'When does “30 days before” fire?',
      line: `Certificate lifetime: ${life.label}.`,
      caption: `The fixed rule triggers after ${f(fixed.due)}; the lifetime-fraction rule triggers after ${f(fraction.due)}. Both bars span the same certificate lifetime. On a short certificate, “30 days before expiry” can mean renewing near the start. This comparison assumes no ARI answer.`,
      values: { key, fixed, fraction },
      draw: (s) => {
        const g = new Group();
        for (const [i, r] of [fixed, fraction].entries()) {
          const y = 1.9 - i * 2.8,
            x = -6 + (r.due / life.hours) * 12;
          g.add(
            label(i === 0 ? 'Fixed: 30 days before' : 'Default: lifetime fraction', 0, y + 0.65, s.palette.ink, 0.66),
            new Rectangle({
              width: 12,
              height: 0.6,
              fill: s.emphasis,
              fillOpacity: 0.18,
              stroke: s.soft,
              strokeWidth: 0.03,
            }).moveTo([0, y - 0.25]),
            new Line([x, y - 0.85], [x, y + 0.1], { stroke: s.bad, strokeWidth: 0.06 }),
            label(f(r.due), x, y - 1.35, s.palette.ink, 0.65, `due:${i}`),
          );
        }
        return g;
      },
    },
    {
      id: 'reader-retries',
      title: 'How much retry time remains?',
      line: `${rule === 'fixed30' ? 'Fixed interval' : 'Lifetime fraction'}; two scheduled runs a day.`,
      caption: `The selected rule leaves ${f(selected.slack)} before expiry, allowing ${selected.retries} scheduled attempts at two runs a day. A shorter lifetime can increase renewal frequency while reducing recovery time after failure. ARI and the issuance limit are covered in the source walkthrough.`,
      values: { key, rule, retries: selected.retries, slack: selected.slack },
      draw: (s) =>
        bars(
          s,
          [
            { label: 'Time before renewal is due', value: selected.due, display: f(selected.due) },
            { label: 'Time left to retry', value: selected.slack, display: f(selected.slack) },
          ],
          life.hours,
        ),
    },
  ];
}
