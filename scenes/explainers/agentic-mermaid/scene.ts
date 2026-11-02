import { Scene, FadeOut } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, REGIONS } from '../../../explain/index.ts';
const STYLE = 'blueprint';
const BAD = 'graph LR\nA{Cached} --> B[Reply]\nA --> C[Database]';
const GOOD = 'graph LR\nA{Cached} -->|yes| B[Reply]\nA -->|no| C[Database]';
/** The same two edges with their labels swapped: yes now leads to Database. */
const SWAPPED = 'graph LR\nA{Cached} -->|no| B[Reply]\nA -->|yes| C[Database]';
/** Yes on the edge to Reply, no on the edge to Database: replayed on BAD or SWAPPED, they must give GOOD. */
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
/** The script's one-sentence answer, stated in the verify step of every case. */
const ANSWER = 'The verifier checks structure, such as a label on every branch, not whether the labels mean the right thing';
type Edit = 'missing' | 'complete' | 'swapped';

export default class MermaidExplainer extends Scene {
  static meta = {
    id: 'agentic-mermaid',
    title: 'What can a Mermaid verifier prove?',
    sources: [
      'https://github.com/adewale/agentic-mermaid',
      'https://www.npmjs.com/package/agentic-mermaid/v/0.5.1',
      'https://github.com/adewale/agentic-mermaid/blob/main/AGENT_NATIVE.md',
    ],
    // The script's answer and check questions (script.md); the verify step states the answer in every case.
    // test/explain-real.test.ts runs the pinned verifier on each check's diagram.
    answer: ANSWER,
    checks: [
      {
        question: 'The agent labels both edges out of Cached yes. What does verify(flow) report?',
        answer:
          'ok: true and no warnings. Each exit of the decision carries a label, which is what the verifier checks; it does not compare what the two labels say.',
      },
      {
        question:
          'The agent adds a third route out of Cached, to a node D labelled Stale, and gives it no label. How many warnings are there, and which edge do they name?',
        answer:
          'One DECISION_BRANCH_UNLABELED warning, naming the new edge A->D#0. The yes and no edges still carry labels, and ok stays true.',
      },
      {
        question: 'Draw Cached as a rectangle, A[Cached], and leave both edges unlabelled. Does the verifier warn?',
        answer:
          'No: ok: true with no warnings. DECISION_BRANCH_UNLABELED is about the exits of a decision diamond, and a rectangle is not a decision, so there is nothing for it to flag.',
      },
    ],
  };
  static settings = [
    {
      id: 'edit',
      label: 'The agent’s first edit',
      default: 'swapped',
      options: [
        { value: 'swapped', label: 'Labels yes to Database' },
        { value: 'missing', label: 'Leaves out branch labels' },
        { value: 'complete', label: 'Labels yes to Reply' },
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
    /** The verifier's report on each version of the diagram, read from its snapshot while that version is shown. */
    const reports = new Map<string, { ok: boolean; warnings: number }>();
    const record = () => reports.set(d.spec.source!, { ok: d.snapshot.findings.ok, warnings: d.findings().length });
    const reportLines = (heading: string, source: string) => {
      const r = reports.get(source);
      if (!r) throw new Error(`No report recorded for ${heading}`);
      return [heading, `verify(flow).ok: ${r.ok}`, `warnings: ${r.warnings}`];
    };
    const flaggedParts = (warnings: { part?: string; edge?: string }[]) =>
      warnings.map((w) => {
        if (!w.part) throw new Error(`Warning ${w.edge} names no edge part`);
        return w.part;
      });
    const reportOf = (warnings: { code: string; node?: string; edge?: string }[]) => [
      `verify(flow).ok: ${d.snapshot.findings.ok}`,
      `warnings: ${warnings.length}`,
      ...warnings.flatMap((w) => [`  ${w.code}`, `    node ${w.node}, edge ${w.edge}`]),
    ];

    await this.step('source', {
      title: swapped
        ? 'This diagram sends a cache hit to the database'
        : missing
          ? 'Which branch out of Cached means a cache hit?'
          : 'Both branches out of Cached carry a label',
      line: 'Predict: does Agentic Mermaid’s verifier accept this diagram?',
      caption: `${
        swapped
          ? 'An agent drew a cache lookup and got it backwards: yes, the cache has the answer, leads to Database, and no leads to Reply, so a cache hit would query the database the cache exists to spare.'
          : missing
            ? 'An agent drew a cache lookup with two routes out of Cached, one to Reply and one to Database, but did not say which means yes.'
            : 'An agent drew a cache lookup with two routes out of Cached: yes to Reply, no to Database.'
      } Agentic Mermaid parses the Mermaid source into a snapshot with an id for each node and edge, so a check can name the part it means. The verifier ran when this page was built, and the reader shows the findings it recorded.`,
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
      title: missing ? 'verify(flow) returns ok: true, with two warnings' : 'verify(flow) returns ok: true, with no warnings',
      line: missing
        ? 'One DECISION_BRANCH_UNLABELED warning per unlabelled edge, named by its id.'
        : swapped
          ? 'The token follows yes out of Cached, and it reaches Database.'
          : 'Would the report change if the labels were the wrong way round?',
      caption: missing
        ? `Cached is a decision, drawn as a diamond, and each of its exits needs a label, so each unlabelled exit is marked and gets its own warning. ${ANSWER}, so the warnings say a label is missing and nothing about which label belongs where.`
        : swapped
          ? `Cached is a decision, drawn as a diamond, and each of its exits carries a label, so there is nothing to flag. Follow yes and the token walks a real edge from Cached to Database. ${ANSWER}.`
          : `Cached is a decision, drawn as a diamond, and both of its exits carry a label, so nothing is flagged. ${ANSWER}. This diagram happens to be right; the next step swaps its labels and runs the verifier again.`,
    });
    await d.clearNotes();
    const warnings = d.findings();
    this.state.warnings = warnings;
    record();
    if (swapped) {
      this.state.swappedWarnings = warnings.length;
      // The wrong diagram's own path: yes, from Cached to Database.
      const yes = d.snapshot.parts.find((p) => p.id === 'edge:A->C#0');
      if (!yes || yes.to !== 'C' || !SWAPPED.includes('A -->|yes| C[Database]'))
        throw new Error('The swapped diagram must send yes to Database');
      await d.walk([['A', 'C']], { trail: true });
      await d.mark([yes.id], { color: s.bad, as: 'yes, to Database' });
    } else
      await d.mark(
        warnings.length
          ? ['A', ...flaggedParts(warnings)]
          : d.snapshot.parts.filter((p) => p.role === 'edge' && p.from === 'A').map((p) => p.id),
        { as: warnings.length ? 'flagged' : 'checked' },
      );
    // The verifier's report sits under the source it checked.
    const report = await code(reportOf(warnings), 0.22);
    report.moveTo([SIDE[0], source.box()![1] - GAP], [-1, 1]);
    await s.enter(report, { runTime: 0.35 });

    if (swapped) {
      await this.step('flagged', {
        title: 'With both labels deleted, the verifier warns twice',
        line: 'Is the verifier checking anything at all?',
        caption:
          'Take both labels off and verify(flow) returns two DECISION_BRANCH_UNLABELED warnings, one for each exit of the decision, named A->B#0 and A->C#0 by the snapshot’s ids. A missing label is part of the diagram’s structure, so the verifier can see it. It still returns ok: true, because this check is advice, and advice never turns ok false.',
      });
      await s.clearOverlays();
      await d.unmark();
      await d.morph({ source: BAD });
      const flagged = d.findings();
      this.state.flaggedWarnings = flagged.length;
      record();
      await d.mark(['A', ...flaggedParts(flagged)], { as: 'flagged' });
      await column(await code(BAD.split('\n')), await code(reportOf(flagged), 0.22));
    }

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
      record();
      // The same report, rerun on the repaired diagram.
      await report.morph([`verify(flow).ok: ${d.snapshot.findings.ok}`, `warnings: ${d.findings().length}`]);
    }

    await this.step('meaning', {
      title: swapped ? 'Label them the right way round: the report does not change' : 'Swap the labels, and the report does not change',
      line: 'The wrong diagram and the right one get the same report.',
      caption: swapped
        ? 'Two set_label operations put yes on A->B#0 and no on A->C#0; the build replays them on the unlabelled diagram and throws unless the result serializes to this one. Now a cache hit replies from the cache. verify(flow) returns ok: true with no warnings, exactly what it said when yes led to Database. Which label belongs on which branch is the author’s decision, and the cache policy needs its own tests.'
        : 'Swap the two labels with two more set_label operations, so yes leads to Database and a cache hit would query the database. verify(flow) still returns ok: true with no warnings, the same report as the right diagram, and the token walks a real edge from Cached to Database. Which label belongs on which branch is the author’s decision, and the cache policy needs its own tests.',
    });
    await s.clearOverlays();
    await d.unmark();
    if (swapped) {
      await d.morph({ source: GOOD }, { ops: OPS });
      record();
      const yes = d.snapshot.parts.find((p) => p.id === 'edge:A->B#0');
      if (!yes || yes.to !== 'B' || !GOOD.includes('A{Cached} -->|yes| B[Reply]'))
        throw new Error('The repaired diagram must send yes to Reply');
      await d.walk([['A', 'B']], { trail: true });
      await d.mark([yes.id], { color: s.good, as: 'yes, to Reply' });
    } else {
      await d.morph({ source: SWAPPED }, { ops: SWAP });
      record();
      this.state.swappedWarnings = d.findings().length;
      // SWAPPED writes yes on A's edge to C, Database.
      const yes = d.snapshot.parts.find((p) => p.id === 'edge:A->C#0');
      if (!yes || yes.to !== 'C' || !SWAPPED.includes('A -->|yes| C[Database]'))
        throw new Error('The swapped diagram must send yes to Database');
      await d.walk([['A', 'C']], { trail: true });
      await d.mark([yes.id], { color: s.bad, as: 'yes, to Database' });
    }
    // The two reports side by side: the wrong diagram's and the right one's.
    await column(
      await code(d.spec.source!.split('\n')),
      await code(reportLines('yes to Database (wrong):', SWAPPED), 0.22),
      await code(reportLines('yes to Reply (right):', GOOD), 0.22),
    );
    this.state.reports = { wrong: reports.get(SWAPPED), right: reports.get(GOOD) };
    // What the agent's work leaves for the history: the right diagram, repaired if it had to be.
    const committed = reports.get(GOOD)!.warnings,
      renderer = d.snapshot.renderer;

    await this.step('history', {
      detail: true,
      title: 'What the commit history keeps for a reviewer',
      line: 'Three commits in order; the renderer stays pinned at 0.5.1.',
      caption: `The git graph shows the original Mermaid source, the agent’s edit${missing || swapped ? ', repaired by two set_label operations,' : ''} and its checked snapshot as three commits in order. The snapshot stores the verifier’s findings for the right diagram, ${committed} warnings, with the renderer pinned at ${renderer}, so an upgrade is a deliberate change whose snapshot diff gets reviewed. Whether yes belongs on the edge to Reply is for the person reading that diff, or for the application’s tests.`,
    });
    await s.clear();
    const git = await s.show(
      { source: 'gitGraph TB:\n commit id: "source"\n commit id: "typed edit"\n commit id: "checked snapshot"' },
      { box: 'full' },
    );
    await git.note('source', 'flow.mmd', { side: 'right' });
    await git.note('typed edit', missing || swapped ? '2 set_label ops' : 'labels in first edit', { side: 'right' });
    await git.note('checked snapshot', `${committed} warnings, ${renderer}`, { side: 'right' });
    this.state.finalWarnings = committed;
  }
}
