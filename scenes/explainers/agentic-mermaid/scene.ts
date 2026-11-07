import { Scene, Group } from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { stage, settingsOf, regionBox, CodeBlock, answerOf, view } from '../../../explain/index.ts';
import type { Diagram, NoteSide, View } from '../../../explain/index.ts';
import { keyed } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
// This explainer has no model of its own: its reports are agentic-mermaid 0.5.1's, for small three-node
// flowcharts, captured with each diagram's snapshot (the broken source's is written below). It does not
// establish what Mermaid implementations in general accept, and it does not implement the cache-specific
// check the ending describes. DECISION_BRANCH_UNLABELED applies to a decision with two or more exits, not to
// every edge; edge names carry an occurrence count because parallel edges can share endpoints.
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
/** Each scenario's first edit with the edge to Database cut off after its arrow: an edge with no node at its end. */
export const BROKEN: Record<Edit, string> = Object.fromEntries(
  Object.entries(FIRST).map(([edit, source]) => [edit, source.replace(/ C\[Database\]$/, '')]),
) as Record<Edit, string>;
/**
 * What the pinned verifier, agentic-mermaid 0.5.1, returns for every BROKEN source. A diagram that fails verify
 * cannot be captured, so this report is written here, and scene.test.ts runs verifyMermaid on each
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
const SIDE = regionBox('side'),
  GAP = 0.3;
/** Where the meaning step's reports start, and their type size: each report sits beside its own diagram. */
const REPORT_X = SIDE[0],
  REPORT_SIZE = 0.42;
/** The script's one-sentence answer, stated in the verify step of every scenario. */
/** How Agentic Mermaid names an edge, said in the first step whose findings or edits name one. */
const NAMING =
  'Agentic Mermaid names an edge by its two ends and a count: A->C#0 is the first edge from A, Cached, to C, Database.';
/** What the warning code means, said where the first one appears. */
const UNLABELED =
  'DECISION_BRANCH_UNLABELED is the warning for a decision with two or more exits where one exit carries no label';

/** The colours a mark takes: the stage's emphasis, or bad and good for the wrong and right yes paths. */
type Tone = 'emphasis' | 'bad' | 'good';
/** Where a diagram is shown: the main one, the two rows of the meaning step, the history's commits. */
type Slot = 'main' | 'wrong' | 'right' | 'history';
/** A note beside a part of a diagram, as Diagram.note places one. */
interface NoteState { part: string; text: string; side: NoteSide; size?: number }
/** A diagram as a step records it: which source is drawn, which parts are marked and how, and its notes. */
/** How a slot's diagram is shown, apart from its source (which is the model): what it marks and its notes. */
interface DiagramState { marks: { part: string; tone: Tone; as: string }[]; notes: NoteState[] }
/** The verifier's report on a diagram, from its pinned snapshot. */
interface Report { ok: boolean; warnings: { code: string; edge: string; part: string }[]; taskCorrectness: string }

// scene.test.ts runs the pinned verifier on each check question's diagram.
export default class MermaidExplainer extends Scene {
  static meta = {
    sources: [
      'https://github.com/adewale/agentic-mermaid',
      'https://www.npmjs.com/package/agentic-mermaid/v/0.5.1',
      'https://github.com/adewale/agentic-mermaid/blob/main/AGENT_NATIVE.md',
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
    const answer = answerOf(this);
    const edit = settingsOf(this).edit as Edit,
      missing = edit === 'missing',
      swapped = edit === 'swapped',
      s = stage(this, { headingSize: 0.6, style: STYLE });
    const first = FIRST[edit],
      broken = BROKEN[edit];
    const colors: Record<Tone, string> = { emphasis: s.emphasis, bad: s.bad, good: s.good };
    /** A code panel; `focus` puts its bar on line i or lines [a, b]. */
    const block = (lines: readonly string[], fontSize = 0.3, at: Box = SIDE, focus?: number | [number, number]) =>
      new CodeBlock(this, s.palette, lines, { at, fontSize, ...(focus != null ? { focus } : {}) });
    /** Side panels share one left edge and one gap, stacked and centred beside the diagram. */
    const stack = (...panels: Mobject[]) => {
      const total = panels.reduce((h, p) => h + p.height(), 0) + GAP * (panels.length - 1);
      let top = (SIDE[1] + SIDE[3]) / 2 + total / 2;
      for (const p of panels) {
        p.moveTo([SIDE[0], top], [-1, 1]);
        top -= p.height() + GAP;
      }
      return panels;
    };

    // The diagrams on show, by slot. Each is laid out from its pinned snapshot; once built, a view draws
    // it from the state (which source, which parts are marked, which notes it carries) and the live
    // diagram leaves the stage, still the source of geometry, of walks and of the diagram's description.
    const live = new Map<Slot, Diagram>();
    /** What the diagram in `slot` shows: its marks and notes from `shown`, its source checked against the model's; `prefix` keeps two diagrams' part keys apart. */
    const diagramPicture = (slot: Slot, prefix: string) => (state: object, shown: object) => {
      const d = live.get(slot), source = (state as { sources: Partial<Record<Slot, string>> }).sources[slot];
      if (!d || d.spec.source !== source) throw new Error(`The ${slot} diagram on show is not the one the state records`);
      const st = (shown as { diagrams: Partial<Record<Slot, DiagramState>> }).diagrams[slot]!;
      return {
        marks: Object.fromEntries(st.marks.map((m) => [m.part, { color: colors[m.tone], as: m.as }])),
        notes: st.notes.map((n) => ({ id: n.part, text: n.text, side: n.side, ...(n.size ? { size: n.size } : {}) })),
        prefix,
      };
    };
    // Each slot's view prefixes its keys, so two pictures of one diagram can share the stage; what each marks is its picture's emphasis.
    const PREFIX: Record<Slot, string> = { main: '', wrong: 'wrong:', right: 'right:', history: '' };
    /** Show a diagram in a slot, built in, then hand it to a view of the state. The view starts as the built picture. */
    const show = async (slot: Slot, source: string, box: Box | 'main' | 'full') => {
      const d = await s.show({ source }, { box });
      live.set(slot, d);
      return d;
    };
    /** The diagram in `slot` shown by its view: its source in the model, its marks and notes (none yet) in `shown`. */
    const adopt = (slot: Slot, shownNow: DiagramState = { marks: [], notes: [] }) => {
      const d = live.get(slot)!;
      this.state.sources = { ...((this.state.sources as object) ?? {}), [slot]: d.spec.source! };
      this.shown.diagrams = { ...((this.shown.diagrams as object) ?? {}), [slot]: shownNow };
      return s.diagramView(d, diagramPicture(slot, PREFIX[slot]));
    };
    /** Change how a diagram is shown, and play its view's change. */
    const restyle = async (v: View, slot: Slot, change: Partial<DiagramState>, runTime = 0.45) => {
      const all = this.shown.diagrams as Partial<Record<Slot, DiagramState>>;
      this.shown.diagrams = { ...all, [slot]: { ...all[slot]!, ...change } };
      await this.play(v.sync({ staged: false, runTime }));
    };
    /** The verifier's own scope line, read from the snapshot of a diagram. */
    const scope = (d: Diagram) => {
      const checks = (d.snapshot.findings as { checks?: { renderability?: string; taskCorrectness?: string } }).checks;
      if (!checks?.taskCorrectness || !checks.renderability) throw new Error('The pinned verifier must report its check scope');
      return checks as { renderability: string; taskCorrectness: string };
    };
    /** The verifier's report on a diagram, from its snapshot: what the steps record and the panels show. */
    const reportOf = (d: Diagram): Report => ({
      ok: d.snapshot.findings.ok,
      warnings: d.findings().map((w) => {
        if (!w.part) throw new Error(`Warning ${w.edge} names no edge part`);
        return { code: w.code, edge: String(w.edge), part: w.part };
      }),
      taskCorrectness: scope(d).taskCorrectness,
    });
    const reportLines = (r: Report) => [
      `verify(flow).ok: ${r.ok}`,
      `warnings: ${r.warnings.length}`,
      ...r.warnings.flatMap((w) => [`  ${w.code}`, `    edge ${w.edge}`]),
      `taskCorrectness: ${r.taskCorrectness}`,
    ];
    /** Each edge's name, said on the edge: the one to Reply above, the one to Database below. */
    const edgeNames = (d: Diagram): NoteState[] =>
      d.snapshot.parts.filter((p) => p.role === 'edge').map((p) => ({ part: p.id, text: p.id.replace(/^edge:/, ''), side: p.to === 'B' ? 'above' : 'below' }));

    await this.step('source', {
      title: swapped
        ? 'This diagram sends a cache hit to the database'
        : missing
          ? 'Which branch out of Cached means a cache hit?'
          : 'Both branches out of Cached carry a label',
      line: swapped
        ? 'Follow yes out of Cached: it reaches Database.'
        : missing
          ? 'Neither exit from Cached carries a label.'
          : 'Yes reaches Reply; no reaches Database.',
      caption: `${swapped ? 'A cache hit follows yes to Database, while no leads straight to Reply. This reverses the intended cache behavior.' : missing ? 'Cached has a path to Reply and another to Database, but their labels do not say which path is a hit.' : 'A cache hit follows yes to Reply, while no leads to Database.'} Agentic Mermaid’s verify(flow) returns a report about the source. Will it accept this diagram?`,
    });
    await show('main', first, 'main');
    const main = adopt('main');
    // The source beside it, near the top of the side, leaving room under it for the report the next step adds.
    const sourceAt = (st: object) => {
      const source = block((st as { sources: Record<Slot, string> }).sources.main!.split('\n'));
      return source.moveTo([SIDE[0], SIDE[3] - 0.5], [-1, 1]);
    };
    const sourcePanel = view(this, (st) => keyed(sourceAt(st), 'mermaid-source'), { place: false });
    await s.enter(sourcePanel, { runTime: 0.35 });

    await this.step('verify', {
      title: missing ? 'verify(flow) returns ok: true, with two warnings' : 'verify(flow) returns ok: true, with no warnings',
      line: missing
        ? 'One DECISION_BRANCH_UNLABELED warning per unlabelled edge, named by its id.'
        : swapped
          ? 'The dot follows the yes edge as drawn: from Cached to Database.'
          : 'Would the report change if the labels were the wrong way round?',
      caption: missing ? `${UNLABELED}. ${NAMING} Warnings identify missing structural information while ok stays true. ${answer}.` : swapped ? `The source renders and both exits of the decision carry labels, so the report has no warnings, even though its yes path reaches Database. Its last line, taskCorrectness: not-checked, marks where the check stops. ${answer}. The next two steps show the failure and the warning.` : `The source renders and both decision exits carry labels, so the report has no warnings. That does not prove that the labels express the right behavior. ${answer}. Would reversed labels get a different report?`,
    });
    const d = live.get('main')!;
    const verified = reportOf(d);
    const warnings = d.findings();
    this.state.warnings = warnings;
    this.state.taskCorrectness = verified.taskCorrectness;
    this.state.report = verified;
    const firstWarnings = warnings.length;
    if (swapped) {
      this.state.swappedWarnings = warnings.length;
      // The wrong diagram's own path: yes, from Cached to Database.
      const yes = d.snapshot.parts.find((p) => p.id === 'edge:A->C#0');
      if (!yes || yes.to !== 'C' || !SWAPPED.includes('A -->|yes| C[Database]'))
        throw new Error('The swapped diagram must send yes to Database');
      await d.walk([['A', 'C']]);
      await restyle(main, 'main', { marks: [{ part: yes.id, tone: 'bad', as: 'yes, to Database' }] });
    } else {
      if (missing) await restyle(main, 'main', { notes: edgeNames(d) }, 0.35);
      const parts = verified.warnings.length
        ? ['A', ...verified.warnings.map((w) => w.part)]
        : d.snapshot.parts.filter((p) => p.role === 'edge' && p.from === 'A').map((p) => p.id);
      await restyle(main, 'main', { marks: parts.map((part) => ({ part, tone: 'emphasis', as: verified.warnings.length ? 'flagged' : 'checked' })) });
    }
    // The verifier's report sits under the source it checked.
    const reportPanel = view(
      this,
      (st) => {
        const report = block(reportLines((st as unknown as { report: Report }).report));
        return keyed(report.moveTo([SIDE[0], sourceAt(st).box()![1] - GAP], [-1, 1]), 'mermaid-report');
      },
      { place: false },
    );
    await s.enter(reportPanel, { runTime: 0.35 });

    // A source the renderer cannot draw: its text, the pinned verifier's report on it, the line that breaks it.
    const brokenPicture = (st: { broken: typeof BROKEN_REPORT & { source: string } }) => {
      // The line that breaks it in focus.
      const source = block(st.broken.source.split('\n'), 0.42, regionBox('main'), 2);
      const report = block([
        `verify(flow).ok: ${st.broken.ok}`,
        `warnings: ${st.broken.warnings.length}`,
        ...st.broken.warnings.map((w) => `  ${w.code} (${w.severity})`),
        `renderability: ${st.broken.checks.renderability}`,
        `taskCorrectness: ${st.broken.checks.taskCorrectness}`,
      ]);
      const note = this.text('The renderer cannot draw this source: no picture', { fontSize: 0.28, color: s.soft }).moveTo([-3.2, -2.6]);
      return new Group(source, ...stack(report), note);
    };
    await s.steps([
      stagedStep({
        id: 'broken',
        title: 'Cut the end off an edge, and verify returns ok: false',
        line: 'With no node at the end of its last arrow, can this source be drawn at all?',
        caption: `The last arrow has no destination. This pinned renderer cannot draw it, so RENDER_FAILED makes ok false; UNSUPPORTED_SYNTAX identifies the dangling edge. The failure establishes a rendering problem without needing to know what a cache should do.`,
        state: { broken: { source: broken, ...BROKEN_REPORT } },
        draw: (st) => brokenPicture(st),
      }),
    ]);

    /** The side column of a step: code panels from the state's lines, stacked. */
    const column = (key: string) =>
      view(this, (st) => keyed(new Group(...stack(...(st as unknown as { column: string[][] }).column.map((lines) => block(lines)))), key), { place: false });
    if (swapped) {
      await this.step('flagged', {
        title: 'Delete both labels, and the verifier warns twice',
        line: 'Does a missing label turn ok false too?',
        caption: `${UNLABELED}. ${NAMING} The warnings identify the unlabelled paths to Reply and Database. The diagram still renders, so ok stays true. A missing label is structural information the verifier can detect; choosing the correct label needs task knowledge.`,
      });
      await s.clear();
      const flaggedDiagram = await show('main', BAD, 'main');
      const flagged = reportOf(flaggedDiagram);
      this.state.flaggedWarnings = flagged.warnings.length;
      this.state.report = flagged;
      const v = adopt('main');
      await restyle(v, 'main', { notes: edgeNames(flaggedDiagram) }, 0.35);
      await restyle(v, 'main', { marks: ['A', ...flagged.warnings.map((w) => w.part)].map((part) => ({ part, tone: 'emphasis', as: 'flagged' })) });
      this.state.column = [BAD.split('\n'), reportLines(flagged)];
      const side = column('mermaid-flagged-column');
      await s.enter(side, { runTime: 0.35 });
    }

    if (missing) {
      await this.step('repair', {
        title: 'Two set_label operations clear both warnings',
        line: 'Each operation names the edge it changes by its id.',
        caption: 'set_label changes the label of a named edge. Here yes goes on A->B#0 and no on A->C#0, removing the missing-label warnings. That repairs the structural omission; it does not make the warning rule a test of cache behavior.',
      });
      await s.clear();
      const repaired = await show('main', BAD, 'main');
      this.state.ops = OPS;
      /** The edits as code, in the side column, all in focus. */
      const opsBlock = (st: object) => {
        const ops = (st as unknown as { ops: typeof OPS }).ops;
        return stack(block(ops.flatMap((op) => [`{ kind: '${op.kind}',`, `  target: '${op.target}',`, `  label: '${op.label}' }`]), 0.3, SIDE, [0, ops.length * 3 - 1]))[0] as CodeBlock;
      };
      const opsPanel = view(this, (st) => keyed(opsBlock(st), 'mermaid-ops'), { place: false });
      await s.enter(opsPanel, { runTime: 0.35 });
      // The edits are replayed through Agentic Mermaid at build time, and must give the labelled source.
      await repaired.morph({ source: GOOD }, { ops: OPS });
      const v = adopt('main');
      await restyle(v, 'main', { marks: OPS.map((op) => ({ part: `edge:${op.target}`, tone: 'emphasis', as: 'marked' })) });
      const rerun = reportOf(repaired);
      this.state.rerun = { ok: rerun.ok, warnings: rerun.warnings.length };
      const rerunPanel = view(
        this,
        (st) => {
          const r = (st as unknown as { rerun: { ok: boolean; warnings: number } }).rerun;
          const panel = block([`verify(flow).ok: ${r.ok}`, `warnings: ${r.warnings}`]);
          return keyed(panel.moveTo([SIDE[0], opsBlock(st).box()![1] - GAP], [-1, 1]), 'mermaid-rerun');
        },
        { place: false },
      );
      await s.enter(rerunPanel, { runTime: 0.35 });
    }

    await this.step('meaning', {
      title: swapped ? 'Label them the right way round: the report does not change' : 'Swap the labels, and the report does not change',
      line: 'Same report beside both. Follow yes: Database above, Reply below.',
      caption: swapped ? 'Two set_label edits, each naming one edge, put yes on the path to Reply and no on the path to Database. The corrected diagram sits below the backwards one, and both reports say ok: true with no warnings. Following yes out of Cached tells them apart: a hit reaches Database above and Reply below. A check that a cache hit reaches Reply without querying Database would catch the backwards one; this page describes that missing check rather than implementing it.' : `${missing ? 'Two further set_label edits' : `${NAMING} A set_label edit changes the label on one named edge; two of them`} reverse the behavior in the upper diagram: a hit now follows yes to Database, while in the lower one it still reaches Reply. Both reports say ok: true with no warnings. Both drawings meet the same structural rules, so those rules cannot tell which one performs the cache’s job; following the yes path can.`,
    });
    await s.clear();
    for (const stale of ['sources', 'column', 'ops', 'rerun', 'report', 'flaggedWarnings']) delete this.state[stale];
    delete this.shown.diagrams;
    // The wrong diagram above and the right one below, each with its report beside it. The scenario's own edit makes
    // one from the other: the swapped scenario repairs the unlabelled diagram, the others swap the right one's labels.
    // Where a cache hit goes is read from each drawn snapshot (the edge labelled yes, and the node at its end); the
    // reports beside them are the pinned verifier's findings for the same sources.
    const rows = {
      wrong: regionBox('full', { right: REPORT_X - 0.4, bottom: -0.2 }),
      right: regionBox('full', { right: REPORT_X - 0.4, top: -0.8 }),
    };
    const wrong = await show('wrong', swapped ? SWAPPED : GOOD, rows.wrong);
    const right = await show('right', swapped ? BAD : GOOD, rows.right);
    const edited = swapped ? right : wrong;
    // The edits are replayed through Agentic Mermaid at build time, and must give the other diagram's source.
    await edited.morph({ source: swapped ? GOOD : SWAPPED }, { ops: swapped ? OPS : SWAP });
    // The swapped labels' report: the first edit's in the swapped scenario, the edited diagram's in the others.
    this.state.swappedWarnings = swapped ? firstWarnings : edited.findings().length;
    // The two diagrams' parts share ids, so each view keys its picture's parts by its row.
    const views = { wrong: adopt('wrong'), right: adopt('right') };
    // This scenario's caption names an edge by its id for the first time here, so the edited diagram's edges carry their ids.
    if (edit === 'complete') await restyle(views.wrong, 'wrong', { notes: edgeNames(wrong) }, 0.35);
    /** Where a cache hit goes: the edge carrying the yes label, and the node at its end, read from the drawn snapshot. */
    const hitOf = (g: Diagram) => {
      const label = g.snapshot.parts.find((p) => p.role === 'edge-label' && p.shapes.some((sh) => sh.textRun?.text === 'yes'));
      const edge = g.snapshot.parts.find((p) => p.id === label?.owner);
      const node = g.snapshot.parts.find((p) => p.id === edge?.to)?.shapes.find((sh) => sh.textRun)?.textRun?.text;
      if (!edge?.from || !edge.to || !node) throw new Error(`${g.spec.source} has no yes edge to a named node`);
      return { edge: edge.id, from: edge.from, to: edge.to, node };
    };
    const hit = { wrong: hitOf(wrong), right: hitOf(right) };
    for (const [slot, g, h, tone] of [
      ['wrong', wrong, hit.wrong, 'bad'],
      ['right', right, hit.right, 'good'],
    ] as const) {
      await g.walk([[h.from, h.to]]);
      await restyle(views[slot], slot, { marks: [{ part: h.edge, tone, as: `yes, to ${h.node}` }] });
    }
    this.state.hit = {
      wrong: { edge: hit.wrong.edge, node: hit.wrong.node },
      right: { edge: hit.right.edge, node: hit.right.node },
    };
    const brief = (g: Diagram) => ({ ok: g.snapshot.findings.ok, warnings: g.findings().length });
    this.state.reports = { wrong: brief(wrong), right: brief(right) };
    // Each report beside its diagram, the two stacked either side of the rows' boundary, in type large enough to read
    // on a 320 px phone with both reports in one view.
    const between = (rows.wrong[1] + rows.right[3]) / 2;
    const reportBeside = (row: 'wrong' | 'right') =>
      view(
        this,
        (state) => {
          const st = state as unknown as { hit: Record<'wrong' | 'right', { node: string }>; reports: Record<'wrong' | 'right', { ok: boolean; warnings: number }> };
          const r = st.reports[row];
          const panel = block([`yes to ${st.hit[row].node}`, `ok: ${r.ok}`, `warnings: ${r.warnings}`], REPORT_SIZE);
          panel.moveTo([REPORT_X, row === 'wrong' ? between + 0.1 : between - 0.1], [-1, row === 'wrong' ? -1 : 1]);
          return keyed(panel, `mermaid-report-${row}`);
        },
        { place: false },
      );
    const reports = { wrong: reportBeside('wrong'), right: reportBeside('right') };
    await s.enter(reports.wrong, reports.right, { runTime: 0.35 });
    // On a phone the step opens on the two reports, whose first lines name where each yes path ends;
    // the diagrams and their coloured paths follow in the close-up tour.
    s.opening(reports.wrong, reports.right);
    // What the agent's work leaves for the history: the right diagram, repaired if it had to be.
    const committed = reportOf(right);
    // Every diagram that reaches the history drew, and none had its task checked: the caption says so.
    if (scope(right).renderability !== 'passed' || committed.taskCorrectness !== 'not-checked') throw new Error('Unexpected verifier scope');

    await this.step('history', {
      kind: 'detail',
      title: 'The saved report still says the task was not checked',
      line: 'Three commits in order, the last with the verifier’s findings.',
      caption: `The history keeps source, edit and checked snapshot as separate commits. The snapshot records what this renderer drew and the findings it returned, including taskCorrectness: not-checked. Committing a clean report keeps that evidence; it does not widen what the verifier checked.`,
    });
    await s.clear();
    delete this.state.sources;
    delete this.shown.diagrams;
    this.state.finalWarnings = committed.warnings.length;
    await show('history', 'gitGraph TB:\n commit id: "source"\n commit id: "typed edit"\n commit id: "checked snapshot"', 'full');
    const history = adopt('history');
    // Each commit's note: the file, the edit the scenario made, and the committed report's findings.
    const notes: NoteState[] = [
      { part: 'source', text: 'flow.mmd', side: 'right', size: 0.34 },
      { part: 'typed edit', text: missing || swapped ? '2 set_label ops' : 'labels in first edit', side: 'right', size: 0.34 },
      { part: 'checked snapshot', text: `${committed.warnings.length} warnings; task: ${committed.taskCorrectness}`, side: 'right', size: 0.34 },
    ];
    for (const [i] of notes.entries()) await restyle(history, 'history', { notes: notes.slice(0, i + 1) }, 0.35);
  }
}
