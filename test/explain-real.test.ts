// The explain helpers on what Agentic Mermaid really captured: every pinned
// snapshot in scenes/explainers, and the step descriptions of three shipped
// explainers. Synthetic snapshots (explain-diagrams.property.test.ts) cover
// the space; these hold the helpers to the shapes capture actually writes
// (outlined labels inside node groups, links that own their labels, actor:
// and class: ids named by bare names, axes, grid lines and branches).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, NullSink, loadFonts } from '../src/index.ts';
import type { Mobject } from '../src/index.ts';
import { Diagram } from '../explain/diagrams.ts';
import { dimOpacity } from '../explain/look.ts';
import { findingsOf } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { pictureSummary, pictureHtml } from '../explain/trace.ts';
import { collectProject, readSnapshots } from '../tools/lib/explain-project.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';
import { verifyMermaid } from 'agentic-mermaid/agent';
import MermaidExplainer, { BROKEN, BROKEN_REPORT } from '../scenes/explainers/agentic-mermaid/scene.ts';
import { WARNING_SEVERITY } from 'agentic-mermaid/agent';

await loadFonts();

const corpus: { id: string; s: DiagramSnapshot }[] = [];
for (const { id } of EXPLAINERS)
  for (const s of Object.values(await readSnapshots(`scenes/explainers/${id}/scene`))) corpus.push({ id, s });
const where = ({ id, s }: (typeof corpus)[number]) => `${id}: ${s.spec.source.split('\n')[0]}`;
/** The pinned snapshot of explainer `id` whose source contains `text`. */
const pinned = (id: string, text: string) => {
  const found = corpus.find((c) => c.id === id && c.s.spec.source.includes(text));
  assert.ok(found, `no pinned ${id} diagram with ${text}`);
  return found.s;
};
async function shown(s: DiagramSnapshot) {
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d;
}
const tops = (d: Diagram) => [...d.parts.values()].filter((p) => !p.info.owner).map((p) => p.info.id);
/** The drawn leaves of a part's words: outlines under a label. */
const labelLeaves = (d: Diagram) =>
  [...d.parts.values()].flatMap((p) =>
    p.mob.family().filter((m) => {
      for (let a: Mobject | null = m; a && a !== p.mob.parent; a = a.parent) if (typeof (a as { text?: unknown }).text === 'string') return !m.children.length;
      return false;
    }),
  );

test('the corpus holds every family the explainers use', () => {
  assert.deepEqual([...new Set(corpus.map((c) => c.s.family))].sort(), ['architecture', 'class', 'er', 'flowchart', 'gantt', 'gitgraph', 'journey', 'mindmap', 'pie', 'quadrant', 'radar', 'sequence', 'state', 'timeline', 'xychart']);
});

test('on every pinned snapshot, marking every part keeps each label its ink', async () => {
  for (const c of corpus) {
    const d = await shown(c.s);
    const leaves = labelLeaves(d);
    assert.ok(leaves.length > 0, `${where(c)} has words`);
    const ink = leaves.map((m) => m.style.fill);
    await d.mark(tops(d), { color: '#ff0000' });
    assert.deepEqual(leaves.map((m) => m.style.fill), ink, where(c));
  }
});

test('on every pinned snapshot, dimming everything spares the frame and each family’s scaffolding (lifelines, axes, grids, branches, sections, rails, plates, groups)', async () => {
  // The scaffolding a reader keeps their bearings by, as each family's ids name it.
  const scaffold = (id: string) =>
    ['__frame', 'rail', 'border', 'score-guide'].includes(id) ||
    /^(actor|lifeline|axis|grid|branch|section|section-band|section-label|plate|divider|quadrant-label|group|junction|ring|spoke|leader|tick|tick-box|axis-label):/.test(id);
  for (const c of corpus) {
    const d = await shown(c.s);
    const opacity = (id: string) => d.get(id).family().map((m) => m.style.opacity ?? 1);
    const before = new Map(tops(d).map((id) => [id, opacity(id)]));
    await d.dim([]);
    const faint = dimOpacity(c.s.palette);
    for (const id of tops(d))
      assert.deepEqual(opacity(id), before.get(id)!.map((o) => (scaffold(id) ? o : o * faint)), `${where(c)}: ${id}`);
  }
});

test('a diagram is described by the counts its source declares, and bare names name participants and classes', async () => {
  const cases: [DiagramSnapshot, string][] = [
    [pinned('state-machine', 'stateDiagram'), 'State diagram: 4 states, 4 transitions'],
    [pinned('lantern', 'classDiagram'), 'Class diagram: 4 classes, 3 relationships'],
    [pinned('oauth-pkce', 'participant X as Malicious app'), 'Sequence diagram: 3 participants, 7 messages'],
    [pinned('2password', 'participant O as op CLI'), 'Sequence diagram: 3 participants, 6 messages'],
    [pinned('agentic-mermaid', 'gitGraph'), 'Git graph: 3 commits, 2 links'],
    [pinned('2password', 'graph LR'), 'Flowchart: 4 nodes, 3 links'],
    [pinned('cert-renewal', 'Longest a public TLS'), 'Timeline “Longest a public TLS certificate may last”: 4 periods'],
    [pinned('send-sync', 'Rc<i32>'), 'Quadrant chart: 1 point'],
  ];
  for (const [s, what] of cases) assert.equal((await shown(s)).describe().what, what);
  const classes = await shown(pinned('lantern', 'classDiagram'));
  assert.equal(classes.get('Scene'), classes.get('class:Scene'));
  const seq = await shown(pinned('oauth-pkce', 'participant X as Malicious app'));
  assert.equal(seq.get('X'), seq.get('actor:X'));
});

test('the current verifier’s raw warnings name captured edge parts per endpoint pair', async () => {
  const s = pinned('agentic-mermaid', 'A{Cached} --> B[Reply]');
  assert.deepEqual(s.findings.warnings.map((w) => w.edge), ['A->B#0', 'A->C#0']);
  assert.deepEqual(findingsOf(s).map((f) => f.part), ['edge:A->B#0', 'edge:A->C#0']);
  assert.deepEqual((await shown(s)).findings(), findingsOf(s));
});

test('the Mermaid explainer’s check answers are what the pinned verifier reports on each check’s diagram', () => {
  // The swapped labels and the right ones: both captured snapshots carry ok: true and no warnings.
  for (const text of ['A -->|yes| C[Database]', 'A{Cached} -->|yes| B[Reply]']) {
    const s = pinned('agentic-mermaid', text);
    assert.equal(s.findings.ok, true);
    assert.deepEqual(findingsOf(s), []);
  }
  const report = (source: string) => {
    const r = verifyMermaid(source);
    return { ok: r.ok, warnings: (r.warnings ?? []).map((w) => `${w.code} ${(w as { edge?: string }).edge}`) };
  };
  const [undeclared, second, rectangle, single] = MermaidExplainer.meta.checks;
  // Both edges labelled yes: the verifier does not compare what labels say (no longer a check question; the claim stands).
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|yes| C[Database]'), { ok: true, warnings: [] });
  // A node used only as an edge's target: Mermaid creates it as a rectangle labelled with its id.
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| D'), { ok: true, warnings: [] });
  const d = verifyMermaid('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| D').layout.nodes.find((n) => n.id === 'D');
  assert.deepEqual([d?.shape, d?.label], ['rectangle', 'D']);
  assert.match(undeclared!.answer, /^ok: true and no warnings\. Mermaid creates D where it is first used, as a rectangle labelled D/);
  // A third, unlabelled route out of Cached (no longer a check question; the claim stands).
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]\nA --> D[Stale]'), {
    ok: true,
    warnings: ['DECISION_BRANCH_UNLABELED A->D#0'],
  });
  // A second edge between the same two nodes takes the next count: A->C#1.
  assert.deepEqual(report('graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]\nA --> C'), {
    ok: true,
    warnings: ['DECISION_BRANCH_UNLABELED A->C#1'],
  });
  assert.match(second!.answer, /^A->C#1\. .*One DECISION_BRANCH_UNLABELED warning, and ok stays true\.$/);
  assert.deepEqual(report('graph LR\nA[Cached] --> B[Reply]\nA --> C[Database]'), { ok: true, warnings: [] });
  assert.match(rectangle!.answer, /^No: ok: true with no warnings/);
  // A decision with one exit: its unlabelled exit is not flagged, since the warning needs two or more exits.
  assert.deepEqual(report('graph LR\nA{Cached} --> B[Reply]'), { ok: true, warnings: [] });
  assert.match(single!.answer, /^None: ok: true with no warnings\. The warning is for a decision with two or more exits/);
  // A bare graph header: Agentic Mermaid's renderer rejects it (no longer a check question, since what mermaid-js
  // accepts cannot be tested here; the claim about the pinned verifier stands).
  const headless = verifyMermaid('graph\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]');
  assert.equal(headless.ok, false);
  assert.deepEqual(headless.warnings.map((w) => [w.code, WARNING_SEVERITY[w.code]]), [['RENDER_FAILED', 'error']]);
});

test('the Mermaid explainer’s broken step shows what the pinned verifier reports for an edge with no end, in every scenario', () => {
  // These sources cannot be captured (capture refuses ok: false), so the step's report is written in the scene and held here.
  assert.deepEqual(Object.keys(BROKEN).sort(), ['complete', 'missing', 'swapped']);
  for (const [edit, source] of Object.entries(BROKEN)) {
    assert.match(source, /-->(\|(yes|no)\|)?$/, `${edit}: the last edge stops at its arrow`);
    const r = verifyMermaid(source);
    const got = {
      ok: r.ok,
      warnings: r.warnings.map((w) => ({
        code: w.code,
        severity: WARNING_SEVERITY[w.code],
        ...((w as { syntax?: string }).syntax ? { syntax: (w as { syntax?: string }).syntax } : {}),
      })),
      checks: { renderability: r.checks?.renderability, taskCorrectness: r.checks?.taskCorrectness },
    };
    assert.deepEqual(got, BROKEN_REPORT, edit);
  }
});

/** Each step's state in an explainer's default scenario, by step name. */
async function steps(id: string) {
  const project = await collectProject(`scenes/explainers/${id}`, { write: false });
  const trace = project.scenarios[0]!.trace;
  return new Map(trace.steps.map((s, i) => [s.step, { after: s.after, shown: s.shown, before: trace.steps[i - 1]?.shown }]));
}

test('shipped explainers describe their steps: chart values, marks, focus, walks and what is new', async () => {
  const bucket = await steps('token-bucket');
  const summary = (name: string) => pictureSummary(bucket.get(name)!.shown);
  // The run is a native chart drawn from the same allow() calls that move the gauge
  assert.match(summary('later'), /A chart of the balance over time: it climbs at 1 a second between calls and drops one token for each 200\./);
  assert.match(summary('trace'), /1 \/ s: R6, R7 and R9 get 429/);
  assert.match(summary('trace'), /2 \/ s: R6 and R9 get 429/);
  assert.match(summary('trace'), /4 \/ s: R6 gets 429/);
  assert.match(summary('balance'), /Refill: 2: tokens = min\(5/);
  assert.match(summary('burst'), /R6 at 0\.0 is under the one-token line and got 429/);
  // A step that changes only emphasis lists the rest as it was.
  const refill = bucket.get('refill')!;
  assert.match(pictureHtml(refill.shown, refill.before), /the rest as in the previous step/);
  assert.doesNotMatch(pictureHtml(refill.shown), /the rest as in the previous step/);

  const machine = await steps('state-machine');
  const connect = pictureSummary(machine.get('connect')!.shown);
  assert.match(connect, /^State diagram: 4 states, 4 transitions; /);
  // The trail is the machine's: its picture of the diagram draws the travelled link, and its words name it.
  assert.match(connect, /; Travelled: idle → connecting: CONNECT; /);
  assert.match(connect, /New in this step: .*Travelled: idle → connecting: CONNECT/);
  // The reducer row is boxed, not focused: the box's description names the line and what it means
  assert.match(connect, /A box around line 2 of the reducer: 'idle:CONNECT': 'connecting', the row the reducer reads/);
  assert.match(connect, /A ring around connecting, the state the session is in/);

  const pkce = await steps('oauth-pkce');
  // Only the first message is revealed, and what it carries is a note on it.
  const authorize = pictureSummary(pkce.get('authorize')!.shown);
  assert.match(authorize, /^Sequence diagram: 3 participants, 1 message\. /);
  assert.match(authorize, /Note: “challenge \+ S256; verifier not sent” beside Client → Auth server/);
});
