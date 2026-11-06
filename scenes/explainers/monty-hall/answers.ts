// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { percent } from '../lib/format.ts';
import { oddsAfter } from './model.ts';

const PRIOR = [4, 3, 3];

export const checks = {
  1: () =>
    `${percent(oddsAfter(0, 'coin', 'B').switchChance)}. His strip is the random host’s, cell for cell: with the car behind B or C, he opens each unchosen door half the time, so one of the two sixths in each wrong-pick third shows the car. He knows where the car is, but his rule gives each round the random host’s chance, and those chances set the odds.`,
  2: () =>
    `With the host who knows, ${percent(oddsAfter(0, 'informed', 'B', PRIOR).switchChance)}: the car-behind-A rounds now fill 40% of the strip and he opens B in half of them, 20%, while all of the car-behind-C rounds, 30%, open B. With the random host, ${percent(oddsAfter(0, 'random', 'B', PRIOR).switchChance)}: he opens B in only half of the car-behind-C rounds, 15%, against the same 20%.`,
};
