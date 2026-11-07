// The subset lettering's writing systems, kept out of src/lettering.ts so the outline lettering
// reads them without loading the subset workflow: the CLI reads them too, scenes name them in meta.

/**
 * Writing systems the subset workflow cuts from the lettering faces, by ISO 15924
 * code: `Latn` is Latin beyond Latin-1. Any other script uses outline snapshots.
 */
export const LETTERING_SCRIPTS = ['Latn', 'Grek', 'Cyrl'] as const;
/** Writing systems an explainer can ask for, by ISO 15924 code. `Latn` is Latin beyond Latin-1. */
export type LetteringScript = typeof LETTERING_SCRIPTS[number];
