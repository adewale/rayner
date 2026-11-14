// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { listed } from '../lib/format.ts';
import { BEFORE, COPIES, HUNK, WIDE, apply, header, oldSide } from './model.ts';
import type { Placement } from './model.ts';

/** Three lines added above the author's file instead of two: where the hunk goes, and the lines tried on the way. */
export const ABOVE: Placement = (() => {
  const result = apply(['; settings', 'name = demo', 'debug = off', ...BEFORE], [HUNK]);
  if (!result.ok) throw new Error('the hunk should fit three lines down');
  return result.placements[0]!;
})();
/** The copy whose port changed: the places the three-line hunk could go, in the order they are tried, and the line Git names. */
export const REFUSED = (() => {
  const result = apply(COPIES.edited, [HUNK]);
  if (result.ok) throw new Error('the hunk should fit nowhere');
  return { places: result.tried, line: result.line };
})();
/** The three-lines-of-context hunk on the copy with two lines added at the top. */
export const TOP = apply(COPIES.moved, [WIDE]);

export const questions = {
  1: () =>
    `At line ${ABOVE.at}, an offset of ${ABOVE.offset} lines. Git tries lines ${listed(ABOVE.tried)}: the line the header names, then one down, one up, two down, and, with nothing left above line 1, three down, where the hunk’s three old lines match.`,
  2: () =>
    `Because the hunk expects ${oldSide(HUNK).length} lines in a row: ${listed(oldSide(HUNK))}. All of them must match, and with the port changed no ${oldSide(HUNK).length} lines of the file do. Git tries lines ${listed(REFUSED.places)}, finds no match and reports the hunk’s own line, ${REFUSED.line}. The file is left untouched.`,
  3: () =>
    `Its header is ${header(WIDE)}, and a hunk that starts at line 1 is ${!TOP.ok && TOP.tried.length === 1 ? 'tried only at the top of the file' : 'tried everywhere'}: it claims to change the file’s first lines. With two new lines above them the top no longer matches, and Git looks nowhere else.`,
};
