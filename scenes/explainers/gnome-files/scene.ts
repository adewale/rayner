import { frames as readerFrames } from '../lib/readers/gnome-files.ts';
import { Scene, Group, Line, Rectangle, Text } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import {
  COLOURS,
  GROUPS,
  MEANING,
  PARTICIPANTS,
  RGB,
  SCORE,
  SESSION,
  colourOf,
  gaveUp,
  giveUps,
  journey,
  quitters,
  scoreOf,
  source,
  struggled,
  task,
} from '../lib/gnome-files.ts';
import type { Participant } from '../lib/gnome-files.ts';

// Sources and the transcription are described in lib/gnome-files.ts.
const REPORT = 'https://blogs.gnome.org/udoijiibike/files/2024/11/Detailed-Report-for-Files-Usability-Test-.pdf';
const ARTICLE = 'https://technicallywewrite.com/2025/01/06/gnomeusability';
const STYLE = 'github-light';
// Native text is 0.46 units, about 11 px on a 390 px phone; the grid's labels are smaller to fit 11 rows.
const SIZE = 0.46;

/**
 * Why a give-up happened, from the report's findings for that task (printed page numbers; the PDF's
 * page is one more).
 * 1: page 11, Finding #2, "The icon size editors were very hard to notice in the “View Options” menu."
 * 3: page 21, those who gave up "typically used a keyboard shortcut (Ctrl + A) or “Click and Drag”";
 *    page 22, two of them later found "Select All" "in the folder context menu".
 * 4: page 25, they "abandoned the task … without any interaction with the “Main Menu” button"; page 26,
 *    Finding #1, "Some participants didn’t expect to find “Undo” in “Main Menu”".
 * 7: page 34, the half who did not check "the file’s context menu" were "unfamiliar with an “Open Item
 *    Location” feature", and two of them "eventually gave up on it".
 * 9: page 40, "over half of the sample making between six to nine attempts before completing or giving up".
 */
const WHY: Readonly<Record<number, string>> = {
  1: 'the icon size buttons in View Options were “very hard to notice”',
  3: 'Select All is in the folder’s right-click menu, and those who quit said they use Ctrl+A or drag',
  4: 'Undo is in the Main Menu, which none of those who quit opened',
  7: 'Open Item Location is in the file’s right-click menu, a command those who quit did not know',
  9: 'over half the sample took six to nine attempts to find Add To Bookmarks or give up',
};
const ANSWER = 'All six gave up at least once, each time on a menu command';
/** "A", "A and B", "A, B and C". */
const and = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const name = (n: number) => task(n).name;
/** A task as a sentence names it: "gave up on Undo". */
const PROSE: Readonly<Record<number, string>> = {
  1: 'changing the icon size',
  2: 'finding a folder’s size',
  3: 'Select All',
  4: 'Undo',
  5: 'sorting',
  6: 'switching to list view',
  7: 'Open Item Location',
  8: 'Show Hidden Files',
  9: 'Add To Bookmarks',
  10: 'the search',
  11: 'the new folder',
};
const said = (n: number) => PROSE[n]!;

export default class GnomeFilesExplainer extends Scene {
  static meta = {
    id: 'gnome-files',
    title: 'Why couldn’t these users find the command?',
    sources: [REPORT, ARTICLE, 'https://technicallywewrite.com/images/2025/01/gnome3.png'],
    answer: ANSWER,
    claims: [
      {
        says: 'All six gave up at least once, each time on a menu command',
        test: 'test/explain-gnome-files.test.ts: every participant gave up at least once',
      },
      {
        says: 'every one of the six gave up at least once',
        test: 'test/explain-gnome-files.test.ts: every participant gave up at least once',
      },
    ],
    checks: [
      {
        question:
          'A later build adds a visible Undo button beside the folder path, outside the Main Menu. Which observation in this study suggests that would help, and what could a six-person study of the old build not tell you?',
        answer:
          'The people who gave up on Undo did not open the Main Menu, so a button they can see removes the step they skipped. The study cannot say how many users would still miss it: six first-time users of one test build give no rate, and the new design needs its own test.',
      },
      {
        question:
          'P5 gave up on Select All but had no difficulty with Undo; P1 had no difficulty with Select All but gave up on Undo. What does that suggest about explaining the give-ups by who was skilled?',
        answer:
          'Skill alone would make the same people fail on both. Instead each person stalled on a different command, and all six stalled at least once, which points at where particular commands sat and at habits such as Ctrl+A, not at a few weak users.',
      },
      {
        question:
          'P6’s attempt at Select All is gray, outside the study’s scope. If it were counted as a give-up instead, how would the ranking of tasks by give-ups change, and why does the report keep gray separate?',
        answer:
          'Select All would have four give-ups and be worst on its own, ahead of Undo’s three. The report keeps gray separate because the study excluded that approach, so scoring it either way would rank tasks on something the study did not test.',
      },
    ],
  };
  static settings = [
    {
      id: 'participant',
      label: 'Participant',
      default: 'P1',
      options: PARTICIPANTS.map((p) => ({ value: p, label: p })),
    },
  ];

  override async construct() {
    const p = settingsOf(this).participant as Participant;
    const s = stage(this, { style: STYLE, headingSize: 0.6 });
    const ink = s.palette.ink;

    // ------------------------------------------------------------------ who was studied, and how it was scored
    await this.step('test', {
      kind: 'short',
      title: 'Six first-time users, eleven tasks, one colour per attempt',
      line: 'The report’s colours, and this page’s scores from green 5 to black 1.',
      // Page 2: "the design team wanted to assess the effectiveness of these updates… we executed a user
      // research project". Page 5: "six first-time GNOME users aged twenty-one to forty-seven". ARTICLE
      // §2.3: "development versions of Files, specifically, versions 47.rc-7925df1ba and 47.rc-3faeec25e".
      // Page 7: the key.
      caption:
        'Researchers for GNOME’s design team watched six first-time GNOME users, aged 21 to 47, try eleven tasks in test builds of Files 47. Their report colours each attempt from green, no difficulty, to black, could not complete; gray marks an approach the study excluded. This page also scores green 5 down to black 1 for its charts; that spacing is its choice, not a measured interval.',
    });
    await s.clear();
    const top = 2.7,
      pitch = 0.9;
    const key = new Group(
      ...COLOURS.flatMap((c, i) => {
        const y = top - i * pitch;
        return [
          new Rectangle({ width: 0.7, height: 0.6, fill: RGB[c], stroke: ink, strokeWidth: 0.015 }).moveTo([-6.9, y]),
          new Text(SCORE[c] == null ? '–' : String(SCORE[c]), { fontSize: SIZE, color: ink, weight: 'bold' }).moveTo([
            -6.0,
            y,
          ]),
          new Text(`${c}: ${MEANING[c]}`, { fontSize: SIZE, color: ink, anchor: 'start' }).moveTo([-5.5, y], [-1, 0]),
        ];
      }),
    );
    key.shift([-(key.box()![0] + key.box()![2]) / 2, 0]);
    await s.enter(key, {
      describe: `The report’s colour key with this page’s scores: ${COLOURS.map((c) => `${c}, ${SCORE[c] ?? 'no score'}, ${MEANING[c]}`).join('; ')}`,
    });
    await s.note('Colours and meanings: the report, page 7. Scores: this page’s, for its charts.', {
      at: [0, top - 6 * pitch - 0.1],
      size: 0.32,
    });
    this.state.key = Object.fromEntries(COLOURS.map((c) => [c, SCORE[c]]));

    // ------------------------------------------------------------------ one task, then all six people
    await s.steps(readerFrames(p), { kind: 'short' });
    // ------------------------------------------------------------------ every give-up, every person
    const mine = gaveUp(p),
      all = giveUps();
    const others = (n: number) => quitters(n).filter((q) => q !== p);
    const most = Math.max(...SESSION.map((n) => quitters(n).length)),
      worst = SESSION.filter((n) => quitters(n).length === most).sort((a, b) => a - b);
    const lost = SESSION.filter((n) => quitters(n).length > 0),
      people = PARTICIPANTS.filter((q) => gaveUp(q).length > 0).length,
      once = PARTICIPANTS.filter((q) => gaveUp(q).length === 1);
    await this.step('give-ups', {
      title: ANSWER,
      line: `Black cells are give-ups: ${all.length}, in ${lost.length} tasks and ${people === 6 ? 'all six' : people} columns.`,
      // The reasons are the WHY findings above.
      caption: `No small group accounts for the give-ups: every one of the six gave up at least once, ${and(once)} once each. All ${all.length} came on menu tasks, though nine of the eleven tasks used menus. The report’s reasons point at where the commands sat: those who quit Undo never opened the Main Menu, those who quit Select All reached for Ctrl+A or dragging, and those who quit Open Item Location had not checked the file’s right-click menu.`,
    });
    await s.clear();
    {
      const F = 0.48,
        CW = 0.8,
        TW = 1.3,
        RH = 0.74,
        top = 2.9;
      const heads = lost.map((n) => new Text(`${n} ${name(n)}`, { fontSize: F, color: ink, anchor: 'start' }));
      const foot = new Text('Gave up', { fontSize: F, color: ink, weight: 'bold', anchor: 'start' });
      const labelW = Math.max(foot.width(), ...heads.map((t) => t.width()));
      const width = labelW + 0.3 + PARTICIPANTS.length * CW + TW;
      const left = -width / 2;
      const col = (i: number) => left + labelW + 0.3 + CW / 2 + i * CW;
      const totalX = left + labelW + 0.3 + PARTICIPANTS.length * CW + TW / 2;
      const rowY = (r: number) => top - (r + 1) * RH;
      const sumY = rowY(lost.length) - 0.1;
      const strong = (text: string, x: number, y: number, key: string, color = ink) => {
        const t = new Text(text, { fontSize: F, color, weight: 'bold' }).moveTo([x, y]);
        t.key = key;
        return t;
      };
      const table = new Group(
        ...PARTICIPANTS.map((q, i) =>
          new Text(q, { fontSize: F, color: ink, weight: q === p ? 'bold' : 'normal' }).moveTo([col(i), top]),
        ),
        new Text('Total', { fontSize: F, color: ink }).moveTo([totalX, top]),
        ...lost.flatMap((n, r) => [
          heads[r]!.moveTo([left, rowY(r)], [-1, 0]),
          ...PARTICIPANTS.map((q, i) =>
            new Rectangle({ width: CW - 0.08, height: RH - 0.1, fill: RGB[colourOf(n, q)], stroke: 'none' }).moveTo([
              col(i),
              rowY(r),
            ]),
          ),
          strong(String(quitters(n).length), totalX, rowY(r), `gave-up:task-${n}`, s.bad),
        ]),
        foot.moveTo([left, sumY], [-1, 0]),
        ...PARTICIPANTS.map((q, i) => strong(String(gaveUp(q).length), col(i), sumY, `gave-up:${q}`, s.bad)),
        strong(String(all.length), totalX, sumY, 'gave-up:total', s.bad),
        new Line([left, sumY + RH / 2], [left + width, sumY + RH / 2], { stroke: s.soft, strokeWidth: 0.025 }),
      );
      const rest = new Text(`No one gave up on the other ${SESSION.length - lost.length} tasks`, {
        fontSize: F,
        color: ink,
      }).moveTo([0, sumY - RH - 0.05]);
      rest.key = 'gave-up:none';
      const at = PARTICIPANTS.indexOf(p);
      const outline = new Rectangle({
        width: CW + 0.04,
        height: top + 0.4 - (sumY - RH / 2),
        fill: 'none',
        stroke: s.emphasis,
        strokeWidth: 0.06,
      }).moveTo([col(at), (top + 0.4 + sumY - RH / 2) / 2]);
      s.opening(table, rest);
      await s.enter(table, rest, outline, {
        describe: `Give-ups by task and participant, ${p} outlined: ${lost
          .map((n) => `${n} ${name(n)}: ${and(quitters(n))} gave up`)
          .join('; ')}. Give-ups per participant: ${PARTICIPANTS.map((q) => `${q} ${gaveUp(q).length}`).join(', ')}; ${all.length} in all. No one gave up on the other ${SESSION.length - lost.length} tasks.`,
      });
    }
    this.state.giveUps = { mine, others: Object.fromEntries(mine.map((n) => [n, others(n)])), total: all.length };

    // ------------------------------------------------------------------ the whole heat map
    await this.step('heat-map', {
      kind: 'detail',
      title: 'The report’s heat map: eleven tasks by six people',
      line: 'Numbers are this page’s scores; the note on a row names who gave up.',
      // Ranking by black cells is this page's rule. ARTICLE §6.1 names icon size and Bookmarks the
      // worst tasks without saying how it ranks them.
      caption: `Rows are tasks in session order, columns participants, ${p} outlined; the note on a row names who gave up. Counting give-ups, ${and(worst.map(said))} did worst, ${most} each. The article names changing the icon size and Add To Bookmarks the hardest, without saying how it ranks. Counting everyone graded moderate difficulty or worse puts those two first, with ${struggled(1).length} and ${struggled(9).length} people: the ranking depends on what is counted.`,
    });
    await s.clear();
    {
      const LABEL = 0.3,
        X0 = -7.4,
        CX = -2.75,
        CW = 0.68,
        Y0 = 2.85,
        RH = 0.585;
      const col = (i: number) => CX + i * CW;
      const rowY = (i: number) => Y0 - 0.55 - i * RH;
      const grid = new Group(
        ...PARTICIPANTS.map((q, i) =>
          new Text(q, { fontSize: LABEL, color: ink, weight: q === p ? 'bold' : 'normal' }).moveTo([col(i), Y0]),
        ),
        ...SESSION.flatMap((n, r) => [
          new Text(`${n} ${name(n)}`, { fontSize: LABEL, color: ink, anchor: 'start' }).moveTo([X0, rowY(r)], [-1, 0]),
          ...PARTICIPANTS.flatMap((q, i) => {
            const c = colourOf(n, q);
            return [
              new Rectangle({ width: CW - 0.06, height: RH - 0.07, fill: RGB[c], stroke: 'none' }).moveTo([
                col(i),
                rowY(r),
              ]),
              new Text(SCORE[c] == null ? '–' : String(SCORE[c]), {
                fontSize: LABEL,
                color: c === 'black' ? '#ffffff' : '#1f2328',
              }).moveTo([col(i), rowY(r)]),
            ];
          }),
        ]),
      );
      const at = PARTICIPANTS.indexOf(p);
      const outline = new Rectangle({
        width: CW + 0.04,
        height: Y0 + 0.3 - (rowY(SESSION.length - 1) - RH / 2) + 0.04,
        fill: 'none',
        stroke: s.emphasis,
        strokeWidth: 0.06,
      }).moveTo([col(at), (Y0 + 0.3 + rowY(SESSION.length - 1) - RH / 2) / 2]);
      await s.enter(grid, outline, {
        describe: `The whole heat map as scores, rows in session order, ${p} outlined: ${SESSION.map(
          (n) => `${n} ${name(n)}: ${PARTICIPANTS.map((q) => `${q} ${scoreOf(n, q) ?? 'gray'}`).join(', ')}`,
        ).join('; ')}`,
      });
      // Who gave up, said at the end of each task's row; rows where this participant gave up in the outline's colour.
      for (const [r, n] of SESSION.entries()) {
        const q = quitters(n);
        if (!q.length) continue;
        const y = rowY(r);
        await s.callout(
          [col(0) - CW / 2, y - RH / 2, col(PARTICIPANTS.length - 1) + CW / 2, y + RH / 2],
          `${and(q)} gave up`,
          {
            side: 'right',
            gap: 0.3,
            color: q.includes(p) ? s.emphasis : s.soft,
            size: 0.28,
          },
        );
      }
    }

    // ------------------------------------------------------------------ the first four tasks, as a journey
    // Every participant's first give-up is in the first group, so this one journey shows it among its neighbours;
    // the heat map above holds the other seven tasks.
    const first = GROUPS.findIndex((group) => group.includes(mine[0]!)),
      j = journey(p, first),
      group = GROUPS[first]!,
      shown = j.sections.flatMap((x) => x.tasks.map((t) => t.n)),
      quit = group.filter((n) => colourOf(n, p) === 'black'),
      calm = shown.filter((n) => !quit.includes(n) && scoreOf(n, p)! >= 4);
    const gray = shown.length < group.length ? ` ${p}’s Select All is gray, outside the study’s scope: no column.` : '';
    await this.step('journey', {
      kind: 'detail',
      title: `${p}’s first ${['', 'one', 'two', 'three', 'four'][group.length] ?? group.length} tasks: gave up on ${and(quit.map(said))}`,
      line: 'Each marked task is a give-up, scored 1, the lowest.',
      caption: `One column per task, in session order; the higher the face, the easier it went. Red marks a give-up: ${quit.map((n) => WHY[n]).join('; ')}.${
        calm.length ? ` The same person had no or very little difficulty with ${and(calm.map(said))}.` : ''
      }${gray}`,
    });
    await s.clear();
    const d = await s.show({ source: source(j) }, { box: 'full' });
    const ids = shown.flatMap((n, i) => (quit.includes(n) ? [`task:task-${i}`] : []));
    if (ids.length) await d.mark(ids, { color: s.bad, as: 'gave up' });
    this.state.journey = shown.map((n) => [n, scoreOf(n, p)]);
  }
}
