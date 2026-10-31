import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/gnome-files.ts';
import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
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
  edits,
  gaveUp,
  giveUps,
  journey,
  quitters,
  scoreOf,
  source,
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
  7: 'Open Item Location is in the file’s right-click menu, a command those who quit had never met',
  9: 'over half the sample took six to nine attempts to find Add To Bookmarks or give up',
};
const STEPS = ['tasks-1-4', 'tasks-5-8', 'tasks-9-11'] as const;
// By session order: the report numbers tasks by topic, and the session ran 1–6, 11, 10, 7, 8, 9.
const RANGE = ['the first four tasks', 'the next four tasks', 'the last three tasks'] as const;
/** "A", "A and B", "A, B and C". */
const and = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
/** Items that may hold commas themselves: "A, as did P2; and B". */
const series = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join('; ')}; and ${xs.at(-1)}`;
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

    // ------------------------------------------------------------------ the test and its key
    await readerFirst(this, s, readerFrames(p));
    await this.step('test', {
      detail: true,
      title: 'Six first-time users, eleven tasks, one colour each',
      line: 'The report’s colours become scores: green 5 down to black 1.',
      // Page 2: "the design team wanted to assess the effectiveness of these updates… we executed a user
      // research project". Page 5: "six first-time GNOME users aged twenty-one to forty-seven". ARTICLE
      // §2.3: "development versions of Files, specifically, versions 47.rc-7925df1ba and 47.rc-3faeec25e".
      // Page 7: the key.
      caption:
        'Researchers for GNOME’s design team watched six people who had never used GNOME, aged 21 to 47, try eleven tasks in test builds of Files 47. Their report colours each attempt from green, no difficulty, to black, unable to complete. To plot attempts as journeys, this page scores green 5 down to black 1.',
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
    await s.note('Colours and meanings: the report, page 7. Scores: this page’s, for the journey charts.', {
      at: [0, top - 6 * pitch - 0.1],
      size: 0.32,
    });
    this.state.key = Object.fromEntries(COLOURS.map((c) => [c, SCORE[c]]));

    // ------------------------------------------------------------------ the session, as journeys
    let d = null as Awaited<ReturnType<typeof s.show>> | null;
    for (let g = 0; g < GROUPS.length; g++) {
      const j = journey(p, g),
        group = GROUPS[g]!,
        shown = j.sections.flatMap((x) => x.tasks.map((t) => t.n)),
        quit = group.filter((n) => colourOf(n, p) === 'black'),
        anyone = group.filter((n) => quitters(n).length > 0);
      const lowest = Math.min(...shown.map((n) => scoreOf(n, p)!)),
        lowAt = shown.filter((n) => scoreOf(n, p) === lowest);
      const intro = [
        'One column per task, in session order; the higher the face, the easier it went.',
        'The report numbers tasks by topic; by the article’s list of the order, the list-view task 11 and the search task 10 came seventh and eighth.',
        'The last three tasks went back to the menus.',
      ][g]!;
      const gray =
        shown.length < group.length ? ` ${p}’s Select All is gray, outside the study’s scope: no column.` : '';
      const highest = Math.max(...shown.map((n) => scoreOf(n, p)!));
      const saying = quit.length
        ? ` Red marks a give-up: ${quit.map((n) => WHY[n]).join('; ')}.`
        : anyone.length
          ? ` ${p} finished all of them; others gave up on ${and(anyone.map(said))}.`
          : ` No one gave up on any of them; ${
              lowest === highest
                ? `${p} scored ${lowest} on all ${shown.length}`
                : `${p}’s lowest score was ${lowest}, on ${and(lowAt.map(said))}`
            }.`;
      await this.step(STEPS[g]!, {
        detail: true,
        title: `${p}, ${RANGE[g]}: ${quit.length ? `gave up on ${and(quit.map(said))}` : 'no give-ups'}`,
        line: quit.length
          ? 'Each marked task is a give-up, scored 1, the lowest.'
          : `${p} finished all ${shown.length}; the lowest score here is ${lowest}.`,
        caption: intro + saying + gray,
      });
      if (!d) {
        await s.clear();
        d = await s.show({ source: source(j) }, { box: 'full' });
      } else await d.morph({ source: source(j) }, { ops: edits(journey(p, g - 1), j) });
      const ids = shown.flatMap((n, i) => (quit.includes(n) ? [`task:task-${i}`] : []));
      if (ids.length) await d.mark(ids, { color: s.bad, as: 'gave up' });
      this.state[`journey${g + 1}`] = shown.map((n) => [n, scoreOf(n, p)]);
    }

    // ------------------------------------------------------------------ against the other five
    const mine = gaveUp(p),
      all = giveUps();
    const others = (n: number) => quitters(n).filter((q) => q !== p);
    const most = Math.max(...SESSION.map((n) => quitters(n).length)),
      worst = SESSION.filter((n) => quitters(n).length === most).sort((a, b) => a - b);
    await this.step('give-ups', {
      detail: true,
      title: 'All six gave up at least once, always in the menus',
      line: `All ${all.length} give-ups score 1, and all fall in tasks 1 to 9.`,
      // Ranking by black cells is this page's rule. ARTICLE §6.1 names icon size and Bookmarks the
      // worst tasks without saying how it ranks them.
      caption: `Rows are tasks in session order, columns participants; ${p}’s is outlined. ${p} gave up on ${series(
        mine.map((n) => `${said(n)}${others(n).length ? `, as did ${and(others(n))}` : ''}`),
      )}. All ${all.length} give-ups came in tasks 1 to 9, the menu tasks. By give-ups, ${and(worst.map(said))} did worst, ${most} each.`,
    });
    await s.clear();
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
    this.state.giveUps = { mine, others: Object.fromEntries(mine.map((n) => [n, others(n)])), total: all.length };
  }
}
