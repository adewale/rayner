import { Group, Line, Rectangle, keyed } from '../../../src/index.ts';
import type { Stage, StagedStepsOptions } from '../../../explain/index.ts';
import { tally, criteria, change, CRITERIA, LEVELS, VERSIONS, inVersion, atLevel } from './model.ts';
import type { Criterion, Level, Version } from './model.ts';
import { tile, label, table } from '../../../explain/drawing.ts';
import { legend } from '../../../explain/drawing.ts';

/**
 * Every criterion some version asks for at `level`, one column each: grouped by level, and within a
 * level 2.0's kept criteria, then the one 2.2 removed, then 2.1's additions, then 2.2's.
 */
export function columns(level: Level): Criterion[] {
  const at = (c: Criterion) => (c.removed ? 1 : c.added === '2.0' ? 0 : c.added === '2.1' ? 2 : 3);
  const num = (c: Criterion) => c.num.split('.').map(Number);
  return CRITERIA.filter((c) => atLevel(c, level) && VERSIONS.some((v) => inVersion(c, v))).sort((a, b) => {
    const d = LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || at(a) - at(b);
    if (d) return d;
    const [x, y] = [num(a), num(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
    return 0;
  });
}

/** The versions step's model: the level, each version's count, the columns, and each version's row of criterion numbers. */
interface Lists { level: Level; totals: number[]; columns: string[]; rows: Record<string, string[]> }
/** One row per version, one cell per column it asks for, coloured by the version that added it;
 *  level brackets above, each version's count at the right, and 4.1.1 Parsing's gap named below. */
function lists(st: Lists, s: Stage) {
  const cols = st.columns.map((num) => CRITERIA.find((c) => c.num === num)!);
  const levels = LEVELS.slice(0, LEVELS.indexOf(st.level) + 1);
  const GAP = 0.3,
    x0 = -5.0,
    x1 = 5.0;
  const pitch = (x1 - x0 - GAP * (levels.length - 1)) / cols.length;
  const x = (i: number) => x0 + pitch * (i + 0.5) + GAP * levels.indexOf(cols[i]!.level);
  const rowY = (r: number) => 0.95 - r * 1.2;
  const colour: Record<Version, string> = { '2.0': s.look.soft, '2.1': s.look.emphasis, '2.2': s.look.good };
  const g = new Group();
  for (const l of levels) {
    const at = cols.flatMap((c, i) => (c.level === l ? [i] : []));
    const a = x(at[0]!) - pitch / 2,
      b = x(at.at(-1)!) + pitch / 2;
    g.add(new Line([a, 1.75], [b, 1.75], { stroke: s.look.ink, strokeWidth: 0.03 }), label(s, l, { at: [(a + b) / 2, 2.25] }));
  }
  g.add(label(s, 'Criteria', { at: [6.45, 2.25] }));
  VERSIONS.forEach((v, r) => {
    const y = rowY(r);
    g.add(label(s, v, { at: [-5.85, y], size: 0.62 }), label(s, st.totals[r]!, { at: [6.45, y], size: 0.62 }));
    cols.forEach((c, i) => {
      if (st.rows[v]!.includes(c.num))
        g.add(
          new Rectangle({ width: pitch * 0.78, height: 0.8, fill: c.removed ? s.look.bad : colour[c.added], stroke: 'none' }).moveTo([x(i), y]),
        );
      else if (c.removed && v === c.removed) {
        const gap = new Rectangle({ width: pitch * 0.78, height: 0.8, fill: 'none', stroke: s.look.bad, strokeWidth: 0.03 }).moveTo([x(i), y]);
        gap.style.dashArray = '0.08 0.06';
        g.add(gap);
      }
    });
  });
  const parsing = cols.findIndex((c) => c.removed);
  const below = rowY(VERSIONS.length - 1) - 0.4;
  g.add(
    new Line([x(parsing), below - 0.05], [x(parsing), below - 0.55], { stroke: s.look.bad, strokeWidth: 0.03 }),
    label(s, '4.1.1 Parsing', { at: [x(parsing), below - 0.95], color: s.look.bad }),
  );
  // The key: each cell's colour names the version that added its criterion, and the dashed outline the gap 2.2 left.
  // The strip carries its own key so the colours read with the caption hidden.
  const lead = label(s, 'Added in').moveTo([0, 0], [-1, 0]);
  const swatches = legend(
    s,
    [
      { label: '2.0', fill: colour['2.0'] },
      { label: '2.1', fill: colour['2.1'] },
      { label: '2.2', fill: colour['2.2'] },
      { label: 'Removed', fill: s.look.bad },
      { label: 'Gap', fill: 'none', stroke: s.look.bad, dashed: true },
    ],
    { size: 0.6, stack: 'row', gap: 0.18, key: 'versions-legend' },
  );
  swatches.moveTo([lead.width() + 0.24, 0], [-1, 0]);
  const key = new Group(lead, swatches);
  keyed(key, 'versions-key');
  // Under the table, starting where its rows start, so the key is never wider than the table: a
  // phone's opening must show both whole.
  g.add(key.moveTo([g.box()![0], -3.75], [-1, 0]));
  return g;
}

/** The script's one-sentence answer (script.md), stated by the version step. */
export function frames(stage: Stage, level: Level, guideline: string, answer: string, opts?: StagedStepsOptions): Promise<void> {
  const t20 = tally('2.0', level),
    t21 = tally('2.1', level),
    total = tally('2.2', level),
    a = tally('2.2', 'A').total,
    selected = criteria('2.2', level, guideline),
    focus = criteria('2.2', level).some((c) => c.num === '2.4.7');
  const c21 = change('2.0', '2.1', level),
    c22 = change('2.1', '2.2', level);
  const buttons = ['Cancel', 'Pay'],
    at = (button: string, row: readonly string[]) => -3.5 + 7 * row.indexOf(button);
  return stage.steps([
    // An illustration of Focus Visible, not a claim that an outline alone meets every focus-related criterion.
    {
      id: 'reader-focus',
      title: 'The outline shows which button Tab reached',
      line: 'Success criterion 2.4.7 Focus Visible asks for the lower drawing; WCAG files it at level AA.',
      caption: `Press Tab on a payment form and focus moves to Cancel or Pay. In the upper drawing nothing shows which, so pressing Enter is a guess; in the lower one an outline marks Pay. Focus Visible requires that keyboard focus be visible. Whether a site must meet it depends on two choices in its accessibility policy: a conformance level and a WCAG version. ${
        focus
          ? `At level ${level}, Focus Visible is on the list.`
          : `At level ${level}, it is not on the list: it is a level AA criterion.`
      }`,
      // The form both drawings show, and the button Tab reached, which only the lower one outlines.
      state: { level, focusRequired: focus, buttons, focused: 'Pay' },
      draw: (st, s) =>
        new Group(
          label(s, 'No visible focus', { at: [0, 2.5], color: s.look.soft, size: 0.7 }),
          ...st.buttons.map((b) => tile(s, b, { at: [at(b, st.buttons), 1.3], width: 5, height: 1 })),
          label(s, `Visible focus on ${st.focused}`, { at: [0, -0.2], size: 0.7 }),
          ...st.buttons.map((b) => tile(s, b, { at: [at(b, st.buttons), -1.5], width: 5, height: 1 })),
          new Rectangle({ width: 5.45, height: 1.45, fill: 'none', stroke: s.look.emphasis, strokeWidth: 0.09 }).moveTo([
            at(st.focused, st.buttons), -1.5,
          ]),
        ),
    },
    {
      id: 'reader-levels',
      title: `Level ${level} asks for ${total.total} criteria in WCAG 2.2`,
      line: 'Each row includes the rows above it.',
      caption: `Does aiming for AA mean checking the criteria labelled AA? WCAG’s conformance requirements say a level AA page satisfies all the level A and level AA criteria, or offers an alternate version that does, so level AA’s list in WCAG 2.2 is ${a} at level A plus ${tally('2.2', 'AA').total - a} at AA. At level ${level}, the selected level, the list holds ${total.total} criteria, ${selected.length} of them under guideline ${guideline}. A count names the set to evaluate; it is not a conformance result.`,
      // `levels`: the table the picture shows, each level with the levels it includes and its WCAG 2.2 count.
      state: {
        level,
        total: total.total,
        guideline,
        count: selected.length,
        levels: LEVELS.map((l, i) => ({ level: l, includes: LEVELS.slice(0, i + 1).join(' + '), total: tally('2.2', l).total })),
      },
      draw: (st, s) =>
        table(s, ['Level', 'Includes', 'WCAG 2.2'], st.levels.map((r) => [r.level, r.includes, r.total]), { key: 'comparison', columns: [-5, -0.8, 5.4], gap: 1.5, at: [0, 2.6] }),
    },
    {
      id: 'reader-versions',
      title: `Level ${level} asks for ${t20.total}, ${t21.total} or ${total.total} criteria, by version`,
      line: `One column per criterion, one row per version: 2.2 adds ${c22.added.length} and leaves a gap at 4.1.1 Parsing.`,
      caption: `Each column is one criterion at ${level === 'A' ? 'level A' : `level ${level} or below`}, coloured by the version that added it; each row is one version’s list. WCAG 2.1 added ${c21.added.length}; 2.2 added ${c22.added.length} and removed 4.1.1 Parsing, the dashed gap in its row. A newer version is not the older list plus extras, so “level ${level}” without a version names no list. ${answer}.`,
      state: {
        level,
        totals: [t20.total, t21.total, total.total],
        added21: c21.added.length,
        added22: c22.added.length,
        removed22: c22.removed,
        columns: columns(level).map((c) => c.num),
        rows: Object.fromEntries(
          VERSIONS.map((v) => [v, columns(level).filter((c) => inVersion(c, v)).map((c) => c.num)]),
        ),
      },
      draw: (st, s) => lists(st, s),
    },
  ], opts);
}
