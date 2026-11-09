// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { frac, nodeShares, ruleShares, rules, shares, value } from './model.ts';

const FOUR_ONE = shares([4, 1, 0], 'local'),
  FOUR_ONE_NODES = nodeShares([4, 1, 0], 'local'),
  CHAIN4 = rules(['a', 'b', 'c', 'd']);
const EVEN4 = [0, 1, 2, 3, 4]
  .flatMap((x) => [0, 1, 2, 3, 4].map((y) => [x, y, 4 - x - y]))
  .filter((c) => c[2]! >= 0)
  .filter((c) => new Set(Object.values(shares(c, 'local')).map(frac)).size === 1);
const EVEN4_SHAPES = [...new Set(EVEN4.map((c) => [...c].sort((a, b) => b - a).join(', ')))];

export const questions = {
  1: () =>
    `Node 3 fails the health check, so Node 1 and Node 2 get ${frac(FOUR_ONE_NODES[0]!)} each. Node 2’s one pod keeps all of its ${frac(FOUR_ONE_NODES[1]!)}; Node 1 splits its ${frac(FOUR_ONE_NODES[0]!)} four ways, ${frac(FOUR_ONE.a!)} each. The lone pod gets ${value(FOUR_ONE.e!) / value(FOUR_ONE.a!)} times as many requests.`,
  2: () =>
    `${CHAIN4.map((r) => (r.probability ? `1/${Math.round(1 / Number(r.probability))}` : 'always')).join(', then ')}: each rule matches 1/(n−i) of the requests that reach it, so each pod gets ${frac(ruleShares(4)[0]!)} of what the node receives.`,
  3: () =>
    `Only ${EVEN4_SHAPES.join(' and ')}, in any order of the nodes. Under Local each healthy node gets an equal share and splits it among its own pods, so the shares are even exactly when every node with pods runs the same number.`,
};
