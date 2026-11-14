// Cached lettering is executable drawing data. Reject damaged snapshots before
// they reach Text, the browser, or an image renderer, even if their metadata is fresh.
import type { LetteringSnapshot } from '../../src/internal.ts';
import { LETTERING_VERSION } from '../../src/internal.ts';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function validateLetteringSnapshot(value: unknown): asserts value is LetteringSnapshot {
  const fail = (part: string): never => { throw new Error(`scene.lettering.json: its ${part} is invalid; run rayner snapshots to rebuild it`); };
  if (!object(value) || value.version !== LETTERING_VERSION || !digest(value.builderHash) ||
      !object(value.request) || !object(value.runs) || !object(value.faces) || typeof value.shaper !== 'string') fail('header');
  const snapshot = value as Record<string, unknown> & { runs: Record<string, unknown>; faces: Record<string, unknown> };
  if (snapshot.fontInputs !== undefined && (!object(snapshot.fontInputs) ||
      !Object.keys(snapshot.fontInputs).length || !Object.values(snapshot.fontInputs).every(digest))) fail('font inputs');
  for (const [key, value] of Object.entries(snapshot.runs)) {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { fail('run key'); }
    if (!Array.isArray(parts) || parts.length !== 3 || !/^(?:math|(?:sans|mono)(?:\/(?:bold|italic|bold-italic))?)$/.test(String(parts[0])) ||
        typeof parts[1] !== 'string' || typeof parts[2] !== 'boolean') fail('run key');
    const text = (parts as [string, string, boolean])[1];
    const sourceLength = [...text].length;
    if (!object(value)) fail('run');
    const run = value as Record<string, unknown>;
    if (![run.width, run.ascent, run.descent].every(finite) || Number(run.width) < 0 ||
        (run.s !== undefined && (!finite(run.s) || run.s <= 0)) || !Array.isArray(run.glyphs)) fail('run metrics');
    for (const raw of run.glyphs as unknown[]) {
      if (!object(raw)) fail('glyph');
      const glyph = raw as Record<string, unknown>;
      if (!Number.isInteger(glyph.gid) || Number(glyph.gid) < -1 || !Number.isInteger(glyph.cluster) || Number(glyph.cluster) < 0 ||
          Number(glyph.cluster) >= sourceLength || ![glyph.x, glyph.dx, glyph.dy, glyph.ax].every(finite) ||
          (glyph.s !== undefined && (!finite(glyph.s) || glyph.s <= 0)) || !Array.isArray(glyph.path)) fail('glyph');
      for (const raw of glyph.path as unknown[]) {
        if (!object(raw)) fail('outline');
        const segment = raw as Record<string, unknown>;
        const coordinates = segment.tag === 'Close' ? [] : segment.tag === 'MoveTo' || segment.tag === 'LineTo' ? ['x', 'y'] :
          segment.tag === 'QuadTo' ? ['x1', 'y1', 'x', 'y'] : segment.tag === 'CubicTo' ? ['x1', 'y1', 'x2', 'y2', 'x', 'y'] : undefined;
        if (!coordinates || !coordinates.every((name) => finite(segment[name]))) fail('outline');
      }
    }
  }
  if (snapshot.offPage !== undefined && (!Array.isArray(snapshot.offPage) ||
      snapshot.offPage.some((key) => typeof key !== 'string' || !Object.hasOwn(snapshot.runs, key)))) fail('off-page runs');
  for (const [name, value] of Object.entries(snapshot.faces)) {
    if (!object(value) || !digest(value.hash) || typeof value.license !== 'string' || typeof value.data !== 'string' ||
        !value.data.length || value.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) fail('face');
    // Latin Modern Math (GUST Font License) is the one face outside the rule, for Math.
    const gust = name === 'latin-modern-math' && /GUST Font License/.test(String((value as { license: string }).license));
    if (!gust && !licenceOf(String((value as { license: string }).license)))
      throw new Error(`meta.lettering: the face ${name} is not under the OFL or Apache-2.0, and only those may be embedded; ask for another face`);
  }
}

/**
 * The licence a face's notice grants, if lettering may embed it: the SIL Open
 * Font License 1.1 or the Apache License 2.0. Any other notice fails capture
 * and every build from a snapshot.
 */
export function licenceOf(notice: string): 'OFL-1.1' | 'Apache-2.0' | undefined {
  if (/SIL OPEN FONT LICENSE/i.test(notice) && /Version 1\.1/i.test(notice)) return 'OFL-1.1';
  if (/Apache License/.test(notice) && /Version 2\.0/.test(notice)) return 'Apache-2.0';
  return undefined;
}
/** The face licences a lettered page adds to its licence block: each distinct notice once. */
export const letteringLicences = (snapshot: LetteringSnapshot): string[] =>
  [...new Set(Object.values(snapshot.faces).map((face) => face.license))];
