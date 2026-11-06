// The traffic-policy explainer's model, held to kube-proxy's own code and tests (kubernetes v1.37.1);
// and the words an architecture diagram's groups, services, junctions and edges get in a description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Scene } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { Diagram } from '../explain/diagrams.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { readSnapshots } from '../tools/lib/explain-project.ts';
import {
  PLACEMENTS,
  computeProbability,
  endpointsOn,
  flows,
  frac,
  nodeShares,
  passes,
  percent,
  podsOf,
  ruleShares,
  rules,
  secondHop,
  seenSource,
  shares,
  value,
} from '../scenes/explainers/traffic-policy/model.ts';
import type { PlacementKey, Policy } from '../scenes/explainers/traffic-policy/model.ts';

// pkg/proxy/iptables/proxier_test.go:2836-2845, TestComputeProbability's expected strings.
const UPSTREAM: Record<number, string> = {
  1: '1.0000000000',
  2: '0.5000000000',
  10: '0.1000000000',
  100: '0.0100000000',
  1000: '0.0010000000',
  10000: '0.0001000000',
  100000: '0.0000100000',
  100001: '0.0000099999',
};
// proxier.go:390-392 copied into a Go program and run with go1.27.3 darwin/arm64 on 2026-10-25.
// It and toFixed agree for every n from 1 to 2047; at 2048, 1/n is an exact tie at the tenth
// decimal and Go rounds it to even ("0.0004882812") where toFixed rounds up. The scene uses n <= 4.
const GO_RUN: Record<number, string> = {
  3: '0.3333333333',
  4: '0.2500000000',
  6: '0.1666666667',
  7: '0.1428571429',
  12: '0.0833333333',
  2047: '0.0004885198',
};

test('computeProbability formats 1/n as kube-proxy does', () => {
  for (const [n, expected] of Object.entries({ ...UPSTREAM, ...GO_RUN })) assert.equal(computeProbability(Number(n)), expected, `n = ${n}`);
});

test('the chain for two endpoints is the rule pair in kube-proxy’s own expected output', () => {
  // proxier_test.go:816-817, the KUBE-SVC chain of ns4/svc4, which has two endpoints.
  const expected = [
    '-A KUBE-SVC-4SW47YFZTEDKD3PK -m comment --comment ns4/svc4:p80 -m statistic --mode random --probability 0.5000000000 -j KUBE-SEP-UKSFD7AGPMPPLUHC',
    '-A KUBE-SVC-4SW47YFZTEDKD3PK -m comment --comment ns4/svc4:p80 -j KUBE-SEP-C6EBXVWJJZMIWKLZ',
  ];
  const written = rules(['KUBE-SEP-UKSFD7AGPMPPLUHC', 'KUBE-SEP-C6EBXVWJJZMIWKLZ']).map(
    (r) =>
      '-A KUBE-SVC-4SW47YFZTEDKD3PK -m comment --comment ns4/svc4:p80' +
      (r.probability ? ` -m statistic --mode random --probability ${r.probability}` : '') +
      ` -j ${r.pod}`,
  );
  assert.deepEqual(written, expected);
});

test('three endpoints get 1/3, then 1/2, then a rule that always matches', () => {
  assert.deepEqual(
    rules(['a', 'b', 'c']).map((r) => r.probability),
    ['0.3333333333', '0.5000000000', null],
  );
  assert.deepEqual(rules(['a', 'b', 'c', 'd']).map((r) => r.probability), ['0.2500000000', '0.3333333333', '0.5000000000', null]);
});

test('every rule in a chain of n wins 1/n of the time, read from the written probabilities', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 60 }), (n) => {
      const written = rules(Array.from({ length: n }, (_, i) => String(i)));
      // Evaluate the chain as iptables does, from the strings: a rule is tried only if all before it missed.
      let missed = 1;
      for (const r of written) {
        const p = r.probability == null ? 1 : Number(r.probability);
        assert.ok(Math.abs(missed * p - 1 / n) < 1e-8, `n = ${n}`);
        missed *= 1 - p;
      }
      assert.ok(Math.abs(missed) < 1e-9);
      // And the exact fractions the scene shows.
      assert.ok(ruleShares(n).every((s) => frac(s) === `1/${n}` || (n === 1 && frac(s) === '1')));
    }),
    params(200),
  );
});

// Recomputed by hand: under Local the load balancer gives each node with a pod an equal share, and the
// node splits it evenly over its own pods; under Cluster every node splits its third over all pods.
const EXPECTED: Record<`${Policy} ${PlacementKey}`, { shares: string[]; percent: string[]; hop: string; passes: boolean[] }> = {
  'local 3-1-0': { shares: ['1/6', '1/6', '1/6', '1/2'], percent: ['16.7%', '16.7%', '16.7%', '50%'], hop: '0', passes: [true, true, false] },
  'cluster 3-1-0': { shares: ['1/4', '1/4', '1/4', '1/4'], percent: ['25%', '25%', '25%', '25%'], hop: '2/3', passes: [true, true, true] },
  'local 2-2-0': { shares: ['1/4', '1/4', '1/4', '1/4'], percent: ['25%', '25%', '25%', '25%'], hop: '0', passes: [true, true, false] },
  'cluster 2-2-0': { shares: ['1/4', '1/4', '1/4', '1/4'], percent: ['25%', '25%', '25%', '25%'], hop: '2/3', passes: [true, true, true] },
  'local 1-1-1': { shares: ['1/3', '1/3', '1/3'], percent: ['33.3%', '33.3%', '33.3%'], hop: '0', passes: [true, true, true] },
  'cluster 1-1-1': { shares: ['1/3', '1/3', '1/3'], percent: ['33.3%', '33.3%', '33.3%'], hop: '2/3', passes: [true, true, true] },
};

test('each scenario’s pod shares, second hops and health checks', () => {
  for (const [name, want] of Object.entries(EXPECTED)) {
    const [policy, key] = name.split(' ') as [Policy, PlacementKey];
    const counts = PLACEMENTS[key];
    const s = shares(counts, policy);
    const ids = podsOf(counts).map((p) => p.id);
    assert.deepEqual(ids.map((id) => frac(s[id]!)), want.shares, name);
    assert.deepEqual(ids.map((id) => percent(s[id]!)), want.percent, name);
    assert.equal(frac(secondHop(counts, policy)), want.hop, name);
    assert.deepEqual(counts.map((_, j) => passes(counts, policy, j)), want.passes, name);
  }
  assert.equal(seenSource('cluster', 2), '10.240.0.3');
  assert.equal(seenSource('local', 0), '198.51.100.79');
});

const placements = fc
  .array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 6 })
  .filter((c) => c.some((n) => n > 0));

// proxier.go:1104-1110 marks every packet of a Cluster external chain for masquerade, "in case we cross
// nodes"; under Local no masquerade rule applies (1112-1146). So the pod sees the entry node's address under
// Cluster whichever node it runs on, the same node included, and the client's under Local.
test('under Cluster every outside request is source-NATed to its entry node; under Local none is', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 5 }), (node) => {
      assert.equal(seenSource('cluster', node), `10.240.0.${node + 1}`);
      assert.equal(seenSource('local', node), '198.51.100.79');
    }),
    params(50),
  );
});

test('for any placement, the shares sum to 1 and follow each policy’s rule', () => {
  fc.assert(
    fc.property(placements, (counts) => {
      const total = counts.reduce((a, b) => a + b, 0);
      const healthy = counts.filter((n) => n > 0).length;
      for (const policy of ['cluster', 'local'] as const) {
        const s = shares(counts, policy);
        const sum = Object.values(s).reduce((a, x) => a + value(x), 0);
        assert.ok(Math.abs(sum - 1) < 1e-12);
        assert.ok(Math.abs(nodeShares(counts, policy).reduce((a, x) => a + value(x), 0) - 1) < 1e-12);
        for (const p of podsOf(counts)) {
          // Cluster: 1/N for every pod. Local: 1/(healthy nodes × pods on its node).
          const want = policy === 'cluster' ? 1 / total : 1 / (healthy * counts[p.node]!);
          assert.ok(Math.abs(value(s[p.id]!) - want) < 1e-12, `${policy} ${counts} ${p.id}`);
        }
        counts.forEach((_, j) => {
          const eps = endpointsOn(counts, policy, j);
          // Enumerate IDs from the placement input, not podsOf/endpointsOn.
          let next = 0;
          const expected = counts.flatMap((count, node) =>
            Array.from({ length: count }, () => ({ id: String.fromCharCode(97 + next++), node })),
          ).filter((pod) => policy === 'cluster' || pod.node === j);
          assert.deepEqual(eps, expected, `${policy} endpoints on node ${j}: ${counts}`);
        });
      }
      // Under Cluster a request leaves its node unless the pick runs there: 1 − 1/nodes overall.
      assert.equal(value(secondHop(counts, 'cluster')), (counts.length - 1) / counts.length);
      assert.equal(value(secondHop(counts, 'local')), 0);
    }),
    params(300),
  );
});

test('traffic-policy flow view: each band is a node’s share times its rule’s share, and only Cluster’s bands cross nodes', () => {
  fc.assert(
    fc.property(placements, (counts) => {
      for (const policy of ['cluster', 'local'] as const) {
        const f = flows(counts, policy);
        const pods = podsOf(counts);
        // Summed into each pod, the bands are its share; summed out of each node, the node's share.
        for (const p of pods) {
          const into = f.filter((b) => b.pod === p.id).reduce((a, b) => a + value(b.share), 0);
          assert.ok(Math.abs(into - value(shares(counts, policy)[p.id]!)) < 1e-12, `${policy} ${counts} into ${p.id}`);
        }
        counts.forEach((_, j) => {
          const out = f.filter((b) => b.node === j).reduce((a, b) => a + value(b.share), 0);
          assert.ok(Math.abs(out - value(nodeShares(counts, policy)[j]!)) < 1e-12, `${policy} ${counts} out of node ${j}`);
        });
        // A band that lands on another node's pod is a second hop.
        const away = f.filter((b) => pods.find((p) => p.id === b.pod)!.node !== b.node).reduce((a, b) => a + value(b.share), 0);
        assert.ok(Math.abs(away - value(secondHop(counts, policy))) < 1e-12, `${policy} ${counts} crossing bands`);
        assert.ok(f.every((b) => value(b.share) > 0));
      }
    }),
    params(300),
  );
  // The default scenario: under Local, Node 2's whole half is one band into pod d, three times as wide as each of Node 1's.
  const local = flows([3, 1, 0], 'local');
  assert.deepEqual(local.map((b) => [b.node, b.pod, frac(b.share)]), [[0, 'a', '1/6'], [0, 'b', '1/6'], [0, 'c', '1/6'], [1, 'd', '1/2']]);
  const cl = flows([3, 1, 0], 'cluster');
  assert.equal(cl.length, 12);
  assert.ok(cl.every((b) => frac(b.share) === '1/12'));
});

// ---------------------------------------------------------------- architecture words (explain/diagrams.ts)
await loadFonts();
const store = await readSnapshots('scenes/explainers/traffic-policy/scene');
const arch = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'architecture' && x.spec.source.includes(text));
  assert.ok(s, `no pinned architecture diagram with ${text}`);
  return s;
};
// Cluster, 3, 1, 0: the only one with pods a, b, c on Node 1 and a second hop to pod d.
const CLUSTER_310 = 'align row a b c';
const withHop = () => Object.values(store).find((x) => x.spec.source.includes(CLUSTER_310) && x.spec.source.includes('k3:L --> R:d'))!;
async function shown(s: DiagramSnapshot) {
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d;
}

test('an architecture diagram counts services and edges, names edges by their services, and leaves none blank', async () => {
  arch(CLUSTER_310);
  const seen = (await shown(withHop())).describe();
  assert.equal(seen.what, 'Architecture diagram: 8 services, 8 edges');
  assert.equal(seen.blank, undefined);
  const names = seen.parts.map((p) => p.name);
  for (const name of [
    'Load balancer',
    'Node 3 · 10.240.0.3',
    'Pod d',
    'Load balancer → Node 1 · 10.240.0.1',
    'Node 1 · 10.240.0.1 → Pod a',
    'Node 3 · 10.240.0.3 → Pod d',
  ])
    assert.ok(names.includes(name), `${name} in ${names.join(' | ')}`);
  // Services are read before the edges that leave them.
  assert.ok(names.indexOf('Load balancer') < names.indexOf('Load balancer → Node 1 · 10.240.0.1'));
});

test('architecture services answer to their bare ids in walk, dim and mark', async () => {
  const d = await shown(withHop());
  await d.walk([
    ['lb', 'k3'],
    ['k3', 'd'],
  ]);
  await d.dim(['lb', 'k3']);
  // The edge between two kept services stays undimmed; one to a dimmed pod does not.
  const parts = d.describe().parts;
  assert.equal(parts.find((p) => p.name === 'Load balancer → Node 3 · 10.240.0.3')?.dimmed, undefined);
  assert.equal(parts.find((p) => p.name === 'Node 3 · 10.240.0.3 → Pod d')?.dimmed, true);
  await d.mark(['group:n3', 'k3'], { as: 'fails the health check' });
  assert.equal(d.get('k3'), d.get('service:k3'));
});

test('an architecture junction is scaffolding, named by its id', async () => {
  // The pinned diagram with Node 3's address redrawn as an unlabelled junction.
  const s: DiagramSnapshot = structuredClone(withHop());
  const k3 = s.parts.find((p) => p.id === 'service:k3')!;
  k3.id = 'junction:k3';
  k3.role = 'junction';
  k3.shapes = k3.shapes.filter((shape) => !shape.text);
  const seen = (await shown(s)).describe();
  assert.equal(seen.what, 'Architecture diagram: 7 services, 8 edges');
  assert.equal(seen.blank, undefined);
  const names = seen.parts.map((p) => p.name);
  assert.ok(names.includes('junction k3'));
  assert.ok(names.includes('Load balancer → junction k3'));
});
