// The stage (explain/stage.ts) and the step pictures it records (explain/trace.ts):
// the heading, clearing, resting frames, and the descriptions readers get.
// A Diagram's own promises are properties in explain-diagrams.property.test.ts;
// descriptions of the shipped explainers are in explain-real.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Rectangle, Text, FadeIn } from '../src/index.ts';
import { NullSink, SnapshotSink, renderAt, toSvgString } from '../src/output.ts';
import { traceScene, loadFonts } from '../explain/testing.ts';
import { stage } from '../explain/index.ts';
import { bindSnapshots } from '../explain/testing.ts';
import { Diagram } from '../explain/diagrams.ts';
import { dimOpacity } from '../explain/look.ts';
import { diagramKey } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import type { SnapshotPart } from '../integrations/agentic-mermaid/snapshot.ts';
import type { Mobject } from '../src/index.ts';
import type { Picture } from '../explain/trace.ts';
import { fixedSnapshot, square } from './lib/random-snapshot.ts';
import { pictureSummary, pictureHtml, undescribed, picture, shownNames } from '../explain/trace.ts';

const spec = { source: 'graph LR\nA --> B\nB --> C', style: 'nord' };
const PAPER = '#123456',
  INK = '#ffffff',
  ACCENT = '#ff8800';
function fixture(): DiagramSnapshot {
  const shape = (x: number, extra: Record<string, unknown> = {}) => square(x, { fill: '#334455', stroke: '#aabbcc', ...extra });
  const edge = (from: string, to: string, x: number) => ({
    id: `edge:${from}->${to}#0`,
    role: 'edge',
    kind: 'connector',
    // A stroked line and a filled arrowhead, as Agentic Mermaid draws them.
    shapes: [shape(x, { fill: 'none' }), shape(x + 0.5, { fill: '#aabbcc', stroke: 'none' })],
    from,
    to,
    route: [
      [x - 1, 0],
      [x + 1, 0],
    ] as [number, number][],
  });
  return fixedSnapshot(
    spec,
    [
      { id: 'A', role: 'node', kind: 'shape', shapes: [shape(0)] },
      { id: 'B', role: 'node', kind: 'shape', shapes: [shape(3)] },
      { id: 'C', role: 'node', kind: 'shape', shapes: [shape(6)] },
      edge('A', 'B', 1.5),
      edge('B', 'C', 4.5),
    ],
    { width: 800, palette: { paper: PAPER, ink: INK, accent: ACCENT, muted: '#aaaaaa' } },
  );
}
const bound = (S: import('../src/index.ts').SceneClass) => bindSnapshots(S, { [diagramKey(spec)]: fixture() });

test('the heading follows step titles; a fixed or absent heading is still possible', async () => {
  const seen: string[] = [];
  class Steps extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one', { title: 'First idea' });
      seen.push(s.heading.text);
      await this.step('two', { title: 'Second idea' });
      seen.push(s.heading.text);
      await this.step('three');
      seen.push(s.heading.text);
      assert.equal(this.mobjects.filter((m) => m.role === 'heading').length, 1);
    }
  }
  await new Steps(new NullSink()).run();
  assert.deepEqual(seen, ['First idea', 'Second idea', '']);
  class Fixed extends Scene {
    override async construct() {
      const s = stage(this, { heading: 'Always this' });
      await this.step('one', { title: 'Not shown on stage' });
      assert.equal(s.heading.text, 'Always this');
    }
  }
  await new Fixed(new NullSink()).run();
  class Absent extends Scene {
    override async construct() {
      const s = stage(this, { heading: false });
      await this.step('one', { title: 'Never shown on stage' });
      assert.equal(s.heading.text, '');
      assert.ok(!this.familyMembers().some((m) => m instanceof Text && m.text === 'Never shown on stage'));
    }
  }
  await new Absent(new NullSink()).run();
});

test('a view’s note follows its part through enlarge; clear() leaves paper and heading, and a cleared diagram can be drawn again', async () => {
  class Notes extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(spec);
      const v = s.diagramView(d, () => ({ notes: [{ id: 'C', text: 'here', side: 'above' }] }));
      const sync = () => this.play(v.sync());
      const note = () => this.find('note:C')!;
      const gap = () => note().center()[0] - d.get('C').center()[0];
      assert.ok(Math.abs(gap()) < 1e-6);
      await d.enlarge(['A']);
      await sync();
      // Centred over C again, unless the frame's edge holds it back.
      assert.ok(Math.abs(gap()) < 1e-6 || note().center()[0] >= d.frameBox[2] - note().width() / 2 - 0.06);
      await d.enlarge('all');
      await sync();
      assert.ok(Math.abs(gap()) < 1e-6 && note().center()[1] > d.get('C').box()![3]);
      await s.card([['k', 1]]);
      await s.clear();
      // The backdrop, the heading's band (invisible at home) and the heading stay.
      assert.deepEqual(
        this.mobjects.map((m) => m.role),
        ['backdrop', 'chrome', 'heading'],
      );
      await d.reveal(['A']);
      assert.ok(this.familyMembers().includes(d.get('A')));
    }
  }
  await new (bound(Notes))(new NullSink()).run();
});

test('the time a player, poster or screenshot shows for a step renders that step’s resting frame', async () => {
  class Ends extends Scene {
    override async construct() {
      stage(this, { palette: { paper: PAPER, ink: INK, accent: ACCENT, muted: '#999999' } });
      await this.step('one', { title: 'Fades in to the last frame' });
      await this.play(new FadeIn(new Text('arrives', { color: INK })), { runTime: 1 });
      // The next step changes the picture at its first instant: the step before must not show it.
      await this.step('two', { title: 'Next' });
      this.add(new Text('later', { color: INK }).moveTo([0, -2]));
      await this.wait(0.5);
    }
  }
  const trace = await traceScene(Ends);
  const played = new Map<number, string>();
  await new Ends({
    async frame(scene: Scene) {
      played.set(scene.frameCount, toSvgString(scene));
    },
  }).run();
  for (const step of trace.steps) {
    // The resting frame is the last one the step draws: everything it played has arrived.
    assert.equal(step.restFrame!, step.frame1, step.step);
    const sink = new SnapshotSink();
    await renderAt(Ends, step.restFrame! / trace.fps, sink);
    assert.equal(sink.svg, played.get(step.restFrame!), `${step.step} rests on its final frame`);
  }
});

test('descriptions read chart values as written, name marks by their word, and report drawings with no words', async () => {
  const chartSpec = { source: 'xychart-beta\n x-axis [R1,R2]\n y-axis "Tokens" 0 --> 5\n bar [4,0.5]', style: 'nord' };
  const text = (id: string, words: string, x: number) => ({ id, role: 'axis', kind: 'text', shapes: [{ ...square(x, { fill: INK, stroke: 'none' }), text: words, fontSize: 0.2 }] });
  // Channels hold values normalised to the largest (0.5 / 4); the description must not.
  const bar = (cat: string, value: number, x: number) => ({ id: `bar:0:${cat}`, role: 'bar', kind: 'shape', channels: { category: 'bar-0', value }, shapes: [square(x, { fill: ACCENT, stroke: 'none' })] });
  const chart = {
    ...fixedSnapshot(chartSpec, [text('axis:y:title', 'Tokens', -1), text('axis:y:label:0', '0', -1), text('axis:y:label:5', '5', -1), bar('R1', 1, 0), bar('R2', 0.125, 1)], {
      family: 'xychart',
      palette: { paper: PAPER, ink: INK, accent: ACCENT, muted: '#aaaaaa' },
    }),
    chart: { categories: ['R1', 'R2'], series: [{ kind: 'bar', values: [4, 0.5] }] },
  };
  class Described extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('chart');
      const d = await s.show(chartSpec);
      s.diagramView(d, () => ({ marks: { 'bar:0:R2': { color: d.emphasis, as: 'rejected' } }, notes: [{ id: 'bar:0:R1', text: 'full' }] }));
      await this.step('drawing');
      await s.enter(new Rectangle({ width: 1, height: 1 }).moveTo([5, 2]));
      await this.step('faint');
      await s.clear();
      // Words too faint to read are not words a reader is given.
      await s.enter(new Text('ghost', { color: INK }).setOpacity(0.3));
      await this.step('described');
      await s.clear();
      await s.enter(new Rectangle({ width: 1, height: 1 }), { describe: 'A square' });
    }
  }
  const steps = (await traceScene(bindSnapshots(Described, { [diagramKey(chartSpec)]: chart }))).steps;
  const [first, drawn, faint, described] = steps.map((s) => s.shown);
  assert.equal(
    pictureSummary(first),
    'XY chart: Tokens from 0 to 5, 2 categories from R1 to R2. Note: “full” beside R1: 4; rejected: R2: 0.5.',
  );
  assert.equal(
    pictureHtml(first),
    '<ul><li>XY chart: Tokens from 0 to 5, 2 categories from R1 to R2:<ul><li>“full” beside R1: 4 (note);</li><li>R2: 0.5 (rejected);</li><li>R1: 4.</li></ul></li></ul>',
  );
  assert.match(undescribed(drawn).join(), /1 kept drawing with no text/);
  assert.match(undescribed(faint).join(), /1 kept drawing with no text/);
  assert.doesNotMatch(pictureSummary(faint), /ghost/);
  assert.deepEqual(undescribed(described), []);
  assert.equal(pictureSummary(described), 'A square.');
});

test("a participant's bare name and its actor id name the same part, so dimming to two participants keeps their message", async () => {
  const seqSpec = { source: 'sequenceDiagram\n A->>C: hi', style: 'nord' };
  const box = (x: number) => square(x, { fill: '#334455', stroke: '#aabbcc' });
  const seq = fixedSnapshot(
    seqSpec,
    [
      { id: 'actor:A', role: 'actor', kind: 'shape', shapes: [box(0)] },
      { id: 'actor:B', role: 'actor', kind: 'shape', shapes: [box(2)] },
      { id: 'actor:C', role: 'actor', kind: 'shape', shapes: [box(4)] },
      { id: 'message:A->C#0', role: 'message', kind: 'connector', shapes: [box(2)], from: 'A', to: 'C', route: [[0, 0], [4, 0]] },
      { id: 'message:A->B#0', role: 'message', kind: 'connector', shapes: [box(1)], from: 'A', to: 'B', route: [[0, 0], [2, 0]] },
    ],
    { family: 'sequence', palette: { paper: PAPER, ink: INK, accent: ACCENT, muted: '#aaaaaa' } },
  );
  class Seq extends Scene {
    override async construct() {
      const d = await stage(this).show(seqSpec);
      assert.equal(d.get('A'), d.get('actor:A'));
      const kept = d.picture({}, { dim: ['actor:A', 'C'] });
      const drawn = (key: string) => kept.family().find((m) => m.key === key)!;
      assert.equal(drawn('message:A->C#0').family()[0]!.style.opacity, 1);
      assert.equal(drawn('message:A->B#0').family()[0]!.style.opacity, dimOpacity(seq.palette));
      await d.walk([['actor:A', 'C']]);
    }
  }
  await new (bindSnapshots(Seq, { [diagramKey(seqSpec)]: seq }))(new NullSink(), { skipUntil: Infinity }).run();
});

test('a picture names what is new since the step began, and records nothing new when everything is', () => {
  const card = (value: number) => ({ what: '2 labelled values', parts: [{ name: 'rate: 1' }, { name: `last: ${value}`, mark: 'marked' }] });
  const next = picture([card(2)], shownNames([card(1)]));
  assert.deepEqual(next.changed, ['last: 2']);
  // A new part that is also emphasised is said once, with its emphasis.
  assert.equal(pictureSummary({ picture: next }), '2 labelled values. Marked: last: 2.');
  const unmarked = (value: number) => ({ ...card(value), parts: card(value).parts.map(({ name }) => ({ name })) });
  assert.equal(pictureSummary({ picture: picture([unmarked(2)], shownNames([unmarked(1)])) }), '2 labelled values. New in this step: last: 2.');
  assert.equal(picture([card(2)], new Set()).changed, undefined);
});

test('a description separates its items and sentences once, even when an item ends in a comma', () => {
  // Focused lines of code that end in commas, as state-machine's transition table has.
  const lines = ['1: const next = {', "2:   'idle:CONNECT': 'connecting',", "3:   'connecting:OPENED': 'open',", '4: };'];
  const code = (focus: number[]) => ({ what: 'Code, 4 lines', parts: lines.map((name, i) => ({ name, ...(focus.includes(i) ? { mark: 'focused' } : {}) })) });
  const state = (v: string) => ({ what: '1 labelled value', parts: [{ name: `State: ${v}` }] });
  assert.equal(
    pictureSummary({ picture: picture([code([1]), state('connecting')], shownNames([code([0]), state('idle')])) }),
    "Code, 4 lines; 1 labelled value. Focused: 2: 'idle:CONNECT': 'connecting'. New in this step: 1 labelled value.",
  );
  assert.equal(
    pictureSummary({ picture: picture([code([1, 2])], new Set()) }),
    "Code, 4 lines. Focused: 2: 'idle:CONNECT': 'connecting'; 3: 'connecting:OPENED': 'open'.",
  );
});

test('a summary counts the emphasised parts it leaves out once, at the end, in either language', () => {
  const marked = (n: number, mark: string) => Array.from({ length: n }, (_, i) => ({ name: `${mark} ${i + 1}`, mark }));
  const summary = (parts: { name: string; mark: string }[], lang?: string) =>
    pictureSummary({ picture: picture([{ what: 'Code, 9 lines', parts }], new Set(), lang) });
  // At most three under one word and four in all; the rest are one count, never one per word.
  assert.equal(summary(marked(5, 'focused')), 'Code, 9 lines. Focused: focused 1; focused 2; focused 3; and 2 more.');
  assert.equal(
    summary([...marked(4, 'travelled'), ...marked(2, 'marked')]),
    'Code, 9 lines. Travelled: travelled 1; travelled 2; travelled 3; marked: marked 1; and 2 more.',
  );
  assert.equal(summary(marked(4, 'focused')), 'Code, 9 lines. Focused: focused 1; focused 2; focused 3; and 1 more.');
  const NB = '\u202f';
  assert.equal(
    summary([...marked(4, 'sur le trajet'), ...marked(3, 'en évidence')], 'fr'),
    `Code, 9 lines. Sur le trajet${NB}: sur le trajet 1${NB}; sur le trajet 2${NB}; sur le trajet 3${NB}; ` +
      `en évidence${NB}: en évidence 1${NB}; et 3 autres.`,
  );
});

test('a link names its ends by their labels: a service by its label, a class or entity by its name, an end with none by its id', async () => {
  await loadFonts();
  const palette = { paper: PAPER, ink: INK, accent: ACCENT, muted: '#aaaaaa' };
  // A box and its lines of text, one shape each, as capture records compartments.
  const box = (x: number, ...texts: string[]) =>
    texts.length ? texts.map((text) => ({ ...square(x, { fill: '#334455' }), text, fontSize: 0.2 })) : [square(x, { fill: '#334455' })];
  const link = (id: string, role: string, from: string, to: string, x: number): SnapshotPart => ({
    id,
    role,
    kind: 'connector',
    shapes: [square(x, { fill: 'none', stroke: '#aabbcc' })],
    from,
    to,
    route: [
      [x - 1, 0],
      [x + 1, 0],
    ],
  });
  const describe = async (source: string, family: string, parts: SnapshotPart[], act?: (d: Diagram) => PromiseLike<void>) => {
    const spec = { source, style: 'nord' };
    const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), spec, fixedSnapshot(spec, parts, { family, palette }), {});
    await d.build();
    await act?.(d);
    return d.describe().parts.map((p) => (p.mark ? `${p.name} (${p.mark})` : p.name));
  };
  // Unregistered families use their authored labels and links, including prototype names.
  for (const family of ['unregistered', 'valueOf', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])
    assert.deepEqual(await describe('graph LR\nA-->B', family, [
      { id: 'A', role: 'node', kind: 'shape', shapes: box(0, 'Alpha') },
      link('edge:A->B#0', 'edge', 'A', 'B', 1.5),
      { id: 'B', role: 'node', kind: 'shape', shapes: box(3, 'Beta') },
    ]), ['Alpha', 'Alpha → Beta', 'Beta'], family);
  // Architecture links name services by bare id; an unlabelled group and a junction have no label.
  const architecture = await describe(
    'architecture-beta',
    'architecture',
    [
      { id: 'group:net', role: 'group', kind: 'shape', shapes: box(-2, ' ') },
      { id: 'service:lb', role: 'service', kind: 'shape', shapes: box(0, 'Load balancer') },
      { id: 'service:api', role: 'service', kind: 'shape', shapes: box(3, 'API') },
      { id: 'junction:j', role: 'junction', kind: 'shape', shapes: box(6) },
      link('edge:lb->api#0', 'edge', 'lb', 'api', 1.5),
      link('edge:api->j#0', 'edge', 'api', 'j', 4.5),
      link('edge:api->net#0', 'edge', 'api', 'net', 2),
    ],
    (d) => d.walk([['lb', 'api']]),
  );
  assert.deepEqual(architecture, [
    'Load balancer → API (path)',
    // Scaffolding first: a junction is named by its id.
    'junction j',
    'Load balancer',
    'Load balancer → API',
    'API',
    'API → junction j',
    'API → net',
  ]);
  // A class is read before the relationships that leave it, which name it without its members.
  const classes = await describe('classDiagram', 'class', [
    { id: 'class:Mobject', role: 'class-box', kind: 'shape', shapes: box(3, 'Mobject', 'points') },
    { id: 'class:Scene', role: 'class-box', kind: 'shape', shapes: box(0, 'Scene', 'play()') },
    link('rel:Scene-Mobject#0', 'relationship', 'Scene', 'Mobject', 1.5),
    { id: 'rel-label:Scene-Mobject#0', role: 'label', kind: 'text', owner: 'rel:Scene-Mobject#0', shapes: box(1.5, 'owns') },
  ]);
  assert.deepEqual(classes, ['Scene play()', 'Scene → Mobject: owns', 'Mobject points']);
  // An ER entity declared with an alias is called by its label, as its box shows it.
  const erSource = 'erDiagram\n  p["Person"] {\n    string name\n  }\n  p ||--o{ CAR : drives';
  const erParts: SnapshotPart[] = [
    link('rel:p-CAR#0', 'relationship', 'p', 'CAR', 1.5),
    { id: 'rel-label:p-CAR#0', role: 'label', kind: 'text', owner: 'rel:p-CAR#0', shapes: box(1.5, 'drives') },
    { id: 'entity:p', role: 'entity', kind: 'shape', shapes: box(0, 'Person', 'string', 'name') },
    { id: 'entity:CAR', role: 'entity', kind: 'shape', shapes: box(3, 'CAR') },
    { id: 'card:p-CAR#0:1', role: 'cardinality', kind: 'shape', shapes: box(0.5), channels: { category: 'one' } },
    { id: 'card:p-CAR#0:2', role: 'cardinality', kind: 'shape', shapes: box(2.5), channels: { category: 'zero-many' } },
  ];
  const er = await describe(erSource, 'er', erParts);
  assert.deepEqual(er, [
    'Person → CAR: drives (each Person has zero or more CAR, each CAR has exactly one Person)',
    'Person: name (string)',
    'CAR',
  ]);
  for (const category of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'unknown', null, { toString: false, valueOf: false }]) {
    const parts = erParts.map((p) => p.role === 'cardinality' ? { ...p, channels: { category } } : p);
    assert.deepEqual(await describe(erSource, 'er', parts), ['Person → CAR: drives', 'Person: name (string)', 'CAR']);
  }
});

// ---- pictures built from state: marks, lit rows and lines, notes and words that are part of the picture ----

test('a card drawn lit and code drawn lit carry their bar on the row or lines, and describe and emphasise it', async () => {
  const { card, code } = await import('../explain/drawing.ts');
  const { emphasisOf } = await import('../explain/look.ts');
  await loadFonts();
  const scene = new Scene(new NullSink());
  const s = stage(scene);
  const rows = [['a', 1], ['b', 22], ['c', 333]] as const;
  const lit = card(s, rows, { at: [1, 0.5], title: 'T', lit: { row: 'b', as: 'chosen' } });
  // The bar runs across the panel, on row b.
  const bar = lit.bar.box()!, panel = lit.panel.box()!;
  assert.ok(Math.abs(lit.bar.center()[1] - lit.values.get('b')!.anchorPoint()[1]) < 1e-6);
  assert.ok(Math.abs(lit.bar.center()[0] - lit.panel.center()[0]) < 1e-6);
  assert.ok(bar[0] > panel[0] && bar[2] < panel[2] && bar[2] - bar[0] > (panel[2] - panel[0]) * 0.9);
  for (const other of ['a', 'c']) {
    const y = lit.values.get(other)!.anchorPoint()[1];
    assert.ok(y < bar[1] || y > bar[3], `row ${other} is outside the bar`);
  }
  assert.equal(lit.bar.style.opacity, 1);
  assert.deepEqual(lit.describe().parts.map((p) => p.mark), [undefined, 'chosen', undefined]);
  assert.equal(lit.describe().parts.find((p) => p.mark)?.name.startsWith('b'), true);
  // Unlit, the bar is there but hidden, so a picture keeps one family shape whether lit or not.
  const plain = card(s, rows, { at: [1, 0.5], title: 'T' });
  assert.equal(plain.bar.style.opacity, 0);
  assert.equal(plain.family().length, lit.family().length);
  assert.equal(plain.describe().parts.some((p) => p.mark), false);
  assert.throws(() => card(s, rows, { lit: { row: 'nope' } }), /card\(\): lit names no row of the card, "nope"/);

  const lines = ['one', 'two', 'three', 'four'];
  const built = code(s, lines, { at: [-3, 0], lit: { lines: [1, 2], as: 'run' } });
  // The bar covers lines 1 and 2, and neither line beside them.
  const span = built.bar.box()!, ys = built.code.lines.map((l) => l.anchorPoint()[1]);
  assert.equal(built.bar.style.opacity, 1);
  assert.ok(ys[1]! > span[1] && ys[1]! < span[3] && ys[2]! > span[1] && ys[2]! < span[3]);
  assert.ok(ys[0]! > span[3] && ys[3]! < span[1]);
  assert.deepEqual(built.describe().parts.map((p) => p.mark), [undefined, 'run', 'run', undefined]);
  assert.throws(() => code(s, lines, { lit: { lines: [2, 9] } }), /code\(\): lit names lines 2\.\.9, which are not lines of this panel/);

  // On stage, each says what it emphasises.
  scene.add(lit, built);
  const said = emphasisOf(scene);
  assert.equal(said.get(lit.bar), 'row b: 22');
  assert.equal(said.get(built.bar), 'lines 1-2: two / three');
});

test('a view of a card or code is described as that card or code, and a describe speaks for the rest', async () => {
  const { card: cardPicture, code } = await import('../explain/drawing.ts');
  const { Group } = await import('../src/index.ts');
  const { view } = await import('../explain/index.ts');
  class Described extends Scene {
    override async construct() {
      const s = stage(this);
      this.state = { n: 7 };
      await this.step('card');
      const card = view(this, (st) => cardPicture(s, [['n', (st as { n: number }).n]], { lit: { row: 'n', as: 'now' } }), { place: false });
      await s.enter(card);
      await this.step('both');
      await s.clear();
      // A card beside words of its own: the card describes itself, the describe says the rest.
      const pair = view(
        this,
        (st) => new Group(code(s, [`n = ${(st as { n: number }).n}`], { lit: { lines: 0 } }), new Text('beside', { color: INK }).moveTo([0, -2])),
        { place: false },
      );
      await s.enter(pair, { describe: 'Words beside the code' });
    }
  }
  const [card, both] = (await traceScene(Described)).steps.map((st) => (st.shown!.picture as Picture).entries);
  assert.deepEqual(card, [{ what: '1 labelled value', marked: { now: ['n: 7'] }, items: [] }]);
  assert.deepEqual(both, [
    { what: 'Code, 1 line', marked: { focused: ['1: n = 7'] }, items: [] },
    { what: 'Words beside the code', items: [] },
  ]);
});

test('a staged step says what its picture shows with describe, and its own card says itself', async () => {
  const { card } = await import('../explain/drawing.ts');
  const { Group, Circle } = await import('../src/index.ts');
  class Staged extends Scene {
    override async construct() {
      const s = stage(this);
      await s.steps([
        {
          id: 'geometry', title: 'A circle', line: '', caption: 'A circle.',
          state: { r: 2 },
          describe: (st) => `A circle of radius ${st.r}`,
          draw: (st) => new Circle({ radius: st.r }),
        },
        {
          id: 'words', title: 'Words', line: '', caption: 'Words.',
          state: { k: 'v' },
          draw: (st, stage) => new Group(card(stage, [['k', st.k]], { at: [0, 2] }), new Text('under it', { color: INK }).moveTo([0, -2])),
        },
      ]);
    }
  }
  const [geometry, words] = (await traceScene(Staged)).steps.map((st) => (st.shown!.picture as Picture).entries);
  assert.deepEqual(geometry, [{ what: 'A circle of radius 2', items: [] }]);
  // The card is described by itself, and its words are not said again with the picture's other text.
  assert.deepEqual(words, [{ what: '1 labelled value', items: ['k: v'] }, { what: 'under it', items: [] }]);
});

test('a diagram picture carries notes beside their parts, dimming that keeps 3:1, and prefixed keys', async () => {
  const { emphasisOf } = await import('../explain/look.ts');
  // The fixture's parts with words, so the description can name them.
  const named = { source: 'graph LR\nA --> B\nB --> C\n%% named', style: 'nord' };
  const labelled = fixture().parts.map((p) => (p.from ? p : { ...p, shapes: [...p.shapes, { ...square(0, { fill: INK, stroke: 'none' }), text: `node ${p.id}`, fontSize: 0.2 }] }));
  const store = { [diagramKey(named)]: fixedSnapshot(named, labelled, { width: 800, palette: { paper: PAPER, ink: INK, accent: ACCENT, muted: '#aaaaaa' } }) };
  class Pictured extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('one');
      const d = await s.show(named);
      const notePicture = d.notePicture('C', 'here', { side: 'above' });
      // Above C, centred on it.
      assert.ok(notePicture.box()![1] >= d.get('C').box()![3]);
      assert.ok(Math.abs(notePicture.center()[0] - d.get('C').center()[0]) < 1e-6);
      assert.equal(notePicture.key, 'note:C');
      const pictured = d.picture({ B: { color: ACCENT, as: 'chosen' } }, { notes: [{ id: 'C', text: 'here', side: 'above' }], dim: ['A'], prefix: 'p:' });
      // The diagram, then its note over it, unclipped.
      assert.equal(pictured.children.length, 2);
      const [art, note] = pictured.children as [Mobject, Mobject];
      assert.equal(note!.key, 'p:note:C');
      assert.deepEqual(note!.box(), notePicture.box());
      assert.ok(art!.family().filter((m) => m.key).every((m) => m.key!.startsWith('p:')), 'every key prefixed, the frame\'s too');
      assert.ok(art!.family().some((m) => m.key === 'p:A'));
      // Dimmed: everything but A (and the link between kept parts, of which there are none) fades to the
      // least opacity that keeps 3:1 on the paper; A keeps its look.
      const opacity = (root: Mobject, key: string) => root.family().find((m) => m.key === key)!.family().map((m) => m.style.opacity ?? 1);
      const faint = dimOpacity(d.snapshot.palette);
      assert.ok(faint < 1);
      for (const id of ['B', 'C', 'edge:A->B#0'])
        assert.deepEqual(opacity(art!, `p:${id}`), d.get(id).family().map((m) => (m.style.opacity ?? 1) * faint), id);
      assert.deepEqual(opacity(art!, 'p:A'), d.get('A').family().map((m) => m.style.opacity ?? 1));
      // The note describes itself and says what it emphasises.
      this.remove(d.root);
      d.showBy(pictured);
      this.add(pictured);
      assert.equal(emphasisOf(this).get(note!), 'note here');
      s.keep(pictured);
    }
  }
  // Described as the live diagram is: the note and the worded mark among its parts, dimmed parts said so;
  // the picture and its note add no entry of their own.
  const [one] = (await traceScene(bindSnapshots(Pictured, store))).steps.map((st) => (st.shown!.picture as Picture).entries);
  assert.equal(one!.length, 1);
  assert.deepEqual(one![0]!.marked, { note: ['“here” beside node C'], chosen: ['node B'] });
  assert.ok(one![0]!.items.some((i) => /dimmed/.test(i)));
});
