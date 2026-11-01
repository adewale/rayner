// The explain package's own contracts that are not a Diagram's or a panel's:
// the stage's palette and evidence, snapshot validation and resolution
// (integrations/agentic-mermaid/snapshot.ts), the colours and regions in
// explain/look.ts, and the HTML escaping in explain/trace.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, NullSink, traceScene, loadFonts } from '../src/index.ts';
import { stage, bindSnapshots, findingsOf, edgePartOf, regionBox, REGIONS } from '../explain/index.ts';
import { diagramKey, snapshotResolver, useDiagrams, diagramsOf, RENDERER } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { raised, rule, emphasis, soft, good, bad, dimOpacity } from '../explain/look.ts';
import { PALETTES, palette } from '../explain/palettes.ts';
import { Diagram } from '../explain/diagrams.ts';
import { htmlEscape } from '../explain/trace.ts';
import { parseColor, lerpColor } from '../src/color.ts';
import { fc, params } from './lib/pbt.ts';
import { snapshot as randomSnapshot, hexColor, fixedSnapshot, square } from './lib/random-snapshot.ts';

// Imported labels are outlined with the embedded fonts.
await loadFonts();

const spec = { source: 'graph LR\nA -->|hello| B', style: 'nord' };
function fixture(): DiagramSnapshot {
  const shape = (x: number) => square(x, { fill: '#fff', stroke: '#000' });
  return fixedSnapshot(
    spec,
    [
      { id: '__frame', role: 'frame', kind: 'shape', shapes: [shape(0)] },
      { id: 'A', role: 'node', kind: 'shape', shapes: [shape(0)] },
      { id: 'B', role: 'node', kind: 'shape', shapes: [shape(3)] },
      {
        id: 'edge:A->B#0',
        role: 'edge',
        kind: 'connector',
        shapes: [shape(1)],
        from: 'A',
        to: 'B',
        route: [
          [0.25, 0],
          [2.75, 0],
        ],
      },
      { id: 'edge-label:A->B#0', owner: 'edge:A->B#0', role: 'edge-label', kind: 'text', shapes: [shape(1.5)] },
    ],
    { palette: { paper: '#123456', ink: '#fff', accent: '#ff0', muted: '#aaa' } },
  );
}

// ---- explain/stage.ts ------------------------------------------------------------

test('a stage with no style takes its first diagram’s paper; hidden parts stay off stage; walks outlive a replaced state', async () => {
  class Demo extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('frame');
      const d = await s.show(spec, { build: 'frame' });
      assert.equal(s.paper.style.fill, '#123456');
      // The camera can frame a part that is not drawn yet without drawing it.
      await d.focus(['A']);
      assert.ok(!this.familyMembers().some((m) => m.key === 'A'));
      await d.reveal(['A', 'B', 'edge:A->B#0']);
      assert.equal(d.get('edge-label:A->B#0').parent, d.get('edge:A->B#0'), 'a link carries the label it owns');
      await d.walk([['A', 'B']]);
      this.state = { answer: 42 }; // Model replacement must not erase helper evidence.
    }
  }
  const trace = await traceScene(bindSnapshots(Demo, { [diagramKey(spec)]: fixture() }));
  assert.deepEqual(trace.steps[0]!.after!.walks, [{ step: 'frame', from: 'A', to: 'B', edge: 'edge:A->B#0' }]);
  assert.equal(trace.steps[0]!.after!.answer, 42);
});

// ---- integrations/agentic-mermaid/snapshot.ts ------------------------------------

test('snapshot JSON with a corrupt point, paint, owner, path, size, finding or chart value is refused, as is one stored under another source', async () => {
  const good = fixture();
  assert.equal(await snapshotResolver({ [diagramKey(spec)]: good }).diagram(spec), good);
  const corruptions = [
    (s: DiagramSnapshot) => {
      s.parts[0]!.shapes[0]!.subpaths[0]![0] = null as unknown as number;
    },
    (s: DiagramSnapshot) => {
      s.parts[0]!.shapes[0]!.style.fill = 'url(https://outside.test/image)';
    },
    (s: DiagramSnapshot) => {
      s.parts[0]!.owner = s.parts[0]!.id;
    },
    (s: DiagramSnapshot) => {
      s.parts[0]!.shapes[0]!.closed = [];
    },
    (s: DiagramSnapshot) => {
      s.width = Infinity;
    },
    (s: DiagramSnapshot) => {
      s.findings = { warnings: [] } as unknown as DiagramSnapshot['findings'];
    },
    (s: DiagramSnapshot) => {
      s.findings.warnings = [{ edge: 'A->B#0' } as unknown as DiagramSnapshot['findings']['warnings'][number]];
    },
    (s: DiagramSnapshot) => {
      s.findings.layout = { edges: [{ from: 'A' } as { from: string; to: string }] };
    },
    (s: DiagramSnapshot) => {
      s.chart = { series: [{ kind: 'bar', values: [1, null as unknown as number] }] };
    },
  ];
  for (const corrupt of corruptions) {
    const broken = JSON.parse(JSON.stringify(good));
    corrupt(broken);
    await assert.rejects(snapshotResolver({ [diagramKey(spec)]: broken }).diagram(spec), /Invalid diagram snapshot/);
  }
  await assert.rejects(
    snapshotResolver({ [diagramKey(spec)]: { ...good, spec: { source: 'graph LR\\nX-->Y' } } }).diagram(spec),
    /does not match/,
  );
});

test('marker carriers require an explicit semantic connector owner with identical endpoints', async () => {
  const good = fixture();
  good.parts.push({
    ...structuredClone(good.parts.find((p) => p.id === 'edge:A->B#0')!),
    id: 'marker-overlay:0', role: 'chrome', owner: 'edge:A->B#0', markerCarrier: true,
  });
  assert.equal(await snapshotResolver({ [diagramKey(spec)]: good }).diagram(spec), good);
  const corruptions: [string, (s: DiagramSnapshot) => void][] = [
    ...[false, null, 1, 'true', new Boolean(true), {}].map((flag): [string, (s: DiagramSnapshot) => void] => [
      `flag ${String(flag)}`, (s) => { s.parts.at(-1)!.markerCarrier = flag as true; },
    ]),
    ['missing owner', (s) => { delete s.parts.at(-1)!.owner; }],
    ['missing owner part', (s) => { s.parts.at(-1)!.owner = 'missing'; }],
    ['self owner', (s) => { s.parts.at(-1)!.owner = 'marker-overlay:0'; }],
    ['nonconnector carrier', (s) => { s.parts.at(-1)!.kind = 'shape'; }],
    ['nonconnector owner', (s) => { s.parts.at(-1)!.owner = 'A'; }],
    ['another marker carrier as owner', (s) => {
      s.parts.push({ ...structuredClone(s.parts.at(-1)!), id: 'marker-overlay:1', owner: 'marker-overlay:0' });
    }],
    ['missing from', (s) => { delete s.parts.at(-1)!.from; }],
    ['missing to', (s) => { delete s.parts.at(-1)!.to; }],
    ['empty from', (s) => { s.parts.at(-1)!.from = ''; }],
    ['empty to', (s) => { s.parts.at(-1)!.to = ''; }],
    ['different from', (s) => { s.parts.at(-1)!.from = 'B'; }],
    ['different to', (s) => { s.parts.at(-1)!.to = 'A'; }],
  ];
  for (const [name, corrupt] of corruptions) {
    const broken = structuredClone(good);
    corrupt(broken);
    await assert.rejects(snapshotResolver({ [diagramKey(spec)]: broken }).diagram(spec), /Invalid diagram snapshot/, name);
  }
});

const specArb = fc.record(
  {
    source: fc.oneof(fc.string({ maxLength: 12 }), fc.constantFrom('graph LR\nA-->B', 'a', ' a ', 'a\r\nb', 'a\nb', 'a\rb')),
    style: fc.constantFrom('default', 'nord', ''),
  },
  { requiredKeys: ['source'] },
);

test('diagramKey ignores CRLF, surrounding space, and the default style however it is written', () => {
  fc.assert(
    fc.property(specArb, fc.constantFrom('', ' ', '\n', '\r\n', '\t '), fc.constantFrom('default', '', undefined), (spec, pad, unstyled) => {
      const variant = { ...spec, source: pad + spec.source.replace(/\r?\n/g, '\r\n') + pad };
      // The default style is the same render whether named, empty or absent.
      if (spec.style === 'default' || spec.style === '') {
        if (unstyled === undefined) delete (variant as { style?: string }).style;
        else variant.style = unstyled;
      }
      assert.equal(diagramKey(variant as never), diagramKey(spec as never));
    }),
    params(),
  );
});

type Written = { source: string; style?: string };
test('diagramKey tells apart specs that differ in source or style', () => {
  const styles = ['nord', 'dusk', 'blueprint'];
  fc.assert(
    fc.property(
      specArb,
      fc.oneof(
        // Another word on the source survives trimming and line-ending changes.
        fc.stringMatching(/^[A-Za-z0-9>-]{1,4}$/).map((w) => (s: Written) => ({ ...s, source: s.source + '\n' + w })),
        fc.constantFrom(...styles).map((style) => (s: Written) => ({ ...s, style: styles.includes(s.style ?? '') ? styles[(styles.indexOf(s.style!) + 1) % 3] : style })),
      ),
      (spec, change) => {
        assert.notEqual(diagramKey(change(spec as never) as never), diagramKey(spec as never));
      },
    ),
    params(),
  );
});

test('a valid snapshot resolves to itself, for every spelling of its spec and after a JSON round trip', async () => {
  await fc.assert(
    fc.asyncProperty(randomSnapshot('graph LR\nA-->B'), fc.constantFrom('', ' ', '\r\n'), fc.boolean(), async (s, pad, json) => {
      const stored = json ? JSON.parse(JSON.stringify(s)) : s;
      const resolver = snapshotResolver({ [diagramKey(s.spec)]: stored });
      assert.equal(await resolver.diagram({ ...s.spec, source: pad + s.spec.source.replace(/\n/g, '\r\n') + pad }), stored);
    }),
    params(),
  );
});

/** Every path to a value in a JSON tree. */
function paths(value: unknown, at: (string | number)[] = []): (string | number)[][] {
  const out = [at];
  if (Array.isArray(value)) value.forEach((v, i) => out.push(...paths(v, [...at, i])));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) out.push(...paths(v, [...at, k]));
  return out;
}
const mutated = randomSnapshot('graph LR\nA-->B').chain((s) => {
  const all = paths(s).filter((p) => p.length > 0);
  return fc.tuple(
    fc.constant(s),
    fc.constantFrom(...all),
    fc.oneof(fc.jsonValue(), fc.constantFrom(null, undefined, NaN, Infinity, -1, '', 'red', '#12', '4,2', '-1', {}, [], [[1]], 'ab', 5)),
  );
});
type Mutation = typeof mutated extends fc.Arbitrary<infer Value> ? Value : never;
const mutate = (s: DiagramSnapshot, path: (string | number)[], value: unknown) => {
  const copy = JSON.parse(JSON.stringify(s));
  let at = copy;
  for (const k of path.slice(0, -1)) at = at[k];
  at[path.at(-1)!] = value;
  return copy as DiagramSnapshot;
};

test('a snapshot with any one field replaced is accepted or refused with the documented error, never a TypeError', async () => {
  await fc.assert(
    fc.asyncProperty(mutated, async ([s, path, value]) => {
      const broken = mutate(s, path, value);
      const key = diagramKey(s.spec);
      try {
        await snapshotResolver({ [key]: broken }).diagram(s.spec);
      } catch (error) {
        assert.match((error as Error).message, /^(Invalid diagram snapshot|Snapshot source does not match)/, `${path.join('.')} = ${JSON.stringify(value)}`);
      }
    }),
    params(),
  );
});

test('whatever the validator accepts, a Diagram can draw and describe without invalid values', async () => {
  await fc.assert(
    fc.asyncProperty(mutated, async ([s, path, value]) => {
      const broken = mutate(s, path, value);
      let ok: DiagramSnapshot;
      try {
        ok = await snapshotResolver({ [diagramKey(s.spec)]: broken }).diagram(s.spec);
      } catch (error) {
        assert.match((error as Error).message, /^(Invalid diagram snapshot|Snapshot source does not match)/);
        return;
      }
      const scene = new Scene(new NullSink(), { skipUntil: Infinity });
      const d = new Diagram(scene, ok.spec, ok, { box: 'side' });
      await d.build();
      await d.focus('all');
      for (const p of d.describe().parts) assert.equal(typeof p.name, 'string');
      for (const p of d.parts.values())
        for (const m of p.mob.family()) {
          for (const a of m.pointArrays()) assert.ok(a.every(Number.isFinite), `${path.join('.')} = ${JSON.stringify(value)}: point`);
          assert.ok(!/NaN/.test(JSON.stringify(m.style) + String(m.style.dashArray)), `${path.join('.')} = ${JSON.stringify(value)}: ${JSON.stringify(m.style)}`);
        }
    }),
    params<[Mutation]>(300, { examples: ['valueOf', 'constructor', '__proto__', 'toString', 'hasOwnProperty'].map((family): [Mutation] => [[fixture(), ['family'], family]]) }),
  );
});

test('a hidden diagram leaves the stage, so nothing describes it, and reveal brings it back', async () => {
  const s = fixture();
  const ok = await snapshotResolver({ [diagramKey(s.spec)]: s }).diagram(s.spec);
  const scene = new Scene(new NullSink(), { skipUntil: Infinity });
  const d = new Diagram(scene, ok.spec, ok, { box: 'side' });
  await d.build();
  assert.ok(scene.mobjects.includes(d.root));
  await d.hide();
  assert.ok(!scene.mobjects.includes(d.root));
  await d.reveal(['A']);
  assert.ok(scene.mobjects.includes(d.root));
});

test('a canvas so large the diagram fits to a point still draws finite points (CI counterexample)', async () => {
  const s = { ...fixture(), width: 129312739843.01703 };
  const ok = await snapshotResolver({ [diagramKey(s.spec)]: s }).diagram(s.spec);
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), ok.spec, ok, { box: 'side' });
  await d.build();
  await d.focus('all');
  for (const p of d.parts.values()) for (const m of p.mob.family()) for (const a of m.pointArrays()) assert.ok(a.every(Number.isFinite));
});

test('a label width beyond float32 is refused, not drawn as Infinity (property counterexample)', async () => {
  const style = { fill: '#000', stroke: 'none', fillOpacity: 1, strokeOpacity: 1, opacity: 1, strokeWidth: 0 };
  const run = { text: 'A', x: 0, y: 0, size: 11, anchor: 'start', matrix: [1, 0, 0, 1, 0, 0] };
  const withLabel = (width: number) => {
    const s = fixture();
    s.parts[1]!.shapes.push({ subpaths: [], closed: [], style, text: 'A', fontSize: 0.11, textRun: { ...run, width } } as never);
    return snapshotResolver({ [diagramKey(s.spec)]: s }).diagram(s.spec);
  };
  await withLabel(24);
  await assert.rejects(withLabel(3.4028235677973366e38), /Invalid diagram snapshot/);
});

test('resolving a snapshot never changes it', async () => {
  await fc.assert(
    fc.asyncProperty(randomSnapshot(), async (s) => {
      const before = JSON.stringify(s);
      await snapshotResolver({ [diagramKey(s.spec)]: s }).diagram(s.spec);
      assert.equal(JSON.stringify(s), before);
    }),
    params(),
  );
});

// An empty owner named no part, yet reveal read it as one (a FULL=1 counterexample): it is a dangling owner.
test('ownership cycles, and owners that are empty or name no part, are refused', async () => {
  await fc.assert(
    fc.asyncProperty(
      randomSnapshot()
        .filter((s) => s.parts.length > 0)
        .chain((s) => fc.tuple(fc.constant(s), fc.array(fc.nat(), { minLength: 1, maxLength: 4 }), fc.boolean(), fc.oneof(fc.constant(''), fc.string()))),
      async ([s, chain, dangling, ghost]) => {
        const copy: DiagramSnapshot = JSON.parse(JSON.stringify(s));
        const ids = chain.map((i) => copy.parts[i % copy.parts.length]!);
        if (dangling) {
          fc.pre(!copy.parts.some((p) => p.id === ghost));
          ids[0]!.owner = ghost;
        } else ids.forEach((p, i) => (p.owner = ids[(i + 1) % ids.length]!.id));
        await assert.rejects(snapshotResolver({ [diagramKey(s.spec)]: copy }).diagram(s.spec), /Invalid diagram snapshot/);
      },
    ),
    params(),
  );
});

test('a missing snapshot is refused', async () => {
  await fc.assert(
    fc.asyncProperty(randomSnapshot(), fc.array(randomSnapshot('other'), { maxLength: 2 }), async (s, others) => {
      const store = Object.fromEntries(others.map((o) => [diagramKey(o.spec), o]));
      fc.pre(!(diagramKey(s.spec) in store));
      await assert.rejects(snapshotResolver(store).diagram(s.spec), /Missing diagram snapshot/);
    }),
    params(),
  );
});

test('a snapshot stored under another spec is refused', async () => {
  await fc.assert(
    fc.asyncProperty(randomSnapshot(), specArb, async (s, other) => {
      fc.pre(diagramKey(other as never) !== diagramKey(s.spec));
      await assert.rejects(snapshotResolver({ [diagramKey(other as never)]: s }).diagram(other as never), /does not match/);
    }),
    params(),
  );
});

test('diagramsOf returns the resolver last bound to that scene, and refuses an unbound scene', () => {
  fc.assert(
    fc.property(fc.array(fc.nat({ max: 3 }), { maxLength: 10 }), (binds) => {
      const scenes = Array.from({ length: 4 }, () => new Scene(new NullSink()));
      const last = new Map<Scene, unknown>();
      for (const i of binds) {
        const r = snapshotResolver({});
        useDiagrams(scenes[i]!, r);
        last.set(scenes[i]!, r);
      }
      for (const scene of scenes)
        if (last.has(scene)) assert.equal(diagramsOf(scene), last.get(scene));
        else assert.throws(() => diagramsOf(scene), /No diagram snapshots/);
    }),
    params(),
  );
});

/** A multigraph in global edge order, its per-pair part ids, and the verifier's layout. */
const multigraph = fc
  .tuple(fc.uniqueArray(fc.oneof(fc.stringMatching(/^[A-Za-z]{1,3}$/), fc.constantFrom('a->b', 'x#1', 'n-1', '#')), { minLength: 1, maxLength: 4 }), fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 10 }), fc.boolean())
  .map(([nodes, pairs, layout]) => {
    const edges = pairs.map(([a, b]) => ({ from: nodes[a % nodes.length]!, to: nodes[b % nodes.length]! }));
    const seen = new Map<string, number>();
    const ids = edges.map((e) => {
      const k = `${e.from}->${e.to}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return `edge:${k}#${n}`;
    });
    const parts = edges.map((e, i) => ({ id: ids[i]!, role: 'edge', kind: 'connector', shapes: [], from: e.from, to: e.to }));
    const s = { parts, findings: { ok: true, warnings: [], ...(layout ? { layout: { edges } } : {}) } } as unknown as DiagramSnapshot;
    return { s, edges, ids };
  });

test('edgePartOf names the part of the k-th edge, with or without the verifier layout', () => {
  fc.assert(
    fc.property(multigraph, ({ s, edges, ids }) => {
      const oldProducer = { ...s, renderer: 'agentic-mermaid@0.4.1' } as unknown as DiagramSnapshot;
      edges.forEach((e, k) => {
        assert.equal(edgePartOf(s, `${e.from}->${e.to}#${k}`), ids[k]);
        assert.equal(edgePartOf(oldProducer, `${e.from}->${e.to}#${k}`), ids[k]);
      });
    }),
    params(),
  );
});

test('current producer warnings name multigraph parts per pair regardless of global order or layout availability', () => {
  fc.assert(fc.property(multigraph, ({ s, ids }) => {
    const current: DiagramSnapshot = { ...s, renderer: RENDERER };
    for (const id of ids) assert.equal(edgePartOf(current, id.slice('edge:'.length)), id);
    const warnings = ids.map((id) => ({ code: 'DECISION_BRANCH_UNLABELED', edge: id.slice('edge:'.length) }));
    assert.deepEqual(findingsOf({ ...current, findings: { ...current.findings, warnings } }).map((w) => w.part), ids);
    assert.equal(edgePartOf(current, 'missing->edge#0'), undefined);
    const authored = { ...current, parts: current.parts.map((p, i) => ({ ...p, id: `edge:authored_${i}` })) };
    authored.parts.forEach((p) => assert.equal(edgePartOf(authored, p.id.slice('edge:'.length)), p.id));
  }), params());
});

test('edgePartOf finds nothing for a name whose index or endpoints do not match an edge', () => {
  fc.assert(
    fc.property(multigraph, fc.string(), fc.oneof(fc.integer({ min: -3, max: 30 }), fc.constant(1e21)), ({ s, edges }, name, k) => {
      const e = edges[k];
      fc.pre(!e || name !== `${e.from}->${e.to}`);
      assert.equal(edgePartOf(s, `${name}#${k}`), undefined);
      assert.equal(edgePartOf(s, name.replace(/#\d+$/, '')), undefined);
    }),
    params(),
  );
});

test('findingsOf keeps each warning, gives the part its edge names (never a stale one), and copies rather than mutates', () => {
  fc.assert(
    fc.property(
      multigraph.chain((m) =>
        fc.tuple(
          fc.constant(m),
          fc.array(
            fc.record(
              {
                code: fc.string(),
                // An edge the verifier names by its global index, or a name with no index, which names no part.
                edge: fc.oneof(fc.string().filter((e) => !/#\d+$/.test(e)), ...(m.edges.length ? [fc.nat({ max: m.edges.length - 1 })] : [])),
                part: fc.string(),
              },
              { requiredKeys: ['code'] },
            ),
          ),
        ),
      ),
      ([{ s, edges, ids }, written]) => {
        const warnings = written.map((w) => (typeof w.edge === 'number' ? { ...w, edge: `${edges[w.edge]!.from}->${edges[w.edge]!.to}#${w.edge}` } : w));
        const snap = { ...s, findings: { ...(s.findings as object), warnings } } as DiagramSnapshot;
        const before = JSON.stringify(warnings);
        const out = findingsOf(snap);
        assert.equal(out.length, warnings.length);
        out.forEach((f, i) => {
          const { part: _stale, ...rest } = warnings[i]!;
          const k = written[i]!.edge;
          assert.deepEqual(f, typeof k === 'number' ? { ...rest, part: ids[k] } : rest);
          assert.notEqual(f, warnings[i]);
        });
        assert.equal(JSON.stringify(warnings), before);
      },
    ),
    params(),
  );
});

test('scale probe: keys, validation and edge lookup on very large inputs', { timeout: 120_000 }, async () => {
  const source = 'graph LR\n' + 'A-->B\n'.repeat(200_000);
  assert.equal(diagramKey({ source: source.replace(/\n/g, '\r\n') }), diagramKey({ source }));
  const s = fc.sample(randomSnapshot(), { numRuns: 1, seed: 1 })[0]!;
  const huge = JSON.parse(JSON.stringify(s)) as DiagramSnapshot;
  huge.parts.push({ id: 'big', role: 'node', kind: 'shape', shapes: [{ subpaths: [Array.from({ length: 6 * 100_000 + 2 }, (_, i) => i % 7)], closed: [false], style: { fill: '#000000', stroke: '#ffffff', strokeWidth: 0.01, fillOpacity: 1, strokeOpacity: 1, opacity: 1 } }] });
  assert.equal(await snapshotResolver({ [diagramKey(huge.spec)]: huge }).diagram(huge.spec), huge);
  const edges = Array.from({ length: 100_000 }, (_, i) => ({ from: 'n' + (i % 100), to: 'n' + ((i * 7) % 100) }));
  const g = { parts: [], findings: { layout: { edges }, warnings: Array.from({ length: 200 }, (_, i) => ({ code: 'W', edge: `${edges[i * 400]!.from}->${edges[i * 400]!.to}#${i * 400}` })) } } as unknown as DiagramSnapshot;
  assert.equal(findingsOf(g).length, 200);
  assert.equal(htmlEscape('<&>"\''.repeat(1_000_000)).length, 1_000_000 * (4 + 5 + 4 + 6 + 5));
});

// ---- explain/look.ts and colours -------------------------------------------------

/** Colours the snapshot validator accepts: 3, 4, 6 and 8 hex digits, either case, and 'none'. */
const anyHex = fc.oneof(
  hexColor,
  fc.stringMatching(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  fc.constant('none'),
);
const anyPalette = fc.record({ paper: anyHex, ink: anyHex, accent: anyHex, muted: anyHex });
const channels = (c: string) => parseColor(c);

/** WCAG relative luminance and contrast. */
const lum = (c: string) => {
  const [r, g, b] = channels(c)!.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

test('soft, raised and rule give a colour for every palette the snapshot validator accepts', () => {
  fc.assert(
    fc.property(anyPalette, (p) => {
      for (const c of [soft(p), raised(p), rule(p)])
        assert.ok(c === 'none' || [p.paper, p.ink].includes(c) || /^#[0-9a-f]{6}$/.test(c), `${c} from ${JSON.stringify(p)}`);
    }),
    params(),
  );
});

test('a panel, its rule and secondary text step from the paper toward the ink, in that order', () => {
  fc.assert(
    fc.property(fc.record({ paper: hexColor, ink: hexColor, accent: hexColor, muted: hexColor }), (p) => {
      const [paper, ink] = [channels(p.paper)!, channels(p.ink)!];
      const far = (c: string) => channels(c)!.map((v, i) => Math.abs(v - paper[i]!));
      const [a, b, c] = [far(raised(p)), far(rule(p)), far(soft(p))];
      for (let i = 0; i < 3; i++) assert.ok(a[i]! <= b[i]! && b[i]! <= c[i]! && c[i]! <= Math.abs(ink[i]! - paper[i]!), `${a} ${b} ${c}`);
    }),
    params(),
  );
});

test('an unknown style is refused even when its name belongs to Object.prototype', () => {
  for (const name of ['valueOf', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'not-a-style'])
    assert.throws(() => palette(name), /Unknown style/, name);
});

/** Whether each built-in style's accent is a hue (else emphasis falls back to an orange), as its palette shows. */
const HUED: Record<string, boolean> = {
  'hand-drawn': false, 'pen-and-ink': false, blueprint: false, nord: true, 'github-light': true, 'tokyo-night': true, excalidraw: true,
  dracula: true, 'github-dark': true, dusk: true, 'catppuccin-mocha': true, chalkboard: true, 'one-dark': true,
};
test('on every built-in style, secondary text reaches 4.5:1 and emphasis and outcome colours 3:1; monochrome styles get an orange', () => {
  assert.deepEqual(Object.keys(HUED).sort(), Object.keys(PALETTES).sort());
  for (const name of Object.keys(PALETTES)) {
    const p = palette(name);
    const at = (c: string) => `${name}: ${c} on ${p.paper} is ${contrast(c, p.paper).toFixed(2)}:1`;
    assert.ok(contrast(soft(p), p.paper) >= 4.5, at(soft(p)));
    for (const c of [emphasis(p), good(p), bad(p)]) assert.ok(contrast(c, p.paper) >= 3, at(c));
    if (HUED[name]) assert.equal(emphasis(p), p.accent, name);
    else assert.ok(['#ffb454', '#d9480f'].includes(emphasis(p)), `${name}: ${emphasis(p)}`);
  }
});

test('secondary text reaches 4.5:1 on any paper whose ink can, and is the ink itself where the ink cannot', () => {
  fc.assert(
    fc.property(hexColor, hexColor, (paper, ink) => {
      const p = { paper, ink, accent: ink, muted: ink };
      if (contrast(ink, paper) >= 4.5) assert.ok(contrast(soft(p), paper) >= 4.5, `${soft(p)} on ${paper}`);
      // With contrast to spare, secondary text is visibly lighter than the ink it stands beside.
      if (contrast(ink, paper) >= 9) assert.ok(contrast(soft(p), paper) < contrast(ink, paper) - 1, `${soft(p)} reads as ink on ${paper}`);
      else assert.ok(contrast(soft(p), paper) >= 4.5 || soft(p) === lerpColor(ink, paper, 0), `${soft(p)} on ${paper}`);
    }),
    params(),
  );
});

test('emphasis is the accent or one of the two warm oranges, and ignores ink and muted', () => {
  fc.assert(
    fc.property(anyPalette, anyHex, anyHex, (p, ink, muted) => {
      const e = emphasis(p);
      assert.ok([p.accent, '#ffb454', '#d9480f'].includes(e));
      assert.equal(emphasis({ ...p, ink, muted }), e);
    }),
    params(),
  );
});

test('a grey accent is never emphasis', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 255 }), hexColor, (v, paper) => {
      const grey = '#' + v.toString(16).padStart(2, '0').repeat(3);
      assert.notEqual(emphasis({ paper, ink: '#000000', accent: grey, muted: grey }), grey);
    }),
    params(),
  );
});

test('the fallback emphasis is the warm orange that contrasts more with the paper', () => {
  fc.assert(
    fc.property(hexColor, fc.integer({ min: 0, max: 255 }), (paper, v) => {
      const grey = '#' + v.toString(16).padStart(2, '0').repeat(3);
      const e = emphasis({ paper, ink: '#000000', accent: grey, muted: grey });
      const other = e === '#ffb454' ? '#d9480f' : '#ffb454';
      assert.ok(contrast(e, paper) >= contrast(other, paper), `${e} on ${paper}: ${contrast(e, paper).toFixed(2)} < ${contrast(other, paper).toFixed(2)}`);
    }),
    params(),
  );
});

test('dimmed ink reaches 3:1 on the paper of every built-in style, at the least opacity that does', () => {
  for (const name of Object.keys(PALETTES)) {
    const p = palette(name);
    const at = (a: number) => contrast(lerpColor(p.paper, p.ink, a), p.paper);
    const a = dimOpacity(p);
    assert.ok(at(a) >= 3, `${name}: ${at(a).toFixed(2)}:1 at ${a}`);
    assert.ok(a === 0.2 || at(a - 0.01) < 3, `${name}: ${a} is more than needed`);
  }
});

const regionName = fc.constantFrom(...(Object.keys(REGIONS) as (keyof typeof REGIONS)[]));

test('regionBox returns a fresh copy of a region or box: changing it changes nothing else', () => {
  fc.assert(
    fc.property(fc.oneof(regionName, fc.tuple(fc.double(), fc.double(), fc.double(), fc.double())), fc.nat({ max: 3 }), fc.double(), (r, i, v) => {
      const source = typeof r === 'string' ? REGIONS[r] : r;
      const before = [...source];
      const b = regionBox(r as never);
      assert.deepEqual(b, before);
      b[i] = v;
      assert.deepEqual([...source], before);
    }),
    params(),
  );
});

// REGIONS is a fixed table, so these two check every entry rather than sample.
test('every region lies in the stage, below the heading line, with positive area', () => {
  for (const [name, [x0, y0, x1, y1]] of Object.entries(REGIONS))
    assert.ok(x0 >= REGIONS.full[0] && x1 <= REGIONS.full[2] && y0 >= REGIONS.full[1] && y1 <= 3.25 && x1 > x0 && y1 > y0, name);
});

test('the regions meant to sit side by side never overlap', () => {
  for (const [a, b] of [['left', 'right'], ['main', 'side'], ['top', 'bottom']] as const)
    assert.ok(REGIONS[a][2] <= REGIONS[b][0] || REGIONS[b][3] <= REGIONS[a][1], `${a} and ${b} overlap`);
});

test('the explain entry point exports exactly its documented names', async () => {
  assert.deepEqual(Object.keys(await import('../explain/index.ts')).sort(), [
    'Diagram', 'REGIONS', 'bindSnapshots', 'caseName', 'describeExplainer', 'edgePartOf', 'findingsOf', 'palette',
    'regionBox', 'resolveSettings', 'settingsOf', 'stage', 'variantsOf', 'withSettings',
  ]);
});

// ---- explain/trace.ts ------------------------------------------------------------

test('htmlEscape output has no markup characters and decodes back to the text', () => {
  const decode = (s: string) => s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[e as string]!);
  fc.assert(
    fc.property(fc.oneof(fc.string({ unit: 'binary' }), fc.string({ unit: fc.constantFrom('&', '<', '>', '"', "'", 'a', ';', '#', '\0') }), fc.integer(), fc.double(), fc.boolean(), fc.constant(null)), (value) => {
      const out = htmlEscape(value);
      assert.doesNotMatch(out, /[<>"']/);
      assert.doesNotMatch(out, /&(?!(lt|gt|quot|#39|amp);)/);
      assert.equal(decode(out), String(value));
    }),
    params(),
  );
});

// ---- state diagrams: composites and regions ---------------------------------------

test('state diagrams name [*] dots by their state and region, count composites as states, and dim keeps a composite whole', async () => {
  const { readSnapshots } = await import('../tools/lib/explain-project.ts');
  const { COMPOSITE, REGIONS } = await import('./fixtures/state-composite/scene.ts');
  const { wordsFor } = await import('../explain/words.ts');
  const store = await readSnapshots('test/fixtures/state-composite/scene');
  const draw = async (source: string) => {
    const captured = Object.values(store).find((s) => s.spec.source === source);
    assert.ok(captured, 'the fixture snapshot is captured');
    const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), captured.spec, captured, { box: 'full' });
    await d.build();
    return d;
  };
  const names = (d: Diagram) => d.describe().parts.map((p) => p.name);

  // A composite's start dot is named by its state; links to it use that name, not on_start.
  const composite = await draw(COMPOSITE);
  assert.equal(composite.describe().blank, undefined);
  assert.match(composite.describe().what, /\b5 states, 6 transitions$/, 'off, on, idle, brewing, ready; the dot is not a state');
  for (const name of ['start of on', 'start of on → idle', 'on → off: POWER_OFF']) assert.ok(names(composite).includes(name), name);

  // Each concurrent region's start is numbered; the diagram's own start is just "start".
  const regions = await draw(REGIONS);
  assert.equal(regions.describe().blank, undefined);
  assert.match(regions.describe().what, /\b6 states, 9 transitions$/, 'off, on and four region states');
  for (const name of ['start', 'start → off', 'start of on, region 1 → paused', 'start of on, region 2 → unmuted'])
    assert.ok(names(regions).includes(name), name);
  assert.ok(!names(regions).some((n) => /__r\d|_start\b/.test(n)), 'no part falls back to a capture id');

  // Keeping the composite keeps what is drawn inside it; the outside state and its links fade.
  await regions.dim(['on']);
  const dimmed = new Set(regions.describe().parts.filter((p) => p.dimmed).map((p) => p.name));
  for (const name of ['off', 'start → off', 'on → off: POWER_OFF', 'off → on: POWER']) assert.ok(dimmed.has(name), `${name} fades`);
  for (const name of ['paused', 'muted', 'start of on, region 2', 'paused → playing: PLAY', 'unmuted → muted: MUTE'])
    assert.ok(!dimmed.has(name), `${name} stays`);

  assert.equal(wordsFor('fr').pseudostate('start', 'on', 2), 'début d’on, région 2');
  assert.equal(wordsFor('fr').pseudostate('end', 'veille'), 'fin de veille');
  assert.equal(wordsFor('en').pseudostate('end'), 'end');
});
