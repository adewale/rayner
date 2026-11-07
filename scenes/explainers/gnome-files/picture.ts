// How the gnome-files explainer draws: the colour key, the two staged reader steps (one participant's first
// give-up, then the same task across all six), the give-up table and the whole heat map. The colours and
// their meanings are the report's (page 7); the scores 5 to 1 beside them are this page's choice for its
// charts. The opening menu paths are schematic, not screenshots of Files.
import { Group, Rectangle, Text, Line } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import { gaveUp, task, PARTICIPANTS, colourOf, RGB, MEANING, COLOURS, SCORE, SESSION, quitters } from './model.ts';
import type { Participant, Colour } from './model.ts';
import { flow, label } from '../../../explain/drawing.ts';
import type { StagedStep } from '../../../explain/index.ts';
import { numberWord } from '../lib/format.ts';
// Locations and observations: the report's task findings, pages 11, 21–22, 25–26, 34 and 40.
const locations: Record<number, string[]> = {
  1: ['View options', 'Icon size'],
  3: ['Folder menu', 'Select All'],
  4: ['Main menu', 'Undo'],
  7: ['File menu', 'Item location'],
  9: ['Folder action', 'Bookmarks'],
};
const observations: Record<number, string> = {
  1: 'The report calls the icon-size controls “very hard to notice”.',
  3: 'Those who quit said they normally use Ctrl+A or drag; two later found Select All in the folder context menu.',
  4: 'None of those who gave up opened the Main Menu, where Undo was.',
  7: 'Those who gave up were unfamiliar with Open Item Location and had not checked the file context menu.',
  9: 'Over half the sample made six to nine attempts before completing this task or giving up.',
};
// Where each command sat, as a sentence, from the same findings.
const placed: Record<number, string> = {
  1: 'the icon size buttons were in View Options',
  3: 'Select All was in the folder’s right-click menu',
  4: 'Undo was in the Main Menu',
  7: 'Open Item Location was in the file’s right-click menu',
};
const named: Record<number, string> = {
  1: 'changing the icon size',
  3: 'Select All',
  4: 'Undo',
  7: 'Open Item Location',
  9: 'Add To Bookmarks',
};
/** How many of the six: "no one", "one" … "six". */
const people = (n: number, capital = false) => numberWord(n, { zero: 'no one', capital });
// Short labels for the report's categories. Keep its full wording in the recorded outcomes.
const outcomeLines: Record<Colour, readonly [string, string]> = {
  green: ['No', 'difficulty'],
  yellow: ['Very little', 'difficulty'],
  orange: ['Moderate', 'difficulty'],
  red: ['Severe', 'difficulty'],
  black: ['Could not', 'complete'],
  gray: ['Outside', 'study scope'],
};
const phrase: Record<Colour, string> = {
  green: 'no difficulty',
  yellow: 'very little difficulty',
  orange: 'moderate difficulty',
  red: 'severe difficulty',
  black: 'could not complete it',
  gray: 'outside the study’s scope',
};
/** The first frame's state: who gave up, on which task, and where its command sat. */
type TaskFrame = { participant: Participant; task: number; location: string[] };
/** The second frame's state: the same task's outcome for each of the six. */
type SampleFrame = { task: number; outcomes: { participant: Participant; colour: Colour; meaning: string }[] };
export function frames(p: Participant): [StagedStep<TaskFrame>, StagedStep<SampleFrame>] {
  const n = gaveUp(p)[0]!;
  const row = PARTICIPANTS.map((q) => colourOf(n, q));
  const stuck = row.filter((c) => c === 'black').length;
  const rest = (['green', 'yellow', 'orange', 'red', 'gray'] as const)
    .map((c) => [c, row.filter((x) => x === c).length] as const)
    .filter(([, k]) => k > 0)
    .map(([c, k]) => `${people(k)} ${phrase[c]}`);
  return [
    {
      id: 'reader-task',
      title: `${p} gave up on ${named[n]}`,
      line: `The command was there: ${placed[n]}.`,
      caption: `The task read: ${task(n).text}. This schematic shows where the command sat; it is not a screenshot of Files. ${observations[n]} The command existed, and ${p} still did not find it. Was ${p} unlucky, or did the same menu lose other people too?`,
      state: { participant: p, task: n, location: locations[n]! },
      draw: (st, s) =>
        new Group(
          flow(s, st.location, { key: 'reader-flow' }),
          label(s, 'Task: ' + (st.task === 1 ? 'Change icon size' : task(st.task).name), { at: [0, -1.5], size: 0.75 }),
          label(s, `${st.participant} could not complete it`, { at: [0, -3], color: s.look.bad, size: 0.7 }),
        ),
    },
    {
      id: 'reader-sample',
      title: `${people(stuck, true)} of the six gave up on ${named[n]}`,
      line: `The others: ${rest.join(', ')}.`,
      caption: `The same task split the six people, graded with the report’s colours; an approach outside the study’s scope counts as neither a success nor a give-up. If a few weaker users caused the trouble, the same names would keep failing. The next step tests that across all eleven tasks.`,
      state: {
        task: n,
        outcomes: PARTICIPANTS.map((q) => {
          const colour = colourOf(n, q);
          return { participant: q, colour, meaning: MEANING[colour] };
        }),
      },
      draw: (st, s) =>
        new Group(
          ...st.outcomes.map(({ participant: q, colour: color }, i) => {
            const x = ((i % 3) - 1) * 4.8,
              y = 1.4 - Math.floor(i / 3) * 2.7;
            const outcome = new Group(
              new Rectangle({
                width: 4.1,
                height: 1.2,
                fill: RGB[color],
                stroke: s.look.ink,
                strokeWidth: 0.03,
              }).moveTo([x, y]),
              label(s, q, { at: [x, y], color: color === 'black' ? '#ffffff' : '#151515', size: 0.8 }),
              ...outcomeLines[color].map((line, row) => label(s, line, { at: [x, y - 1 - row * 0.72], size: 0.65 })),
            );
            outcome.key = `outcome:${q}`;
            return outcome;
          }),
        ),
    },
  ];
}

/** The stage's colours the scene's pictures use. */
export type Ink = { ink: string; soft: string; bad: string; emphasis: string };

/** Where the colour key's rows sit: the first at KEY_TOP, each next one KEY_PITCH below. */
export const KEY_TOP = 2.7,
  KEY_PITCH = 0.9;
/** The report's colour key, each colour with this page's score and the report's meaning, centred across the stage. */
export function colourKey(ink: string, size: number): Group {
  const top = KEY_TOP,
    pitch = KEY_PITCH;
  const key = new Group(
    ...COLOURS.flatMap((c, i) => {
      const y = top - i * pitch;
      return [
        new Rectangle({ width: 0.7, height: 0.6, fill: RGB[c], stroke: ink, strokeWidth: 0.015 }).moveTo([-6.9, y]),
        new Text(SCORE[c] == null ? '–' : String(SCORE[c]), { fontSize: size, color: ink, weight: 'bold' }).moveTo([
          -6.0,
          y,
        ]),
        new Text(`${c}: ${MEANING[c]}`, { fontSize: size, color: ink, anchor: 'start' }).moveTo([-5.5, y], [-1, 0]),
      ];
    }),
  );
  key.shift([-(key.box()![0] + key.box()![2]) / 2, 0]);
  return key;
}

/**
 * The give-ups by task and participant: only the tasks someone gave up on (`lost`), so the table reads whole
 * on a 320 px phone (the full heat map carries the other rows), with each row's and column's count of
 * black cells and the total; `p`'s column outlined.
 */
export function giveUpTable(p: Participant, lost: readonly number[], total: number, { ink, soft, bad, emphasis }: Ink): { table: Group; rest: Text; outline: Rectangle } {
  const F = 0.48,
    CW = 0.8,
    TW = 1.3,
    RH = 0.74,
    top = 2.9;
  const heads = lost.map((n) => new Text(`${n} ${task(n).name}`, { fontSize: F, color: ink, anchor: 'start' }));
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
      strong(String(quitters(n).length), totalX, rowY(r), `gave-up:task-${n}`, bad),
    ]),
    foot.moveTo([left, sumY], [-1, 0]),
    ...PARTICIPANTS.map((q, i) => strong(String(gaveUp(q).length), col(i), sumY, `gave-up:${q}`, bad)),
    strong(String(total), totalX, sumY, 'gave-up:total', bad),
    new Line([left, sumY + RH / 2], [left + width, sumY + RH / 2], { stroke: soft, strokeWidth: 0.025 }),
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
    stroke: emphasis,
    strokeWidth: 0.06,
  }).moveTo([col(at), (top + 0.4 + sumY - RH / 2) / 2]);
  return { table, rest, outline };
}

/**
 * The report's whole heat map as this page's scores, rows in session order and `p`'s column outlined. The
 * scores 5 to 1 are this page's way to plot the report's colours; their spacing is not a measured interval,
 * and gray has no score. `rowBox(r)` is row r's cells, for a note beside it.
 */
export function heatMap(p: Participant, { ink, emphasis }: Pick<Ink, 'ink' | 'emphasis'>): { grid: Group; outline: Rectangle; rowBox: (r: number) => Box } {
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
      new Text(`${n} ${task(n).name}`, { fontSize: LABEL, color: ink, anchor: 'start' }).moveTo([X0, rowY(r)], [-1, 0]),
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
    stroke: emphasis,
    strokeWidth: 0.06,
  }).moveTo([col(at), (Y0 + 0.3 + rowY(SESSION.length - 1) - RH / 2) / 2]);
  const rowBox = (r: number): Box => [col(0) - CW / 2, rowY(r) - RH / 2, col(PARTICIPANTS.length - 1) + CW / 2, rowY(r) + RH / 2];
  return { grid, outline, rowBox };
}
