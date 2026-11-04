import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import {
  PLACEMENTS,
  endpointsOn,
  flows,
  frac,
  nodeShares,
  passes,
  podsOf,
  ruleShares,
  rules,
  secondHop,
  seenSource,
  shares,
} from '../../../scenes/explainers/lib/traffic-policy.ts';
import type { PlacementKey, Policy } from '../../../scenes/explainers/lib/traffic-policy.ts';

/** Every case's step state equals the model's answers for its policy and placement. */
export function check(trace: Trace, values: Record<string, string>): void {
  const policy = values.policy as Policy,
    counts = PLACEMENTS[values.pods as PlacementKey];
  const ids = podsOf(counts).map((p) => p.id);
  const table = (p: Policy) => {
    const s = shares(counts, p);
    return Object.fromEntries(ids.map((id) => [id, frac(s[id]!)]));
  };
  assertStepState(trace, 'topology', { placement: [...counts] });
  // The chain shown is Node 1's: every pod under Cluster, Node 1's own under Local.
  const chain = endpointsOn(counts, policy, 0).map((p) => p.id);
  assertStepState(trace, 'rules', {
    chain: rules(chain).map((r) => r.probability),
    chainShares: ruleShares(chain.length).map(frac),
  });
  if (policy === 'cluster') {
    assertStepState(trace, 'second-hop', { secondHop: frac(secondHop(counts, 'cluster')) });
    assertStepState(trace, 'snat', { seen: seenSource('cluster', 2) });
  } else {
    assertStepState(trace, 'health', { passes: counts.map((_, j) => passes(counts, 'local', j)) });
    assertStepState(trace, 'local-path', { seen: seenSource('local', 0) });
  }
  assertStepState(trace, 'shares', { shares: table(policy) });
  // The flow picture: each policy's node shares and every band, node to pod, as wide as its share.
  const NODE = ['Node 1', 'Node 2', 'Node 3'];
  const flow = (p: Policy) => ({
    nodes: nodeShares(counts, p).map(frac),
    bands: flows(counts, p).map((b) => [NODE[b.node], b.pod, frac(b.share)]),
  });
  assertStepState(trace, 'flow', { flow: { cluster: flow('cluster'), local: flow('local') } });
  assertStepState(trace, 'compare', { compare: { cluster: table('cluster'), local: table('local') } });
}
