// Colours and line styles a caption names, and whether the stage names them too. A resting
// picture should teach with its caption hidden (docs/EXPLAINER-RUBRIC.md, "Clarity"): when a
// caption says "the purple fill" or "the dashed line", a reader without the caption, or without
// colour vision, needs the same word on the stage, in a label, a legend or a part that describes
// itself. `rayner check` fails a step whose caption or line names a look the stage does not.

/** Colour words a caption uses for a look on the stage. "gray" is read as "grey". */
export const COLOUR_WORDS = ['red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'purple', 'violet', 'magenta', 'pink', 'brown', 'grey', 'black', 'white', 'gold'] as const;
/**
 * Line and fill patterns that stand for a category, as a colour does. Emphasis words (outlined,
 * bold, highlighted) and dimming words (faded, greyed out) are left out: their meaning, "this one"
 * and "not this one", is in the picture itself, which is why the stage's helpers draw them.
 */
export const STYLE_WORDS = ['dashed', 'dotted', 'striped', 'hatched'] as const;

/**
 * Phrases whose colour word is not a look on the stage, removed before the words are read. Each
 * says why. A phrase is matched whole, case-insensitively.
 */
export const NOT_A_LOOK: readonly { phrase: RegExp; why: string }[] = [
  { phrase: /\bred[- ]black\b/gi, why: 'a red-black tree is a data structure, not two colours' },
  { phrase: /\bwhite ?space\b/gi, why: 'whitespace is characters, not a colour' },
  { phrase: /\bblack[- ]box\b/gi, why: 'a black box is a way of testing, not a colour' },
  { phrase: /\b(?:green|blue)[- ](?:green|blue)\b/gi, why: 'blue-green is a deployment strategy' },
  { phrase: /\bwhite light\b/gi, why: 'sunlight, the subject of seasons, not a colour drawn' },
  { phrase: /\bgold(?:en)? (?:standard|ratio)\b/gi, why: 'figures of speech' },
  { phrase: /\bfrom gr[ae]y\b/gi, why: 'grey as the neutral that chroma is measured from (tailwind-gamut), not a look on the stage' },
  { phrase: /\bmade it green\b/gi, why: 'the text a file holds (git-branches: colour.txt), not a colour drawn' },
  { phrase: /\bthe report’s gr[ae]y\b/gi, why: 'a usability report’s own code for an excluded attempt, which the stage leaves out (gnome-files)' },
];

const ALL: ReadonlySet<string> = new Set([...COLOUR_WORDS, ...STYLE_WORDS]);
/** A word as the check compares it: lower case, "gray" as "grey", a plural's s dropped. */
function normal(word: string): string | undefined {
  const w = word.toLowerCase().replace(/^gray/, 'grey');
  if (ALL.has(w)) return w;
  if (w.endsWith('s') && ALL.has(w.slice(0, -1))) return w.slice(0, -1);
  return undefined;
}
/** The looks a text names: colour and style words, with the NOT_A_LOOK phrases removed first. */
export function looksNamed(text: string): string[] {
  let t = text;
  for (const { phrase } of NOT_A_LOOK) t = t.replace(phrase, ' ');
  const found: string[] = [];
  for (const word of t.match(/\p{L}+/gu) ?? []) {
    const w = normal(word);
    if (w && !found.includes(w)) found.push(w);
  }
  return found;
}
/** Every look word in a stage's words, for comparison: the same normalising, nothing removed. */
export function stageLooks(texts: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const text of texts) for (const word of text.match(/\p{L}+/gu) ?? []) {
    const w = normal(word);
    if (w) out.add(w);
  }
  return out;
}
/**
 * The looks a line keys itself: words in a clause that ends in a colon ("Red: the plane’s route.
 * Blue dashed: the ruler’s line."), the line being drawn on the stage as the step's heading.
 */
export function keyedByLine(line: string): Set<string> {
  const out = new Set<string>();
  for (const m of line.matchAll(/(?:^|[.;]\s*)([^.;:]+):/g)) for (const w of looksNamed(m[1]!)) out.add(w);
  return out;
}

/**
 * What a step's words name that its stage does not. `heading` is the drawn title and line; `stage`
 * is every other word on the stage: visible text, diagram labels and the words of parts that
 * describe themselves (a legend's "purple fill, cat’s bits"). The caption may lean on the heading;
 * the line is held to the rest of the stage, except for looks it keys itself.
 */
export function captionLookProblems(words: { title?: string; line?: string; caption?: string }, heading: Iterable<string>, stage: Iterable<string>): string[] {
  const onStage = stageLooks(stage);
  const line = words.line ?? '';
  const withHeading = new Set([...onStage, ...stageLooks(heading), ...stageLooks([words.title ?? '', line])]);
  const keyed = keyedByLine(line);
  const problems: string[] = [];
  const caption = looksNamed(words.caption ?? '').filter((w) => !withHeading.has(w));
  if (caption.length) problems.push(`the caption names ${caption.map((w) => `“${w}”`).join(', ')}, which no word on the stage says`);
  const lined = looksNamed(line).filter((w) => !onStage.has(w) && !keyed.has(w));
  if (lined.length) problems.push(`the line names ${lined.map((w) => `“${w}”`).join(', ')}, which nothing else on the stage says`);
  return problems;
}
