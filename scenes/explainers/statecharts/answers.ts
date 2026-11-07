// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { FROTHER, RUNS, chartCounts, coffee, coffeeWithFrother, flatCounts, flatten, run } from './model.ts';
import type { StateNode } from './model.ts';

// The check questions' machines, as the scene built them: no step draws them.
const atomic = (id: string, on?: Record<string, string>): StateNode => ({ id, type: 'atomic', ...(on ? { on } : {}) });
const frotherRegion = (): StateNode => ({
  id: FROTHER.region,
  type: 'compound',
  initial: FROTHER.states[0],
  children: [atomic(FROTHER.states[0], { [FROTHER.events[0]]: FROTHER.states[1] }), atomic(FROTHER.states[1], { [FROTHER.events[1]]: FROTHER.states[0] })],
});
/** The frother as a region beside the whole machine, outside on. */
export const frotherOutside = (): StateNode => ({ id: 'kit', type: 'parallel', children: [coffee(), frotherRegion()] });
/** The frother as a box of two states inside brewing. */
export const frotherInBrewing = (): StateNode => {
  const swap = (n: StateNode): StateNode =>
    n.id === 'brewing' ? { ...frotherRegion(), id: 'brewing', on: n.on } : { ...n, ...(n.children ? { children: n.children.map(swap) } : {}) };
  return swap(coffee());
};
const CHECKS = {
  machine: flatten(coffee()).states.length,
  inside: flatCounts(flatten(coffeeWithFrother())),
  outside: flatCounts(flatten(frotherOutside())),
  steam: { flat: flatCounts(flatten(frotherInBrewing())), chart: chartCounts(frotherInBrewing()) },
  again: run(coffeeWithFrother(), [...RUNS.frother, 'POWER_ON']).at(-1)!.config,
};

export const checks = {
  1: () =>
    `Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s ${CHECKS.machine} states pairs with still or frothing, off included: ${CHECKS.outside.states} states where the frother inside on needed ${CHECKS.inside.states}.`,
  2: () =>
    `The names are off, idle, grinding, brewing · still, brewing · frothing and ready: ${CHECKS.steam.flat.states} states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws ${CHECKS.steam.chart.transitions} transitions where the flat machine draws ${CHECKS.steam.flat.transitions}.`,
  3: () =>
    `No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: ${CHECKS.again.join(' and ')}. Nothing in the chart remembers where a region was when the machine went off.`,
};
