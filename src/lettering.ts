// Lettering on request: scripts an explainer asks for with `static meta.lettering`,
// beyond what the embedded faces in font-data.ts hold.
//
//   static meta = { id: 'alphabet', title: 'Αλφάβητο', lettering: { scripts: ['Grek'] } satisfies LetteringRequest };
//
// The build (tools/lib/explain-lettering.ts) cuts Inter and JetBrains Mono from
// vendor/lettering/ down to the characters the explainer draws in those scripts,
// and that explainer's page calls useLettering() with the result before anything
// shapes text. An explainer that asks for nothing never loads this module, so its
// page and receipt are what they were before lettering existed.
//
// Optional compatibility API: it selects defaults for newly constructed text.
// Existing text retains its service; the embedded font table is never changed.
import type { Font } from '../vendor/glyph.js';
import { ATTACHED, decodeFont, embeddedChain, embeddedFaces, loadFonts, memoShaper, setDefaultShapers, takeMissingGlyphs as takeEmbeddedMissing } from './fonts.ts';
import type { FontName, Shaper } from './fonts.ts';
import {setDefaultTextContext} from './text-context.ts';

/**
 * Writing systems the subset workflow cuts from the lettering faces, by ISO 15924
 * code: `Latn` is Latin beyond Latin-1. Any other script uses outline snapshots.
 */
export const LETTERING_SCRIPTS = ['Latn', 'Grek', 'Cyrl'] as const;
/** Writing systems an explainer can ask for, by ISO 15924 code. `Latn` is Latin beyond Latin-1. */
export type LetteringScript = typeof LETTERING_SCRIPTS[number];
/** What `static meta.lettering` asks for. */
export interface SubsetLetteringRequest {
  /** Scripts whose letters the explainer draws. They need no shaping beyond what `glyph` does for Latin. */
  scripts: readonly LetteringScript[];
}
/** The complete public request; plain Latin/Greek/Cyrillic still use the subset workflow. */
export type { LetteringRequest } from './lettering-outlines.ts';
/** The faces a page carries for its request: one WOFF2 subset, base64, per family that draws requested letters. */
export type LetteringFaces = Readonly<Partial<Record<FontName, string>>>;

/** Characters no face in a lettered chain can draw, by the string that held them. */
const missing = new Map<string, string>();
/** Code points each requested face drew since the last takeLetteringUse(), by family. */
const drawn: Record<FontName, Set<number>> = { sans: new Set(), mono: new Set() };
/** Embedded fallback shapers, retained independently of compatibility selections. */
let embedded: Record<FontName, Shaper> | null = null;
/** The faces in use, as a key: empty for none. */
let current = '';

/**
 * A shaper over `chain`, memoized and recording what it cannot draw, as the
 * embedded shapers do. `requested` is the chain's requested faces with the
 * family each came from, so the build learns which face drew which letters.
 * A string with an undrawable character is also given to `plain`, the embedded
 * shaper, so the engine's own takeMissingGlyphs fails on it too: it then names
 * every character the embedded faces lack, and takeMissingGlyphs here names
 * only the ones the requested faces lack as well.
 */
function shaper(chain: readonly Font[], key: FontName, requested: ReadonlyMap<Font, FontName>, plain: Shaper): Shaper {
  return memoShaper(chain, key, {
    first(text): { uses?: readonly (readonly [FontName, number])[] } {
      if (!requested.size) return {};
      // The face shapeChain gives each character: the first in the chain that has it
      const uses: [FontName, number][] = [];
      let owner: Font | undefined;
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (!ATTACHED.test(ch)) owner = chain.find((f) => f.glyphOf(cp) !== 0);
        const family = owner && requested.get(owner);
        if (family) uses.push([family, cp]);
      }
      return { uses };
    },
    // Recorded on every call, memoized or not, as fonts.ts does
    each(text, size, r) {
      if (r.missing) {
        missing.set(text, r.missing);
        plain(text, size);
      }
      for (const [family, cp] of r.uses ?? []) drawn[family].add(cp);
    },
  });
}

/**
 * Add the faces an explainer's page carries to the chains, or with null go back
 * to the embedded faces alone. A requested face joins its family's chain after
 * the embedded face and before the fallbacks, and the mono chain tries mono's
 * requested face before sans: a character the embedded faces draw is drawn as
 * before. Call it before anything shapes text; Text built earlier keeps the
 * outlines it has. Calling it again with the same faces does nothing.
 */
export async function useLettering(faces: LetteringFaces | null): Promise<void> {
  const key = faces && (faces.sans || faces.mono) ? JSON.stringify([faces.sans ?? '', faces.mono ?? '']) : '';
  if (key === current) return;
  const shapers = await loadFonts();
  embedded ??= { ...shapers };
  if (!key) {
    setDefaultShapers(undefined);
    setDefaultTextContext(undefined);
    current = '';
    return;
  }
  const base = await embeddedFaces();
  const sans = faces!.sans ? [await decodeFont(faces!.sans, 'lettering for sans')] : [];
  const mono = faces!.mono ? [await decodeFont(faces!.mono, 'lettering for mono')] : [];
  const requested = new Map<Font, FontName>([...sans.map((f) => [f, 'sans'] as const), ...mono.map((f) => [f, 'mono'] as const)]);
  const selected = Object.freeze({
    sans: shaper(embeddedChain(base, 'sans', { sans, mono }), 'sans', requested, embedded.sans),
    mono: shaper(embeddedChain(base, 'mono', { sans, mono }), 'mono', requested, embedded.mono),
  });
  setDefaultShapers(selected);
  setDefaultTextContext({shape: (owner, text, size) => selected[owner.font](text, size)});
  current = key;
}

/**
 * What was shaped since the last call that the fonts could not draw, as the
 * engine's takeMissingGlyphs reports it, but naming for a lettered string only
 * the characters no face, requested or embedded, has; clears both records.
 */
export function takeMissingGlyphs(): Map<string, string> {
  const out = takeEmbeddedMissing();
  for (const [text, chars] of missing) out.set(text, chars);
  missing.clear();
  return out;
}

/** The code points each requested face drew since the last call, by family; clears the record. */
export function takeLetteringUse(): Record<FontName, number[]> {
  const out = { sans: [...drawn.sans].sort((a, b) => a - b), mono: [...drawn.mono].sort((a, b) => a - b) };
  drawn.sans.clear();
  drawn.mono.clear();
  return out;
}
