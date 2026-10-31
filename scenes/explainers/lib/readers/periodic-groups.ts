import { Group, Circle } from '../../../../src/index.ts';
import {
  atomicNumber,
  position,
  coreOf,
  listed,
  predicted,
  beyondCore,
  counted,
  configText,
  CAPACITY,
  symbolOf,
  NAMES,
} from '../periodic-groups.ts';
import type { Symbol } from '../periodic-groups.ts';
import { label, tile, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(symbol: Symbol): ReaderFrame[] {
  const z = atomicNumber(symbol),
    p = position(z),
    core = coreOf(z),
    actual = listed(z),
    past = beyondCore(actual, z),
    prediction = predicted(z),
    exception = configText(actual) !== configText(prediction);
  return [
    {
      id: 'reader-electrons',
      title: 'Which electrons count toward the group?',
      line: `${NAMES[symbol]}: atomic number ${z}.`,
      caption: `A neutral ${symbol} atom has ${z} electrons. ${core ? `${symbolOf(core)} accounts for the first ${core}. Count s, p and d electrons beyond that core, leaving f electrons out.` : 'With no earlier noble-gas core, both 1s electrons count.'} ${symbol === 'He' ? 'Its filled first shell places helium in group 18 despite that count of two.' : p.block === 'p' ? 'For this p-block element, adding 10 to the count gives the group number.' : 'For this s- or d-block element, the count gives the group number.'}`,
      values: { symbol, z, core, count: counted(actual, z), group: p.group },
      draw: (s) =>
        new Group(
          tile(core ? `${symbolOf(core)} core: ${core}` : 'No prior core', -3.9, 1.3, 6.6, 1.4, s),
          tile(`Beyond core: ${z - core}`, 3.9, 1.3, 6.6, 1.4, s, { active: true }),
          label(configText(past), 0, -1.2, s.palette.ink, 0.85, 'outer-configuration'),
          label(`Group count: ${counted(actual, z)}; column: ${p.group}`, 0, -3, s.palette.ink, 0.75, 'group-count'),
        ),
    },
    {
      id: 'reader-filling',
      title: exception ? 'Does the filling rule predict Cu?' : 'How does a subshell fill?',
      line: exception
        ? 'Compare the filling prediction with the captured reference.'
        : 'Each dot is one electron; outlines show the remaining capacity.',
      caption: exception
        ? `The filling rule predicts ${configText(beyondCore(prediction, z))} beyond the core; the reference lists ${configText(past)}. These configurations have the same s/p/d total here, so their group count agrees even though their subshell occupancies differ.`
        : `Filled dots are electrons; empty outlines are unused capacity. The capacities are 2 for s, 6 for p, 10 for d and 14 for f. ${symbol === 'He' ? 'Helium fills 1s and sits with the noble gases in group 18.' : 'The family comparison next relates this count to the table’s column.'}`,
      values: { symbol, prediction: configText(prediction), actual: configText(actual), exception },
      draw: (s) =>
        exception
          ? table(
              ['', 'Beyond core'],
              [
                ['Predicted', configText(beyondCore(prediction, z))],
                ['Reference', configText(past)],
              ],
              s,
              { xs: [-4.8, 3.2], y: 2, gap: 1.7 },
            )
          : new Group(
              ...past.map((sub, i) => {
                const y = 2 - i * 1.7,
                  n = CAPACITY[sub.l];
                return new Group(
                  label(`${sub.n}${sub.l}`, -6.6, y, s.palette.ink, 0.75),
                  ...Array.from({ length: n }, (_, j) =>
                    new Circle({
                      radius: 0.22,
                      fill: j < sub.electrons ? s.emphasis : s.palette.paper,
                      stroke: s.soft,
                      strokeWidth: 0.035,
                    }).moveTo([-4.8 + j * 0.8, y]),
                  ),
                );
              }),
            ),
    },
  ];
}
