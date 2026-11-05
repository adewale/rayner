import { Group, Rectangle } from '../../../../src/index.ts';
import { gaveUp, task, PARTICIPANTS, colourOf, RGB, MEANING } from '../gnome-files.ts';
import type { Participant, Colour } from '../gnome-files.ts';
import { flow, label } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';
import { staged } from '../staged.ts';
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
const counted = ['No one', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
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
export function frames(p: Participant): StagedStep[] {
  const n = gaveUp(p)[0]!;
  const row = PARTICIPANTS.map((q) => colourOf(n, q));
  const stuck = row.filter((c) => c === 'black').length;
  const rest = (['green', 'yellow', 'orange', 'red', 'gray'] as const)
    .map((c) => [c, row.filter((x) => x === c).length] as const)
    .filter(([, k]) => k > 0)
    .map(([c, k]) => `${counted[k]!.toLowerCase()} ${phrase[c]}`);
  return [
    staged({
      id: 'reader-task',
      title: `${p} gave up on ${named[n]}`,
      line: `The command was there: ${placed[n]}.`,
      caption: `The task read: ${task(n).text}. This schematic shows where the command sat; it is not a screenshot of Files. ${observations[n]} The command existed, and ${p} still did not find it. Was ${p} unlucky, or did the same menu lose other people too?`,
      state: { participant: p, task: n, location: locations[n]! },
      draw: (st, s) =>
        new Group(
          flow(s, st.location),
          label('Task: ' + (st.task === 1 ? 'Change icon size' : task(st.task).name), 0, -1.5, s.palette.ink, 0.75),
          label(`${st.participant} could not complete it`, 0, -3, s.bad, 0.7),
        ),
    }),
    staged({
      id: 'reader-sample',
      title: `${counted[stuck]} of the six gave up on ${named[n]}`,
      line: `The others: ${rest.join(', ')}.`,
      caption: `The same task split the six people. The report grades each completed attempt by its difficulty, from none to severe, and records separately who could not complete the task. “Outside study scope” marks an approach the study excluded, so it counts as neither a success nor a give-up. If a few weaker users caused the trouble, the same names would keep failing. The next step tests that across all eleven tasks.`,
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
                stroke: s.palette.ink,
                strokeWidth: 0.03,
              }).moveTo([x, y]),
              label(q, x, y, color === 'black' ? '#ffffff' : '#151515', 0.8),
              ...outcomeLines[color].map((line, row) => label(line, x, y - 1 - row * 0.72, s.palette.ink, 0.65)),
            );
            outcome.key = `outcome:${q}`;
            return outcome;
          }),
        ),
    }),
  ];
}
