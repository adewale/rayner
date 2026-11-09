// GNOME's 2024 usability test of Files (Nautilus): the heat map of six first-time users on eleven
// tasks, and what follows from it. Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// Sources, both by Udo Ijibike:
// - REPORT: "Detailed Report for Files Usability Test", 58 pages,
//   https://blogs.gnome.org/udoijiibike/files/2024/11/Detailed-Report-for-Files-Usability-Test-.pdf
//   (sha256 756ae3440aec3e9c360df56142ef0f15f2bb7840a3ddaac4f1e48032ba5baa8e, fetched 2026-10-25).
//   Page numbers below are the printed ones; the PDF's own page is one more (printed 7 is PDF page 8).
// - ARTICLE: "Usability testing with GNOME and Outreachy", Technically We Write, 6 January 2025,
//   https://technicallywewrite.com/2025/01/06/gnomeusability, with the same heat map as
//   https://technicallywewrite.com/images/2025/01/gnome3.png
//   (sha256 7492272a10bf2f9906fab584be3c990efc2052abafef447322199368d90a6a63, 768 × 735).
//
// The heat map is transcribed by hand from the report's page 7 and cross-checked by sampling the
// centre of every cell in both the PDF page (rendered at 160 dpi) and the PNG: all 66 cells agree.
// No image is copied; only the data, with attribution.
//
// What it leaves out: the data are six first-time GNOME users on two Files 47 development builds
// (47.rc-7925df1ba and 47.rc-3faeec25e). They support an account of those sessions, not a failure rate
// for all users, task times, later versions, or a causal experiment isolating menus from other design
// factors.

/** A heat-map cell, by the report's key (page 7). */
export type Colour = 'green' | 'yellow' | 'orange' | 'red' | 'black' | 'gray';
export const COLOURS: readonly Colour[] = ['green', 'yellow', 'orange', 'red', 'black', 'gray'];
/**
 * The report's key, page 7: "A cell is green if the participant completed the task without any
 * difficulty, yellow if the participant completed the task with very little difficulty, orange if
 * the participant completed the task with moderate difficulty, red if the participant completed the
 * task with severe difficulty, black if the participant was unable to complete the task, and gray if
 * the participant's approach was outside the scope of the study."
 */
export const MEANING: Readonly<Record<Colour, string>> = {
  green: 'completed without any difficulty',
  yellow: 'completed with very little difficulty',
  orange: 'completed with moderate difficulty',
  red: 'completed with severe difficulty',
  black: 'unable to complete the task',
  gray: 'approach outside the scope of the study',
};
/**
 * A journey score for each colour. The report gives colours, not numbers; this ordinal scale (5 for
 * green down to 1 for black) is the explainer's, so that Mermaid's journey, which takes whole scores
 * from 1 to 5, can plot the order of the key. Gray has no place on the scale and no score.
 */
export const SCORE: Readonly<Record<Colour, number | null>> = { green: 5, yellow: 4, orange: 3, red: 2, black: 1, gray: null };
/** The report's cell colours, sampled from the PDF page and the PNG (RGB). */
export const RGB: Readonly<Record<Colour, string>> = {
  green: '#72f072',
  yellow: '#f2f369',
  orange: '#f7b34e',
  red: '#f04c4b',
  black: '#2b2b2b',
  gray: '#b7b7b7',
};

export const PARTICIPANTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
export type Participant = (typeof PARTICIPANTS)[number];

/** The report's three topics, page 3 and the heat map's section rows. */
export type Section = 'Menu structure' | 'Search' | 'List view layout';

export interface Task {
  /** The report's number: the heat map's S/n column, and the heading its findings sit under. */
  n: number;
  /** The heat map's task text, verbatim. */
  text: string;
  /** A short name for the journey: Mermaid's labels overflow past 40 characters and break on a colon. */
  name: string;
  section: Section;
}
export const TASKS: readonly Task[] = [
  { n: 1, text: 'Change the icon size', name: 'Change the icon size', section: 'Menu structure' },
  { n: 2, text: 'Find the size of a folder with Properties', name: 'Folder size in Properties', section: 'Menu structure' },
  { n: 3, text: 'Select all files in a folder with “Select All”', name: 'Select All', section: 'Menu structure' },
  { n: 4, text: 'Undo an action with the “Undo/Redo” button', name: 'Undo the move', section: 'Menu structure' },
  { n: 5, text: 'Change the sort order while in Grid View', name: 'Change the sort order', section: 'Menu structure' },
  { n: 6, text: 'Change Files display from “Grid View” to “List View”', name: 'Grid view to list view', section: 'Menu structure' },
  { n: 7, text: 'Go to a file’s location from search results with “Open Item Location”', name: 'Open Item Location', section: 'Menu structure' },
  { n: 8, text: 'Reveal hidden items in a folder with “Show Hidden Files”', name: 'Show Hidden Files', section: 'Menu structure' },
  { n: 9, text: 'Add a folder to bookmarks with “Add To Bookmarks”', name: 'Add To Bookmarks', section: 'Menu structure' },
  { n: 10, text: 'Find a file using the search feature, with filters', name: 'Search with filters', section: 'Search' },
  { n: 11, text: 'Create a new folder while in List View', name: 'New folder in list view', section: 'List view layout' },
];
export const task = (n: number): Task => TASKS.find((t) => t.n === n)!;

const C: Record<string, Colour> = { G: 'green', Y: 'yellow', O: 'orange', R: 'red', B: 'black', X: 'gray' };
/** The heat map, page 7: one row per task in the report's numbering, columns P1 to P6. */
const ROWS: Readonly<Record<number, string>> = {
  1: 'OBGYOB',
  2: 'GGYYGG',
  3: 'GGBBBX',
  4: 'BYBYGB',
  5: 'GGGGGG',
  6: 'GYGGGG',
  7: 'BBGGGG',
  8: 'YGGGGG',
  9: 'ROBORG',
  10: 'OOGGYG',
  11: 'RYGORG',
};
export const colourOf = (n: number, p: Participant): Colour => C[ROWS[n]![PARTICIPANTS.indexOf(p)]!]!;
export const scoreOf = (n: number, p: Participant): number | null => SCORE[colourOf(n, p)];

/**
 * The order each participant did the tasks, by the report's numbers. The article's methodology lists
 * it: "Participants attempted eleven tasks in the following order: Change the icon size; Find the size
 * of a folder with Properties; Select all files…; Undo…; Change the sort order; Change Files display
 * from grid view to list view; Create a new folder while in list view; Find a file using the search
 * feature, with filters; Go to a file’s location from search results with “Open Item Location”;
 * Reveal hidden items…; Add a folder to the sidebar with “Add to Bookmarks”". The report agrees where
 * it says: task 4 reverses "the move action they completed in the previous task" (page 24), task 6
 * switches to list view "in preparation for the next task" (page 31), the list-view task 11, and task 7
 * starts from "a file they’d found through search" (page 33), task 10. The report numbers tasks by topic.
 */
export const SESSION: readonly number[] = [1, 2, 3, 4, 5, 6, 11, 10, 7, 8, 9];
/** The session in groups of at most four: a journey of five or more tasks is too small to read at 1280 px. */
export const GROUPS: readonly (readonly number[])[] = [SESSION.slice(0, 4), SESSION.slice(4, 8), SESSION.slice(8)];

/** The tasks a participant was unable to complete (black), in session order. */
export const gaveUp = (p: Participant): number[] => SESSION.filter((n) => colourOf(n, p) === 'black');
/** Who was unable to complete a task. */
export const quitters = (n: number): Participant[] => PARTICIPANTS.filter((p) => colourOf(n, p) === 'black');
/** Who struggled on a task: graded moderate difficulty or worse, give-ups included. */
export const struggled = (n: number): Participant[] =>
  PARTICIPANTS.filter((p) => ['orange', 'red', 'black'].includes(colourOf(n, p)));
/** Every black cell, as [task, participant], in session order. */
export const giveUps = (): [number, Participant][] => SESSION.flatMap((n) => quitters(n).map((p): [number, Participant] => [n, p]));

/** One journey: consecutive tasks of one section form a Mermaid section. */
export interface Journey {
  sections: { label: Section; tasks: { n: number; text: string; score: number }[] }[];
  actor: Participant;
}
/** The label Mermaid draws for a task: the report's number, then the short name. */
export const label = (n: number) => `${n} ${task(n).name}`;
/** A participant's journey through one group of tasks; a gray cell is left out, since it has no score. */
export function journey(p: Participant, group: number): Journey {
  const sections: Journey['sections'] = [];
  for (const n of GROUPS[group]!) {
    const score = scoreOf(n, p);
    if (score == null) continue;
    const t = task(n);
    if (sections.at(-1)?.label !== t.section) sections.push({ label: t.section, tasks: [] });
    sections.at(-1)!.tasks.push({ n, text: label(n), score });
  }
  return { sections, actor: p };
}
/** Mermaid source for a journey, with no title line: a title shrinks the drawing below 14 px at 1280. */
export const source = (j: Journey): string =>
  ['journey', ...j.sections.flatMap((s) => [`  section ${s.label}`, ...s.tasks.map((t) => `    ${t.text}: ${t.score}: ${j.actor}`)])].join('\n');

/** Agentic Mermaid journey edits (its JourneyMutationOp) that turn one journey into another. */
export type JourneyOp =
  | { kind: 'add_section'; label: string; index?: number }
  | { kind: 'remove_section'; index: number }
  | { kind: 'set_section_label'; index: number; label: string }
  | { kind: 'add_task'; sectionIndex: number; text: string; score: number; actors?: string[]; index?: number }
  | { kind: 'remove_task'; sectionIndex: number; taskIndex: number }
  | { kind: 'set_task_text'; sectionIndex: number; taskIndex: number; text: string }
  | { kind: 'set_task_score'; sectionIndex: number; taskIndex: number; score: number };
/**
 * Edits from `a` to `b` for the same actor: relabel the sections both have, drop or add the rest,
 * then within each section rewrite the tasks in place, drop extra ones and add missing ones.
 */
export function edits(a: Journey, b: Journey): JourneyOp[] {
  const ops: JourneyOp[] = [];
  for (let i = a.sections.length - 1; i >= b.sections.length; i--) ops.push({ kind: 'remove_section', index: i });
  b.sections.forEach((s, i) => {
    if (i < a.sections.length) {
      if (a.sections[i]!.label !== s.label) ops.push({ kind: 'set_section_label', index: i, label: s.label });
    } else ops.push({ kind: 'add_section', label: s.label });
    const had = i < a.sections.length ? a.sections[i]!.tasks : [];
    for (let k = had.length - 1; k >= s.tasks.length; k--) ops.push({ kind: 'remove_task', sectionIndex: i, taskIndex: k });
    s.tasks.forEach((t, k) => {
      const old = had[k];
      if (!old) ops.push({ kind: 'add_task', sectionIndex: i, text: t.text, score: t.score, actors: [b.actor] });
      else {
        if (old.text !== t.text) ops.push({ kind: 'set_task_text', sectionIndex: i, taskIndex: k, text: t.text });
        if (old.score !== t.score) ops.push({ kind: 'set_task_score', sectionIndex: i, taskIndex: k, score: t.score });
      }
    });
  });
  return ops;
}
