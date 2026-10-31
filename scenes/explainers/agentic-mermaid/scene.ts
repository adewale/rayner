import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/agentic-mermaid.ts';
import { Scene, FadeOut } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, REGIONS } from '../../../explain/index.ts';
import type { CardRow, Diagram } from '../../../explain/index.ts';
const STYLE = 'blueprint';
const BAD = 'graph LR\nA{Cached} --> B[Reply]\nA --> C[Database]';
const GOOD = 'graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]';
const OPS = [
  { kind: 'set_label', target: 'A->B#0', label: 'yes' },
  { kind: 'set_label', target: 'A->C#0', label: 'no' },
];
const SIDE = REGIONS.side,
  GAP = 0.3;

export default class MermaidExplainer extends Scene {
  static meta = {
    id: 'agentic-mermaid',
    title: 'What can a Mermaid verifier prove?',
    sources: ['https://github.com/adewale/agentic-mermaid', 'https://www.npmjs.com/package/agentic-mermaid/v/0.5.1'],
  };
  static settings = [
    {
      id: 'edit',
      label: 'The agent’s first edit',
      default: 'missing',
      options: [
        { value: 'missing', label: 'Leaves out branch labels' },
        { value: 'complete', label: 'Includes branch labels' },
      ],
    },
  ];
  override async construct() {
    const missing = settingsOf(this).edit === 'missing',
      s = stage(this, { headingSize: 0.6, style: STYLE });
    const first = missing ? BAD : GOOD;
    const code = (lines: readonly string[], fontSize = 0.24) => s.code(lines, { at: SIDE, fontSize, enter: false });
    const card = (rows: readonly CardRow[]) => s.card(rows, { at: SIDE, enter: false });
    // Side panels share one left edge and one gap, stacked and centred beside the diagram.
    const column = async (...panels: Mobject[]) => {
      const total = panels.reduce((h, p) => h + p.height(), 0) + GAP * (panels.length - 1);
      let top = (SIDE[1] + SIDE[3]) / 2 + total / 2;
      for (const p of panels) {
        p.moveTo([SIDE[0], top], [-1, 1]);
        top -= p.height() + GAP;
      }
      await s.enter(...panels, { runTime: 0.35 });
    };

    await readerFirst(this, s, readerFrames(missing));
    await this.step('source', {
      detail: true,
      title: missing
        ? 'Two branches leave Cached with no yes or no'
        : 'Both branches out of Cached already have labels',
      line: 'The snapshot gives each edge an id so the verifier can name it.',
      caption: missing
        ? 'An agent drew two routes out of Cached but did not say which means yes. Agentic Mermaid parses the Mermaid source into a snapshot with an id for each edge, then checks the branches. The next step shows the warnings before a typed edit adds the missing labels; the renderer runs at build time, not in the reader.'
        : 'The agent’s edit already names both routes out of Cached, yes and no. Agentic Mermaid parses the source into a snapshot with an id for each edge and verifies it at build time. The next step confirms there are no warnings, so this case needs no repair.',
    });
    await s.clear();
    const d = await s.show({ source: first }, { box: 'main' });
    const source = await code(first.split('\n'));
    await column(source);
    // Each part's id, said on the part: Reply and the edge to it above, the rest below.
    const parts = d.snapshot.parts.filter((p) => p.role === 'node' || p.role === 'edge');
    for (const p of parts)
      await d.note(p.id, p.role === 'edge' ? p.id : `node ${p.id}`, {
        side: (p.role === 'edge' ? p.to : p.id) === 'B' ? 'above' : 'below',
      });

    await this.step('verify', {
      detail: true,
      title: missing
        ? 'The verifier flags both edges out of Cached'
        : 'The verifier finds no warnings in the first edit',
      line: missing
        ? 'The verifier says ok: true, with one warning per unlabeled edge.'
        : 'Both edges already carry yes and no, so nothing is flagged.',
      caption: missing
        ? 'verify(flow) returns ok: true with two DECISION_BRANCH_UNLABELED warnings, one per marked edge. The diagram renders, but nothing on it says which edge out of Cached means yes.'
        : 'Both edges out of Cached carry labels, yes and no, so verify(flow) returns no warnings and this case skips the repair step.',
    });
    await d.clearNotes();
    const warnings = d.findings();
    this.state.warnings = warnings;
    await d.mark(
      warnings.length
        ? [
            'A',
            ...warnings.map((w) => {
              if (!w.part) throw new Error(`Warning ${w.edge} names no edge part`);
              return w.part;
            }),
          ]
        : d.snapshot.parts.filter((p) => p.role === 'edge' && p.from === 'A').map((p) => p.id),
      { as: warnings.length ? 'flagged' : 'checked' },
    );
    // The verifier's report sits under the source it checked.
    const report = await code(
      [
        `verify(flow).ok: ${d.snapshot.findings.ok}`,
        `warnings: ${warnings.length}`,
        ...warnings.flatMap((w) => [`  ${w.code}`, `    node ${w.node}, edge ${w.edge}`]),
      ],
      0.22,
    );
    report.moveTo([SIDE[0], source.box()![1] - GAP], [-1, 1]);
    await s.enter(report, { runTime: 0.35 });

    if (missing) {
      await this.step('repair', {
        detail: true,
        title: 'Two set_label operations label the branches',
        line: 'Replaying the ops on the first edit must give the next diagram.',
        caption:
          'Two set_label operations add yes and no to the edges. The build replays them on the parsed first edit and throws unless the result serializes to the same Mermaid as the next diagram.',
      });
      await this.play(new FadeOut(source, { runTime: 0.3 }));
      const ops = await code(
        OPS.flatMap((op) => [`{ kind: '${op.kind}',`, `  target: '${op.target}',`, `  label: '${op.label}' }`]),
      );
      ops.moveTo([SIDE[0], report.box()![3] + GAP], [-1, -1]);
      await s.enter(ops, { runTime: 0.35 });
      await ops.focus([0, OPS.length * 3 - 1]);
      await d.morph({ source: GOOD }, { ops: OPS });
      await d.mark(OPS.map((op) => `edge:${op.target}`));
      // The same report, rerun on the repaired diagram.
      await report.morph([`verify(flow).ok: ${d.snapshot.findings.ok}`, `warnings: ${d.findings().length}`]);
    }

    await this.step('walk', {
      detail: true,
      title: 'The token travels the yes edge’s own route',
      line: 'Each hop is checked first; Reply to Database would throw.',
      caption:
        'The note on the yes edge gives the route the token follows from Cached to Reply, its first and last points in snapshot units. walk() looks up every hop before animating, so a hop with no edge, such as Reply to Database, throws before anything moves.',
    });
    await s.clearOverlays();
    await d.unmark();
    await d.dim(['A', 'B']);
    await d.walk([['A', 'B']], { trail: true });
    const route = d.snapshot.parts.find((p) => p.role === 'edge' && p.from === 'A' && p.to === 'B')!.route ?? [];
    const pt = (p: readonly number[] | undefined) => (p ? `(${p[0]!.toFixed(2)}, ${p[1]!.toFixed(2)})` : '–');
    const linked = d.snapshot.parts.some((p) => p.role === 'edge' && p.from === 'B' && p.to === 'C');
    const yes = d.snapshot.parts.find((p) => p.role === 'edge' && p.from === 'A' && p.to === 'B')!.id;
    await d.note(yes, `${route.length} points: ${pt(route[0])} → ${pt(route.at(-1))}`, { side: 'above' });
    await column(
      await code(
        [
          "d.walk([['A', 'B']])  // real edge",
          "d.walk([['B', 'C']])",
          linked ? '// B -> C exists' : '// throws: not a real link',
        ],
        0.22,
      ),
    );

    const final = d.snapshot;
    const count = warnings.length,
      finalCount = d.findings().length;
    await this.step('evidence', {
      detail: true,
      title: 'The chart counts stored verifier warnings',
      line: `First edit: ${count} warnings; final diagram: ${finalCount}.`,
      caption:
        'The scene.snapshots folder stores each diagram’s marks, ids, routes and verifier findings. The bars count the warnings stored for the first edit and for the final diagram.',
    });
    await s.clear();
    const chart = await s.show(
      {
        source: `---\nconfig:\n  xyChart:\n    width: 600\n    height: 400\n---\nxychart-beta\n x-axis ["First edit", "Final"]\n y-axis "Warnings" 0 --> 3\n bar [${count},${finalCount}]`,
      },
      { box: 'main' },
    );
    // A bar of height zero draws nothing, so a zero gets its value as a note.
    if (!count) await chart.note('bar:0:First edit', '0 warnings', { side: 'above' });
    if (!finalCount) await chart.note('bar:0:Final', '0 warnings', { side: 'above' });
    await column(
      await card([
        ['renderer', final.renderer],
        ['marks', final.parts.length],
        ['edge routes', final.parts.filter((p) => p.route).length],
      ]),
    );
    this.state.finalWarnings = finalCount;

    await this.step('history', {
      detail: true,
      title: 'Source, edit and snapshot share one history',
      line: 'Three commits in order; the renderer stays pinned at 0.5.1.',
      caption:
        'The git graph shows the original Mermaid source, the agent’s edit and its checked snapshot as three commits in order. The edit either adds labels through typed operations or already has them; both paths store what the verifier found. The renderer stays pinned at agentic-mermaid@0.5.1, so an upgrade is a deliberate change whose snapshot diff gets reviewed.',
    });
    await s.clear();
    const git = await s.show(
      { source: 'gitGraph TB:\n commit id: "source"\n commit id: "typed edit"\n commit id: "checked snapshot"' },
      { box: 'full' },
    );
    await git.note('source', 'flow.mmd', { side: 'right' });
    await git.note('typed edit', missing ? '2 set_label ops' : 'labels in first edit', { side: 'right' });
    await git.note('checked snapshot', `${finalCount} warnings, ${final.renderer}`, { side: 'right' });
  }
}
