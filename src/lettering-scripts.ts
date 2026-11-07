// The subset lettering's writing systems, kept out of src/lettering.ts so they are not part of
// `rayner/lettering`: the outline lettering and the CLI read them, scenes name them in meta.

/**
 * Writing systems the subset workflow cuts from the lettering faces, by ISO 15924
 * code: `Latn` is Latin beyond Latin-1. Any other script uses outline snapshots.
 */
export const LETTERING_SCRIPTS = ['Latn', 'Grek', 'Cyrl'] as const;
/** Writing systems an explainer can ask for, by ISO 15924 code. `Latn` is Latin beyond Latin-1. */
export type LetteringScript = typeof LETTERING_SCRIPTS[number];
