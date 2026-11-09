import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf, loadSnapshots } from '../../../explain/testing.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';

const store = await loadSnapshots('scenes/explainers/traffic-policy');

const arch = (text: string): DiagramSnapshot => {
  const s = Object.values(store).find((x) => x.family === 'architecture' && x.spec.source.includes(text));
  assert.ok(s, `no pinned architecture diagram with ${text}`);
  return s;
};

// Cluster, 3, 1, 0: the only one with pods a, b, c on Node 1 and a second hop to pod d.
const CLUSTER_310 = 'align row a b c';

const withHop = () => Object.values(store).find((x) => x.spec.source.includes(CLUSTER_310) && x.spec.source.includes('k3:L --> R:d'))!;

// ---------------------------------------------------------------- architecture words (explain/diagrams.ts)

test('an architecture diagram counts services and edges, names edges by their services, and leaves none blank', async () => {
  arch(CLUSTER_310);
  const seen = (await diagramOf(withHop())).describe();
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

test('architecture services answer to their bare ids in walk and in get', async () => {
  const d = await diagramOf(withHop());
  await d.walk([
    ['lb', 'k3'],
    ['k3', 'd'],
  ]);
  assert.equal(d.get('k3'), d.get('service:k3'));
});

test('an architecture junction is scaffolding, named by its id', async () => {
  // The pinned diagram with Node 3's address redrawn as an unlabelled junction.
  const s: DiagramSnapshot = structuredClone(withHop());
  const k3 = s.parts.find((p) => p.id === 'service:k3')!;
  k3.id = 'junction:k3';
  k3.role = 'junction';
  k3.shapes = k3.shapes.filter((shape) => !shape.text);
  const seen = (await diagramOf(s)).describe();
  assert.equal(seen.what, 'Architecture diagram: 7 services, 8 edges');
  assert.equal(seen.blank, undefined);
  const names = seen.parts.map((p) => p.name);
  assert.ok(names.includes('junction k3'));
  assert.ok(names.includes('Load balancer → junction k3'));
});
