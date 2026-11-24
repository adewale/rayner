import { transfer, graph, run, name, structured } from './model.ts';
export const questions = {
 1: () => `Outside on, beside the whole machine: since the frother works whether the machine is off or on, it becomes a region next to the off-and-on machine, and the statechart’s top level splits in two. Flat, every one of the machine’s ${graph('parent').states.length} states pairs with still or frothing, off included: ${transfer.outside} states where the frother inside on needed ${transfer.inside}.`,
 2: () => `The names are off, idle, grinding, brewing · still, brewing · frothing and ready: ${transfer.steam} states. Only the brewing states have two words, so the words are not independent and the second sign does not apply. The frother goes inside brewing as a box of two states, which makes brewing a parent: the first idea again. The statechart draws ${structured.steam.arrows} transitions where the flat machine draws ${graph('steam').edges.length}.`,
 3: () => {
  if(name(run('frother',['POWER_OFF','POWER_ON'],['grinding','frothing']))!=='idle · still') throw new Error('Reset answer changed');
  return 'No. POWER_OFF is taken by on, which leaves both regions; POWER_ON enters on again, and each region starts at its start dot: idle and still. Nothing in the chart remembers where a region was when the machine went off.';
 },
};
