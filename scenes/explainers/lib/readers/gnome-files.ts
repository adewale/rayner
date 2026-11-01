import { Group, Rectangle } from '../../../../src/index.ts';
import { gaveUp, task, PARTICIPANTS, colourOf, RGB, MEANING } from '../gnome-files.ts';
import type { Participant, Colour } from '../gnome-files.ts';
import { flow, label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
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
// Short labels for the report's categories. Keep its full wording in the recorded outcomes.
const outcomeLines: Record<Colour, readonly [string, string]> = {
  green: ['No', 'difficulty'],
  yellow: ['Very little', 'difficulty'],
  orange: ['Moderate', 'difficulty'],
  red: ['Severe', 'difficulty'],
  black: ['Could not', 'complete'],
  gray: ['Outside', 'study scope'],
};
export function frames(p: Participant): ReaderFrame[] {
  const n = gaveUp(p)[0]!,
    name = task(n).name;
  return [
    {
      id: 'reader-task',
      title: 'Where would you look for this action?',
      line: `${p}’s first give-up: ${name}.`,
      caption: `The task was “${task(n).text}”. This schematic locates the command in the menu; it is not a screenshot of Files. ${observations[n]} The command’s presence in the menu did not ensure that participants found it.`,
      values: { participant: p, task: n, location: locations[n] },
      draw: (s) =>
        new Group(
          flow(s, locations[n]!),
          label('Task: ' + (n === 1 ? 'Change icon size' : name), 0, -1.5, s.palette.ink, 0.75),
          label(`${p} could not complete it`, 0, -3, s.bad, 0.7),
        ),
    },
    {
      id: 'reader-sample',
      title: 'Did everyone have the same difficulty?',
      line: `One task, all six participants: ${name}.`,
      caption:
        'Difficulty labels describe completed tasks. “Could not complete” records an unfinished task; “Outside study scope” records an excluded approach. These six observations cannot estimate population failure rates or completion times.',
      values: {
        task: n,
        outcomes: PARTICIPANTS.map((q) => {
          const colour = colourOf(n, q);
          return { participant: q, colour, meaning: MEANING[colour] };
        }),
      },
      draw: (s) =>
        new Group(
          ...PARTICIPANTS.map((q, i) => {
            const color = colourOf(n, q),
              x = ((i % 3) - 1) * 4.8,
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
    },
  ];
}
