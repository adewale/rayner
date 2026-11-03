import { Group, Rectangle } from '../../../../src/index.ts';
import { tally, criteria, change } from '../wcag-map.ts';
import type { Level } from '../wcag-map.ts';
import { tile, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

/** The page's one-sentence answer, stated by the version step. */
export const ANSWER = 'A level asks for its own criteria and those of the levels below it, in the WCAG version you name';
export function frames(level: Level, guideline: string): ReaderFrame[] {
  const t20 = tally('2.0', level),
    t21 = tally('2.1', level),
    total = tally('2.2', level),
    a = tally('2.2', 'A').total,
    selected = criteria('2.2', level, guideline),
    focus = criteria('2.2', level).some((c) => c.num === '2.4.7');
  const c21 = change('2.0', '2.1', level),
    c22 = change('2.1', '2.2', level);
  return [
    {
      id: 'reader-focus',
      title: 'The outline shows which button Tab reached',
      line: 'Success criterion 2.4.7 Focus Visible asks for the lower drawing; WCAG files it at level AA.',
      caption: `Press Tab on a payment form and focus moves to Cancel or Pay. In the upper drawing nothing shows which, so pressing Enter is a guess; in the lower one an outline marks Pay. Focus Visible requires that keyboard focus be visible. Whether a site must meet it depends on two choices its accessibility policy makes: a conformance level and a WCAG version. ${
        focus
          ? `At level ${level}, the selected level, Focus Visible is on the list.`
          : `At level ${level}, the selected level, it is not on the list, because it is a level AA criterion.`
      }`,
      values: { level, focusRequired: focus },
      draw: (s) =>
        new Group(
          label('No visible focus', 0, 2.5, s.soft, 0.7),
          tile('Cancel', -3.5, 1.3, 5, 1, s),
          tile('Pay', 3.5, 1.3, 5, 1, s),
          label('Visible focus on Pay', 0, -0.2, s.palette.ink, 0.7),
          tile('Cancel', -3.5, -1.5, 5, 1, s),
          tile('Pay', 3.5, -1.5, 5, 1, s),
          new Rectangle({ width: 5.45, height: 1.45, fill: 'none', stroke: s.emphasis, strokeWidth: 0.09 }).moveTo([
            3.5, -1.5,
          ]),
        ),
    },
    {
      id: 'reader-levels',
      title: `Level ${level} asks for ${total.total} criteria in WCAG 2.2`,
      line: 'Each row includes the rows above it.',
      caption: `Does aiming for AA mean checking the criteria labelled AA? WCAG’s conformance requirements say a level AA page satisfies all the level A and level AA criteria, or offers an alternate version that does, so level AA’s list in WCAG 2.2 is ${a} at level A plus ${tally('2.2', 'AA').total - a} at AA. At level ${level}, the selected level, the list holds ${total.total} criteria, ${selected.length} of them under guideline ${guideline}. A count names the set to evaluate; it is not a conformance result.`,
      values: { level, total: total.total, guideline, count: selected.length },
      draw: (s) =>
        table(
          ['Level', 'Includes', 'WCAG 2.2'],
          [
            ['A', 'A', tally('2.2', 'A').total],
            ['AA', 'A + AA', tally('2.2', 'AA').total],
            ['AAA', 'A + AA + AAA', tally('2.2', 'AAA').total],
          ],
          s,
          { xs: [-5, -0.8, 5.4], y: 2.6, gap: 1.5 },
        ),
    },
    {
      id: 'reader-versions',
      title: `Level ${level} asks for ${t20.total}, ${t21.total} or ${total.total} criteria, by version`,
      line: `WCAG 2.2 added ${c22.added.length} at this level and removed one: 4.1.1 Parsing.`,
      caption: `The list changes with the version as well. WCAG 2.1 added ${c21.added.length} criteria at ${level === 'A' ? 'level A' : `level ${level} or below`}. WCAG 2.2 added ${c22.added.length} and removed 4.1.1 Parsing, which W3C judged obsolete because assistive technology no longer needs to parse HTML directly. A newer version is not the older list plus extras, so “level ${level}” without a version names no list. ${ANSWER}.`,
      values: {
        level,
        totals: [t20.total, t21.total, total.total],
        added21: c21.added.length,
        added22: c22.added.length,
        removed22: c22.removed,
      },
      draw: (s) =>
        table(
          ['WCAG', `Change at level ${level}`, 'Criteria'],
          [
            ['2.0', 'first edition', t20.total],
            ['2.1', `${c21.added.length} added`, t21.total],
            ['2.2', `${c22.added.length} added, ${c22.removed.length} removed`, total.total],
          ],
          s,
          { xs: [-5.6, -0.6, 5.2], y: 2.6, gap: 1.5 },
        ),
    },
  ];
}
