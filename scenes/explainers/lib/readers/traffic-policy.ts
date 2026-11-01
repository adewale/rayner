import { Group, Circle } from '../../../../src/index.ts';
import { PLACEMENTS, nodeShares, shares, percent, podsOf, value } from '../traffic-policy.ts';
import type { PlacementKey, Policy } from '../traffic-policy.ts';
import { label, tile, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(key: PlacementKey, policy: Policy): ReaderFrame[] {
  const counts = PLACEMENTS[key],
    ns = nodeShares(counts, policy),
    pods = podsOf(counts),
    cluster = shares(counts, 'cluster'),
    local = shares(counts, 'local');
  return [
    {
      id: 'reader-nodes',
      title: 'Do equal node shares mean equal pod shares?',
      line: `${counts.join(' / ')} pods; externalTrafficPolicy ${policy}.`,
      caption: `Under ${policy}, the load balancer sends ${ns.map(percent).join(', ')} of traffic to the three nodes. Cluster can forward requests across nodes. Local excludes nodes without endpoints, then divides each included node’s share among its own pods.`,
      values: { key, policy, nodeShares: ns.map(value) },
      draw: (s) =>
        new Group(
          ...counts.map((n, i) => {
            const x = (i - 1) * 4.8;
            return new Group(
              tile(`Node ${i + 1}`, x, 2, 4.2, 1, s),
              label(percent(ns[i]!), x, 0.4, s.palette.ink, 0.8),
              label(`${n} pod${n === 1 ? '' : 's'}`, x, -1, s.palette.ink, 0.7),
              ...Array.from({ length: n }, (_, j) =>
                new Circle({ radius: 0.22, fill: s.emphasis, stroke: 'none' }).moveTo([
                  x + (j - (n - 1) / 2) * 0.65,
                  -2.3,
                ]),
              ),
            );
          }),
        ),
    },
    {
      id: 'reader-shares',
      title: 'Compare the share per pod',
      line: 'Same placement and outside traffic; only the policy changes.',
      caption:
        'Cluster spreads requests over all endpoints. Local divides each node’s share among its own pods, so fewer pods on a node can mean a larger share per pod. N1 means node 1. Each row keeps the pod’s placement fixed while comparing the two policies.',
      values: { cluster, local },
      draw: (s) =>
        table(
          ['Pod', 'Cluster', 'Local'],
          pods.map((p) => [`${p.id} / N${p.node + 1}`, percent(cluster[p.id]!), percent(local[p.id]!)]),
          s,
          { xs: [-5, -0.4, 5], y: 2.6, gap: 1.25 },
        ),
    },
  ];
}
