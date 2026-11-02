import { Scene, FadeOut } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, REGIONS } from '../../../explain/index.ts';
const STYLE = 'blueprint';
const BAD = 'graph LR\nA{Cached} --> B[Reply]\nA --> C[Database]';
const GOOD = 'graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]';
/** The same two edges with their labels swapped: yes now leads to Database. */
const SWAPPED = 'graph LR\nA{Cached} -->|no| B[Reply]\nA -->|yes| C[Database]';
const OPS = [
  { kind: 'set_label', target: 'A->B#0', label: 'yes' },
  { kind: 'set_label', target: 'A->C#0', label: 'no' },
];
const SWAP = [
  { kind: 'set_label', target: 'A->B#0', label: 'no' },
  { kind: 'set_label', target: 'A->C#0', label: 'yes' },
];
const SIDE = REGIONS.side,
  GAP = 0.3;
/** The script's one-sentence answer, stated in the meaning step of every case. */
const ANSWER = 'The verifier checks structure, such as a label on every branch, not whether the labels mean the right thing';
type Edit = 'missing' | 'complete' | 'swapped';

export default class MermaidExplainer extends Scene {
  static meta = {
    id: 'agentic-mermaid',
    title: 'What can a Mermaid verifier prove?',
    sources: ['https://github.com/adewale/agentic-mermaid', 'https://www.npmjs.com/package/agentic-mermaid/v/0.5.1'],
    // The script's answer and check questions (script.md); the meaning step states the answer in every case.
    answer: ANSWER,
    checks: [
      {
        question: 'With the branch labels missing, how many warnings does verify(flow) return, and is ok true?',
        answer: 'Two DECISION_BRANCH_UNLABELED warnings, one for each edge out of Cached, A->B#0 and A->C#0, and ok is still true.',
      },
      {
        question: 'What does the verifier report when the labels are swapped so that yes leads to Database?',
        answer: 'ok: true and no warnings, the same as for the right diagram: it checks that each branch has a label, not which label belongs on which branch.',
      },
      {
        question: 'Which two operations repair the first edit, and what must replaying them produce?',
        answer:
          "set_label 'yes' on A->B#0 and set_label 'no' on A->C#0. Replayed on the parsed first edit, they must serialize to the same Mermaid as the next diagram, or the build throws.",
      },
    ],
  };
  static settings = [
    {
      id: 'edit',
      label: 'The agent’s first edit',
      default: 'missing',
      options: [
        { value: 'missing', label: 'Leaves out branch labels' },
        { value: 'complete', label: 'Labels yes to Reply' },
        { value: 'swapped', label: 'Labels yes to Database' },
      ],
    },
  ];
  override async construct() {
    const edit = settingsOf(this).edit as Edit,
      missing = edit === 'missing',
      swapped = edit === 'swapped',
      s = stage(this, { headingSize: 0.6, style: STYLE });
    const first = missing ? BAD : swapped ? SWAPPED : GOOD;
    const code = (lines: readonly string[], fontSize = 0.24) => s.code(lines, { at: SIDE, fontSize, enter: false });
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

    await this.step('source', {
      title: missing ? 'Which branch out of Cached means a cache hit?' : 'Both branches out of Cached carry a label',
      line: 'Predict: does Agentic Mermaid’s verifier accept this diagram?',
      caption: missing
        ? 'An agent drew a cache lookup with two routes out of Cached, one to Reply and one to Database, but did not say which means yes. Agentic Mermaid parses the Mermaid source into a snapshot with an id for each node and edge, so a check can name the part it means. The verifier runs at build time, not in the reader.'
        : 'An agent drew a cache lookup with two routes out of Cached, one to Reply and one to Database, each with a label. Agentic Mermaid parses the Mermaid source into a snapshot with an id for each node and edge, so a check can name the part it means. The verifier runs at build time, not in the reader.',
    });
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
      title: missing ? 'Answer: ok: true, with two warnings' : 'Answer: ok: true, with no warnings',
      line: missing
        ? 'One DECISION_BRANCH_UNLABELED warning per unlabeled edge, named by its id.'
        : 'Both edges carry a label, so nothing is flagged.',
      caption: missing
        ? 'verify(flow) returns ok: true with two DECISION_BRANCH_UNLABELED warnings, one per marked edge, each named by the id the snapshot gave it. The diagram renders, but nothing on it says which edge out of Cached means yes.'
        : `Both edges out of Cached carry a label, ${swapped ? 'no to Reply and yes to Database' : 'yes to Reply and no to Database'}, so verify(flow) returns ok: true with no warnings and the edit needs no repair.`,
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
        title: 'Two set_label operations clear both warnings',
        line: 'Replaying the ops on the first edit must give the next diagram.',
        caption:
          'Two set_label operations add yes and no to the edges, by their ids. The build replays them on the parsed first edit and throws unless the result serializes to the same Mermaid as the next diagram. Verified again, the diagram has no warnings.',
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
    // What the agent's edit leaves for the history: the first edit, repaired if it had to be.
    const committed = d.findings().length,
      final = d.snapshot;

    await this.step('meaning', {
      title: swapped ? 'No warnings, yet a cache hit goes to the database' : 'Swap the labels and the verifier still finds nothing',
      line: 'Same report, ok: true and 0 warnings; the yes edge now reaches Database.',
      caption: `${
        swapped
          ? 'The agent wrote yes on the edge to Database and no on the edge to Reply, so a cache hit would query the database.'
          : 'Swap the two labels with two more set_label operations, so yes leads to Database and a cache hit would query the database.'
      } verify(flow) still returns ok: true with no warnings, and the token walks a real edge from Cached to Database. ${ANSWER}: which label belongs on which branch is the author’s decision, and the cache policy needs its own tests.`,
    });
    await s.clearOverlays();
    await d.unmark();
    if (!swapped) await d.morph({ source: SWAPPED }, { ops: SWAP });
    // SWAPPED writes yes on A's edge to C, Database.
    const yes = d.snapshot.parts.find((p) => p.id === 'edge:A->C#0');
    if (!yes || yes.to !== 'C' || !SWAPPED.includes('A -->|yes| C[Database]'))
      throw new Error('The swapped diagram must send yes to Database');
    await d.walk([['A', 'C']], { trail: true });
    await d.mark([yes.id], { color: s.bad, as: 'yes, to Database' });
    await column(
      await code(SWAPPED.split('\n')),
      await code([`verify(flow).ok: ${d.snapshot.findings.ok}`, `warnings: ${d.findings().length}`], 0.22),
    );
    this.state.swappedWarnings = d.findings().length;

    await this.step('history', {
      title: 'The snapshot keeps the findings; a reviewer reads the meaning',
      line: 'Three commits in order; the renderer stays pinned at 0.5.1.',
      caption: `The git graph shows the original Mermaid source, the agent’s edit and its checked snapshot as three commits in order. The snapshot stores the verifier’s findings for the edit, ${committed} warnings, with the renderer pinned at ${final.renderer}, so an upgrade is a deliberate change whose snapshot diff gets reviewed. Whether yes belongs on the edge to Reply is for the person reading that diff, or for the application’s tests.`,
    });
    await s.clear();
    const git = await s.show(
      { source: 'gitGraph TB:\n commit id: "source"\n commit id: "typed edit"\n commit id: "checked snapshot"' },
      { box: 'full' },
    );
    await git.note('source', 'flow.mmd', { side: 'right' });
    await git.note('typed edit', missing ? '2 set_label ops' : swapped ? 'labels swapped in first edit' : 'labels in first edit', {
      side: 'right',
    });
    await git.note('checked snapshot', `${committed} warnings, ${final.renderer}`, { side: 'right' });
    this.state.finalWarnings = committed;
  }
}
