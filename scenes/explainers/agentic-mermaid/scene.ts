import { Scene } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, REGIONS } from '../../../explain/index.ts';
import type { Diagram } from '../../../explain/index.ts';
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
type Edit = 'missing' | 'complete' | 'swapped';
const FIRST: Record<Edit, string> = { missing: BAD, swapped: SWAPPED, complete: GOOD };
/** Each case's first edit with the edge to Database cut off after its arrow: an edge with no node at its end. */
export const BROKEN: Record<Edit, string> = Object.fromEntries(
  Object.entries(FIRST).map(([edit, source]) => [edit, source.replace(/ C\[Database\]$/, '')]),
) as Record<Edit, string>;
/**
 * What the pinned verifier, agentic-mermaid 0.5.1, returns for every BROKEN source. A diagram that fails verify
 * cannot be captured, so this report is written here, and test/explain-real.test.ts runs verifyMermaid on each
 * BROKEN source and requires exactly this.
 */
export const BROKEN_REPORT = {
  ok: false,
  warnings: [
    { code: 'RENDER_FAILED', severity: 'error' },
    { code: 'UNSUPPORTED_SYNTAX', severity: 'warning', syntax: 'flowchart_dangling_edge' },
  ],
  checks: { renderability: 'failed', taskCorrectness: 'not-checked' },
} as const;
const SIDE = REGIONS.side,
  GAP = 0.3;
/** The script's one-sentence answer, stated in the verify step of every case. */
const ANSWER =
  'Verify fails a diagram that Mermaid cannot draw, warns about gaps in its structure such as an unlabelled branch, and leaves what the labels mean unchecked';

export default class MermaidExplainer extends Scene {
  static meta = {
    id: 'agentic-mermaid',
    title: 'What does a Mermaid verifier check?',
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
        question:
          'The agent writes the second edge as A -->|no| D, and D appears nowhere else in the source. What does verify(flow) report?',
        answer:
          'ok: true and no warnings. Mermaid creates D where it is first used, as a rectangle labelled D, so the diagram draws and both exits of the decision carry labels. That the agent meant Database is the kind of thing verify leaves unchecked.',
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
      {
        question: 'The agent writes the first line as graph, with no direction after it. What does verify(flow) report?',
        answer:
          'ok: false, with a RENDER_FAILED error: Mermaid rejects a graph header with no direction, so the diagram cannot be drawn, however right its labels are.',
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
    const first = FIRST[edit],
      broken = BROKEN[edit];
    const code = (lines: readonly string[], fontSize = 0.3) => s.code(lines, { at: SIDE, fontSize, enter: false });
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
    let d: Diagram;
    /** The verifier's own scope line, read from the snapshot of the diagram on show. */
    const scope = () => {
      const checks = (d.snapshot.findings as { checks?: { renderability?: string; taskCorrectness?: string } }).checks;
      if (!checks?.taskCorrectness || !checks.renderability) throw new Error('The pinned verifier must report its check scope');
      return checks as { renderability: string; taskCorrectness: string };
    };
    const taskCorrectness = () => scope().taskCorrectness;
    /** The verifier's report on each version of the diagram, read from its snapshot while that version is shown. */
    const reports = new Map<string, { ok: boolean; warnings: number }>();
    const record = () => reports.set(d.spec.source!, { ok: d.snapshot.findings.ok, warnings: d.findings().length });
    const reportLines = (heading: string, source: string) => {
      const r = reports.get(source);
      if (!r) throw new Error(`No report recorded for ${heading}`);
      return [heading, `ok: ${r.ok}`, `warnings: ${r.warnings}`];
    };
    const flaggedParts = (warnings: { part?: string; edge?: string }[]) =>
      warnings.map((w) => {
        if (!w.part) throw new Error(`Warning ${w.edge} names no edge part`);
        return w.part;
      });
    const reportOf = (warnings: { code: string; node?: string; edge?: string }[]) => [
      `verify(flow).ok: ${d.snapshot.findings.ok}`,
      `warnings: ${warnings.length}`,
      ...warnings.flatMap((w) => [`  ${w.code}`, `    edge ${w.edge}`]),
      `taskCorrectness: ${taskCorrectness()}`,
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
      } Agentic Mermaid reads the source and names each part: a node by its Mermaid id, A for Cached, and an edge by its two ends and a count, so A->C#0 is the first edge from A to C. The verifier’s findings use these names.`,
    });
    d = await s.show({ source: first }, { box: 'main' });
    const source = await code(first.split('\n'));
    // Near the top of the side, leaving room under it for the report the next step adds.
    source.moveTo([SIDE[0], SIDE[3] - 0.5], [-1, 1]);
    await s.enter(source, { runTime: 0.35 });
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
          ? 'The dot follows the yes edge as drawn: from Cached to Database.'
          : 'Would the report change if the labels were the wrong way round?',
      caption: missing
        ? `Cached is a decision, drawn as a diamond, and each of its exits needs a label, so each unlabelled exit is marked and gets its own warning. A warning is advice: ok stays true. The report’s last line, taskCorrectness: not-checked, says the verifier never asked what the diagram is for. ${ANSWER}.`
        : swapped
          ? `Cached is a decision, drawn as a diamond, and each of its exits carries a label, so there is nothing to flag. The report’s last line, taskCorrectness: not-checked, is the verifier’s own note that it did not judge whether the diagram does its job. ${ANSWER}.`
          : `Cached is a decision, drawn as a diamond, and both of its exits carry a label, so nothing is flagged. The last line, taskCorrectness: not-checked, means the verifier did not test the diagram against its purpose. ${ANSWER}. This diagram happens to be right; a later step swaps its labels and runs the verifier again.`,
    });
    await d.clearNotes();
    const warnings = d.findings();
    this.state.warnings = warnings;
    this.state.taskCorrectness = taskCorrectness();
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
    const report = await code(reportOf(warnings));
    report.moveTo([SIDE[0], source.box()![1] - GAP], [-1, 1]);
    await s.enter(report, { runTime: 0.35 });

    await this.step('broken', {
      title: 'Cut the end off an edge, and verify returns ok: false',
      line: 'Predict: with no node at the end of its last arrow, can this source be drawn at all?',
      caption: `Here the edge to Database stops at its arrow: the last line ends ${broken.split('\n').at(-1)} with no node after it. Mermaid rejects that, so the verifier reports RENDER_FAILED, an error, and errors are the findings that turn ok false. It adds an UNSUPPORTED_SYNTAX warning that names the problem, a dangling edge, and its scope lines read renderability: failed and taskCorrectness: not-checked. With no drawing, there is nothing to point a dot or a label at.`,
    });
    await s.clear();
    const brokenSource = await s.code(broken.split('\n'), { at: REGIONS.main, fontSize: 0.42, enter: false });
    const brokenReport = await code([
      `verify(flow).ok: ${BROKEN_REPORT.ok}`,
      `warnings: ${BROKEN_REPORT.warnings.length}`,
      ...BROKEN_REPORT.warnings.map((w) => `  ${w.code} (${w.severity})`),
      `renderability: ${BROKEN_REPORT.checks.renderability}`,
      `taskCorrectness: ${BROKEN_REPORT.checks.taskCorrectness}`,
    ]);
    await s.enter(brokenSource, { runTime: 0.35 });
    await column(brokenReport);
    await brokenSource.focus(2, { as: 'an edge with no end' });
    await s.note('Mermaid cannot draw this source, so there is no picture', { at: [-2.6, -2.6], size: 0.3 });
    this.state.broken = { source: broken, ...BROKEN_REPORT };

    if (swapped) {
      await this.step('flagged', {
        title: 'Delete both labels, and the verifier warns twice',
        line: 'Predict: does a missing label turn ok false too?',
        caption:
          'Back to a diagram that draws, now with both labels taken off. verify(flow) returns two DECISION_BRANCH_UNLABELED warnings, one for each exit of the decision, named A->B#0 and A->C#0. A missing label is part of the diagram’s structure, so the verifier can see it. Each is a warning, advice for the author, so ok stays true.',
      });
      await s.clear();
      d = await s.show({ source: BAD }, { box: 'main' });
      const flagged = d.findings();
      this.state.flaggedWarnings = flagged.length;
      record();
      await d.mark(['A', ...flaggedParts(flagged)], { as: 'flagged' });
      await column(await code(BAD.split('\n')), await code(reportOf(flagged)));
    }

    if (missing) {
      await this.step('repair', {
        title: 'Two set_label operations clear both warnings',
        line: 'Each operation names the edge it changes by its id.',
        caption:
          'Back to the unlabelled diagram. set_label is an Agentic Mermaid edit that names one edge by its id and sets that edge’s label, so the agent changes those two edges and nothing else in the source. One puts yes on A->B#0 and the other puts no on A->C#0. Verified again, the diagram has no warnings.',
      });
      await s.clear();
      d = await s.show({ source: BAD }, { box: 'main' });
      const ops = await code(
        OPS.flatMap((op) => [`{ kind: '${op.kind}',`, `  target: '${op.target}',`, `  label: '${op.label}' }`]),
      );
      await column(ops);
      await ops.focus([0, OPS.length * 3 - 1]);
      await d.morph({ source: GOOD }, { ops: OPS });
      await d.mark(OPS.map((op) => `edge:${op.target}`));
      record();
      const rerun = await code([`verify(flow).ok: ${d.snapshot.findings.ok}`, `warnings: ${d.findings().length}`]);
      rerun.moveTo([SIDE[0], ops.box()![1] - GAP], [-1, 1]);
      await s.enter(rerun, { runTime: 0.35 });
    }

    await this.step('meaning', {
      title: swapped ? 'Label them the right way round: the report does not change' : 'Swap the labels, and the report does not change',
      line: 'The wrong diagram and the right one get the same report.',
      caption: swapped
        ? 'set_label is an Agentic Mermaid edit that names one edge by its id and sets that edge’s label. Two of them put yes on A->B#0 and no on A->C#0, and now a cache hit replies from the cache. verify(flow) returns ok: true with no warnings, the report it gave when yes led to Database. Only someone who knows what the cache is for can tell the two apart.'
        : `${missing ? 'Two more set_label edits' : 'Two set_label edits, Agentic Mermaid operations that each name one edge by its id and set its label,'} swap the labels, so yes leads to Database and a cache hit would query the database. verify(flow) still returns ok: true with no warnings, the right diagram’s report, while the dot now follows yes from Cached to Database. ${
            missing
              ? 'The two set_label edits that repaired the diagram could just as well have written the labels this way round.'
              : 'The agent’s first edit was right, and the verifier had no way to say so.'
          }`,
    });
    // The swapped and missing cases still show a diagram that draws; the complete case left it at the broken step.
    if (edit === 'complete') {
      await s.clear();
      d = await s.show({ source: GOOD }, { box: 'main' });
    } else {
      await s.clearOverlays();
      await d.unmark();
    }
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
      await code(reportLines('yes to Database (wrong):', SWAPPED)),
      await code(reportLines('yes to Reply (right):', GOOD)),
    );
    this.state.reports = { wrong: reports.get(SWAPPED), right: reports.get(GOOD) };
    // What the agent's work leaves for the history: the right diagram, repaired if it had to be.
    const committed = reports.get(GOOD)!.warnings,
      renderer = d.snapshot.renderer;
    // Every diagram that reaches the history drew, and none had its task checked: the caption says so.
    if (scope().renderability !== 'passed' || taskCorrectness() !== 'not-checked') throw new Error('Unexpected verifier scope');

    await this.step('history', {
      detail: true,
      title: 'What the commit history keeps',
      line: 'Three commits in order, the last with the verifier’s findings.',
      caption: `The git graph shows the Mermaid source, the agent’s edit${missing || swapped ? ', made with two set_label operations,' : ''} and a checked snapshot as three commits in order. A snapshot is the diagram as Agentic Mermaid parsed and drew it, saved with the verifier’s findings: here ${committed} warnings, renderability: passed and taskCorrectness: not-checked, from ${renderer}. Anyone reading that commit can see which question the verifier left open.`,
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
