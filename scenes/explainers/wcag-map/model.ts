// Which WCAG 2.x success criteria a level of conformance asks for, in each version.
// Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// The table transcribes w3c/wcag at tag WCAG22-20241212 (commit 1dfe1647bdecf32fb4f76b9ce1cc33139505630c):
// guidelines/index.html includes each criterion's file in document order (lines 135–392), and the
// criterion's number is its place in that order. Each file's folder says which version added it
// (sc/20, sc/21, sc/22) and its `<p class="conformance-level">` gives its level. The names are the
// `handle`s in https://www.w3.org/WAI/WCAG22/wcag.json, which agrees with the repository on every
// number, level and version.
//
// One exception: 4.1.1 Parsing. In 2.2 its file (guidelines/sc/20/parsing.html:3–5) is titled
// "Parsing (Obsolete and removed)" and has no level, and guidelines/index.html:93 says "WCAG 2.2 has
// removed one success criterion, 4.1.1 Parsing." Its level A comes from the 2.0 and 2.1
// Recommendations themselves (https://www.w3.org/TR/2008/REC-WCAG20-20081211/#ensure-compat-parses,
// https://www.w3.org/TR/2023/REC-WCAG21-20230921/#parsing), which give "(Level A)".

export type Version = '2.0' | '2.1' | '2.2';
export type Level = 'A' | 'AA' | 'AAA';
export const VERSIONS: readonly Version[] = ['2.0', '2.1', '2.2'];
export const LEVELS: readonly Level[] = ['A', 'AA', 'AAA'];
/** Each Recommendation's date, from its dated URL on w3.org/TR. */
export const PUBLISHED: Record<Version, string> = { '2.0': 'December 2008', '2.1': 'June 2018', '2.2': 'October 2023' };

export interface Criterion {
  num: string;
  name: string;
  level: Level;
  added: Version;
  removed?: Version;
}

export const PRINCIPLES: readonly { num: string; name: string }[] = [
  { num: '1', name: 'Perceivable' },
  { num: '2', name: 'Operable' },
  { num: '3', name: 'Understandable' },
  { num: '4', name: 'Robust' },
];
/** Guidelines with the version that added them (wcag.json `versions`; 2.5 is new in 2.1). */
export const GUIDELINES: readonly { num: string; name: string; added: Version }[] = [
  { num: '1.1', name: 'Text Alternatives', added: '2.0' },
  { num: '1.2', name: 'Time-based Media', added: '2.0' },
  { num: '1.3', name: 'Adaptable', added: '2.0' },
  { num: '1.4', name: 'Distinguishable', added: '2.0' },
  { num: '2.1', name: 'Keyboard Accessible', added: '2.0' },
  { num: '2.2', name: 'Enough Time', added: '2.0' },
  { num: '2.3', name: 'Seizures and Physical Reactions', added: '2.0' },
  { num: '2.4', name: 'Navigable', added: '2.0' },
  { num: '2.5', name: 'Input Modalities', added: '2.1' },
  { num: '3.1', name: 'Readable', added: '2.0' },
  { num: '3.2', name: 'Predictable', added: '2.0' },
  { num: '3.3', name: 'Input Assistance', added: '2.0' },
  { num: '4.1', name: 'Compatible', added: '2.0' },
];

type Row = readonly [num: string, name: string, level: Level, added: Version, removed?: Version];
// prettier-ignore
const ROWS: readonly Row[] = [
  ['1.1.1', 'Non-text Content', 'A', '2.0'],
  ['1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', '2.0'],
  ['1.2.2', 'Captions (Prerecorded)', 'A', '2.0'],
  ['1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', '2.0'],
  ['1.2.4', 'Captions (Live)', 'AA', '2.0'],
  ['1.2.5', 'Audio Description (Prerecorded)', 'AA', '2.0'],
  ['1.2.6', 'Sign Language (Prerecorded)', 'AAA', '2.0'],
  ['1.2.7', 'Extended Audio Description (Prerecorded)', 'AAA', '2.0'],
  ['1.2.8', 'Media Alternative (Prerecorded)', 'AAA', '2.0'],
  ['1.2.9', 'Audio-only (Live)', 'AAA', '2.0'],
  ['1.3.1', 'Info and Relationships', 'A', '2.0'],
  ['1.3.2', 'Meaningful Sequence', 'A', '2.0'],
  ['1.3.3', 'Sensory Characteristics', 'A', '2.0'],
  ['1.3.4', 'Orientation', 'AA', '2.1'],
  ['1.3.5', 'Identify Input Purpose', 'AA', '2.1'],
  ['1.3.6', 'Identify Purpose', 'AAA', '2.1'],
  ['1.4.1', 'Use of Color', 'A', '2.0'],
  ['1.4.2', 'Audio Control', 'A', '2.0'],
  ['1.4.3', 'Contrast (Minimum)', 'AA', '2.0'],
  ['1.4.4', 'Resize Text', 'AA', '2.0'],
  ['1.4.5', 'Images of Text', 'AA', '2.0'],
  ['1.4.6', 'Contrast (Enhanced)', 'AAA', '2.0'],
  ['1.4.7', 'Low or No Background Audio', 'AAA', '2.0'],
  ['1.4.8', 'Visual Presentation', 'AAA', '2.0'],
  ['1.4.9', 'Images of Text (No Exception)', 'AAA', '2.0'],
  ['1.4.10', 'Reflow', 'AA', '2.1'],
  ['1.4.11', 'Non-text Contrast', 'AA', '2.1'],
  ['1.4.12', 'Text Spacing', 'AA', '2.1'],
  ['1.4.13', 'Content on Hover or Focus', 'AA', '2.1'],
  ['2.1.1', 'Keyboard', 'A', '2.0'],
  ['2.1.2', 'No Keyboard Trap', 'A', '2.0'],
  ['2.1.3', 'Keyboard (No Exception)', 'AAA', '2.0'],
  ['2.1.4', 'Character Key Shortcuts', 'A', '2.1'],
  ['2.2.1', 'Timing Adjustable', 'A', '2.0'],
  ['2.2.2', 'Pause, Stop, Hide', 'A', '2.0'],
  ['2.2.3', 'No Timing', 'AAA', '2.0'],
  ['2.2.4', 'Interruptions', 'AAA', '2.0'],
  ['2.2.5', 'Re-authenticating', 'AAA', '2.0'],
  ['2.2.6', 'Timeouts', 'AAA', '2.1'],
  ['2.3.1', 'Three Flashes or Below Threshold', 'A', '2.0'],
  ['2.3.2', 'Three Flashes', 'AAA', '2.0'],
  ['2.3.3', 'Animation from Interactions', 'AAA', '2.1'],
  ['2.4.1', 'Bypass Blocks', 'A', '2.0'],
  ['2.4.2', 'Page Titled', 'A', '2.0'],
  ['2.4.3', 'Focus Order', 'A', '2.0'],
  ['2.4.4', 'Link Purpose (In Context)', 'A', '2.0'],
  ['2.4.5', 'Multiple Ways', 'AA', '2.0'],
  ['2.4.6', 'Headings and Labels', 'AA', '2.0'],
  // guidelines/sc/20/focus-visible.html:5 "AA". Drafts of 2.2 up to the Candidate Recommendation of
  // 6 September 2022 made it level A; the Recommendation of 5 October 2023 and its 2024 update keep AA.
  ['2.4.7', 'Focus Visible', 'AA', '2.0'],
  ['2.4.8', 'Location', 'AAA', '2.0'],
  ['2.4.9', 'Link Purpose (Link Only)', 'AAA', '2.0'],
  ['2.4.10', 'Section Headings', 'AAA', '2.0'],
  ['2.4.11', 'Focus Not Obscured (Minimum)', 'AA', '2.2'],
  ['2.4.12', 'Focus Not Obscured (Enhanced)', 'AAA', '2.2'],
  ['2.4.13', 'Focus Appearance', 'AAA', '2.2'],
  ['2.5.1', 'Pointer Gestures', 'A', '2.1'],
  ['2.5.2', 'Pointer Cancellation', 'A', '2.1'],
  ['2.5.3', 'Label in Name', 'A', '2.1'],
  ['2.5.4', 'Motion Actuation', 'A', '2.1'],
  ['2.5.5', 'Target Size (Enhanced)', 'AAA', '2.1'],
  ['2.5.6', 'Concurrent Input Mechanisms', 'AAA', '2.1'],
  ['2.5.7', 'Dragging Movements', 'AA', '2.2'],
  ['2.5.8', 'Target Size (Minimum)', 'AA', '2.2'],
  ['3.1.1', 'Language of Page', 'A', '2.0'],
  ['3.1.2', 'Language of Parts', 'AA', '2.0'],
  ['3.1.3', 'Unusual Words', 'AAA', '2.0'],
  ['3.1.4', 'Abbreviations', 'AAA', '2.0'],
  ['3.1.5', 'Reading Level', 'AAA', '2.0'],
  ['3.1.6', 'Pronunciation', 'AAA', '2.0'],
  ['3.2.1', 'On Focus', 'A', '2.0'],
  ['3.2.2', 'On Input', 'A', '2.0'],
  ['3.2.3', 'Consistent Navigation', 'AA', '2.0'],
  ['3.2.4', 'Consistent Identification', 'AA', '2.0'],
  ['3.2.5', 'Change on Request', 'AAA', '2.0'],
  ['3.2.6', 'Consistent Help', 'A', '2.2'],
  ['3.3.1', 'Error Identification', 'A', '2.0'],
  ['3.3.2', 'Labels or Instructions', 'A', '2.0'],
  ['3.3.3', 'Error Suggestion', 'AA', '2.0'],
  ['3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', '2.0'],
  ['3.3.5', 'Help', 'AAA', '2.0'],
  ['3.3.6', 'Error Prevention (All)', 'AAA', '2.0'],
  ['3.3.7', 'Redundant Entry', 'A', '2.2'],
  ['3.3.8', 'Accessible Authentication (Minimum)', 'AA', '2.2'],
  ['3.3.9', 'Accessible Authentication (Enhanced)', 'AAA', '2.2'],
  // Level A in 2.0 and 2.1; removed in 2.2 (see the note at the top).
  ['4.1.1', 'Parsing', 'A', '2.0', '2.2'],
  ['4.1.2', 'Name, Role, Value', 'A', '2.0'],
  ['4.1.3', 'Status Messages', 'AA', '2.1'],
];
export const CRITERIA: readonly Criterion[] = ROWS.map(([num, name, level, added, removed]) => ({
  num,
  name,
  level,
  added,
  ...(removed ? { removed } : {}),
}));

const rank = (v: Version) => VERSIONS.indexOf(v);
/** Whether a criterion is part of a version: added at or before it, and not yet removed. */
export const inVersion = (c: Criterion, v: Version): boolean =>
  rank(c.added) <= rank(v) && (!c.removed || rank(v) < rank(c.removed));
/**
 * Whether conforming at `level` asks for a criterion. Conformance requirement 1 (guidelines/index.html:418–421):
 * level A meets every level A criterion, AA every A and AA criterion, AAA all three.
 */
export const atLevel = (c: Criterion, level: Level): boolean => LEVELS.indexOf(c.level) <= LEVELS.indexOf(level);
/** The guideline a criterion belongs to ('2.4' for '2.4.11'), and its principle ('2'). */
export const guidelineOf = (c: Criterion): string => c.num.split('.').slice(0, 2).join('.');
export const principleOf = (num: string): string => num.split('.')[0]!;

/** The criteria a version asks for at a level, optionally under one principle or guideline. */
export function criteria(v: Version, level: Level, under?: string): Criterion[] {
  return CRITERIA.filter(
    (c) => inVersion(c, v) && atLevel(c, level) && (!under || c.num.startsWith(under + '.')),
  );
}
export const guidelinesIn = (v: Version) => GUIDELINES.filter((g) => rank(g.added) <= rank(v));

export interface Tally {
  version: Version;
  level: Level;
  total: number;
  /** By principle number. */
  principles: Record<string, number>;
  /** By guideline number, for the guidelines the version has. */
  guidelines: Record<string, number>;
}
export function tally(v: Version, level: Level): Tally {
  return {
    version: v,
    level,
    total: criteria(v, level).length,
    principles: Object.fromEntries(PRINCIPLES.map((p) => [p.num, criteria(v, level, p.num).length])),
    guidelines: Object.fromEntries(guidelinesIn(v).map((g) => [g.num, criteria(v, level, g.num).length])),
  };
}

export interface Change {
  from: Version;
  to: Version;
  level: Level;
  /** Every criterion the version added, at any level. */
  addedAll: number;
  /** Those of them the level asks for, by number. */
  added: string[];
  /** Criteria the version removed that the level asked for. */
  removed: string[];
  /** Guidelines the version added. */
  newGuidelines: string[];
  /** Principles that gained criteria at this level. */
  principlesGained: string[];
}
export function change(from: Version, to: Version, level: Level): Change {
  const fresh = CRITERIA.filter((c) => inVersion(c, to) && !inVersion(c, from) && c.added === to);
  const added = fresh.filter((c) => atLevel(c, level)).map((c) => c.num);
  return {
    from,
    to,
    level,
    addedAll: fresh.length,
    added,
    removed: CRITERIA.filter((c) => inVersion(c, from) && !inVersion(c, to) && atLevel(c, level)).map((c) => c.num),
    newGuidelines: GUIDELINES.filter((g) => g.added === to).map((g) => g.num),
    principlesGained: PRINCIPLES.filter((p) => added.some((n) => principleOf(n) === p.num)).map((p) => p.num),
  };
}

/**
 * One guideline opened: every criterion it has held at the level, in order, with the version
 * that added it and, for 4.1.1, the version that removed it.
 */
export function opened(guideline: string, level: Level): Criterion[] {
  return CRITERIA.filter((c) => guidelineOf(c) === guideline && atLevel(c, level));
}

/** Criteria to meet for each version and level, the totals the scene's last step shows. */
export function totals(): Record<Version, Record<Level, number>> {
  return Object.fromEntries(
    VERSIONS.map((v) => [v, Object.fromEntries(LEVELS.map((l) => [l, criteria(v, l).length]))]),
  ) as Record<Version, Record<Level, number>>;
}
