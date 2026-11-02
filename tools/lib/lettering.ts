// Node-only preparation. Optional dependencies are needed only to refresh a
// lettering snapshot; check/build from a fresh snapshot need none of them.
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadFont } from '../../vendor/glyph.js';
import { SANS, MONO, FALLBACK } from '../../src/font-data.ts';
import { bindLettering, cutFace, defaultCutFace, letteringOf, packLettering, unpackLettering, numericAlphabet, requestCuts, runKey, scaledRun, scriptCuts, scriptFaceNames, snapshotProvider, usesLettering } from '../../src/lettering-outlines.ts';
import type { LetteringCut, PackedLetteringSnapshot, StoredLetteringSnapshot, LetteringSnapshot, LetteringProvider, LetteringRequest } from '../../src/lettering-outlines.ts';
import type { ExplainerClass } from '../../explain/settings.ts';
import type { Run } from '../../vendor/glyph.js';
import { licenceOf, validateLetteringSnapshot } from './lettering-validation.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n';
/**
 * The faces a scene may ask for, each cut as a file in the font cache that
 * tools/lettering-outline-fonts.sh fills, with the file holding its licence
 * (`repo:` for one in this repository). Only OFL and Apache-2.0 faces may be
 * listed: capture and every build check each notice (licenceOf).
 */
interface RegistryFace { cuts: Partial<Record<LetteringCut, string>>; license: string }
const fontsource = (name: string, subset: string, cuts: Partial<Record<LetteringCut, string>>): RegistryFace => ({
  cuts: Object.fromEntries(Object.entries(cuts).map(([cut, file]) => [cut, `fontsource-${name}-5.3.0/package/files/${name}-${subset}-${file}.woff2`])),
  license: `fontsource-${name}-5.3.0/package/LICENSE`,
});
const registry: Record<string, RegistryFace> = {
  'noto-naskh-arabic': fontsource('noto-naskh-arabic', 'arabic', { '': '400-normal', bold: '700-normal' }),
  'noto-sans-devanagari': fontsource('noto-sans-devanagari', 'devanagari', { '': '400-normal', bold: '700-normal' }),
  'noto-sans-hebrew': fontsource('noto-sans-hebrew', 'hebrew', { '': '400-normal', bold: '700-normal' }),
  'inter': {
    cuts: Object.fromEntries((['', 'bold', 'italic', 'bold-italic'] as const).map((cut, i) =>
      [cut, `inter-ui-4.1.1/package/web/Inter-${['Regular', 'Bold', 'Italic', 'BoldItalic'][i]}.woff2`])),
    license: 'inter-ui-4.1.1/package/LICENSE.txt',
  },
  // Weight 400 of the variable TrueType release, from LETTERING_CJK=1 tools/lettering-outline-fonts.sh. No Bold cut yet.
  'noto-sans-sc': { cuts: { '': 'noto-sans-sc.ttf' }, license: 'Noto-CJK-OFL.txt' },
  'eb-garamond': fontsource('eb-garamond', 'latin', { '': '400-normal', bold: '700-normal', italic: '400-italic', 'bold-italic': '700-italic' }),
  // The jetbrains-mono npm package's own LICENSE is the MIT licence of its CSS; the font's OFL is vendored.
  'jetbrains-mono': {
    cuts: Object.fromEntries((['', 'bold', 'italic', 'bold-italic'] as const).map((cut, i) =>
      [cut, `jetbrains-mono-1.0.6/package/fonts/webfonts/JetBrainsMono-${['Regular', 'Bold', 'Italic', 'BoldItalic'][i]}.woff2`])),
    license: 'repo:vendor/licenses/JetBrainsMono-OFL.txt',
  },
};
const scriptFaces = scriptFaceNames;
/**
 * The layout features a subset keeps: those glyph's shaper applies when a page
 * replays a counter (DEFAULT_GSUB and DEFAULT_GPOS in vendor/glyph.js), less the
 * ligatures for JetBrains Mono, which capture shapes as literal code.
 */
const GLYPH_FEATURES = ['rvrn', 'ccmp', 'locl', 'rlig', 'calt', 'clig', 'liga', 'rclt', 'kern', 'mark', 'mkmk', 'curs', 'dist', 'abvm', 'blwm'];
const subsetFeatures = (name: string) =>
  name.startsWith('jetbrains-mono') ? GLYPH_FEATURES.filter((f) => !['calt', 'clig', 'liga'].includes(f)) : GLYPH_FEATURES;
const STYLES = ['bold', 'italic'];
/**
 * Text the build shapes but no page draws (contact-sheet titles and the wrapping that
 * measures them, contact-sheet titles) is shaped inside offPage(), so capture
 * lists its runs in the snapshot's offPage. Scoped to the async work it wraps.
 */
const offPageWork = new AsyncLocalStorage<true>();
export const offPage = <T>(work: () => Promise<T>): Promise<T> => offPageWork.run(true, work);
const isOffPage = (): boolean => offPageWork.getStore() === true;
export function validateLettering(request: LetteringRequest): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('lettering must be an object');
  for (const k of Object.keys(request)) if (!['faces', 'scripts', 'math', 'styles'].includes(k)) throw new Error(`Unknown lettering option: ${k}`);
  if (request.styles !== undefined) {
    if (!Array.isArray(request.styles) || !request.styles.length) throw new Error("lettering.styles must be a non-empty array of 'bold' and 'italic'");
    for (const style of request.styles) if (!STYLES.includes(style)) throw new Error(`Unknown lettering style: ${style}; use 'bold' or 'italic'`);
    if (new Set(request.styles).size !== request.styles.length) throw new Error('lettering.styles names a style twice');
  }
  if (request.math !== undefined && typeof request.math !== 'boolean') throw new Error('lettering.math must be boolean');
  if (request.faces && (typeof request.faces !== 'object' || Array.isArray(request.faces))) throw new Error('lettering.faces must be an object');
  for (const [key, name] of Object.entries(request.faces ?? {})) {
    if (!['sans', 'mono'].includes(key) || !Object.hasOwn(registry, name)) throw new Error(`Unknown lettering face: ${key}=${name}`);
  }
  if (request.scripts !== undefined && !Array.isArray(request.scripts)) throw new Error('lettering.scripts must be an array');
  for (const script of request.scripts ?? []) {
    if (typeof script !== 'string' || !/^[A-Z][a-z]{3}$/.test(script)) throw new Error(`Invalid ISO 15924 script: ${script}`);
    try { new RegExp(`\\p{Script=${script}}`, 'u'); } catch { throw new Error(`Unknown script: ${script}`); }
    if (!scriptFaces[script] && !request.faces?.sans) throw new Error(`Script ${script} requires a supported face in lettering.faces.sans`);
  }
}
function python(request: object): unknown {
  try {
    return JSON.parse(execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', [join(root, 'tools/lettering.py')], {
      input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    }));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    throw new Error(`Lettering needs fonttools, brotli, uharfbuzz and python-bidi when refreshing snapshots. ${stderr ?? String(error)}`);
  }
}
export interface PreparedLettering {
  Scene: ExplainerClass;
  snapshot: LetteringSnapshot;
  readonly measurementHash: string;
  finish(): Promise<void>;
}
export async function prepareLettering(Source: ExplainerClass, file: string, sourceHash: string, capture: boolean, persist = true): Promise<PreparedLettering | undefined> {
  const request = letteringOf(Source);
  if (!request) return undefined;
  validateLettering(request);
  if (!Object.keys(request.faces ?? {}).length && !request.scripts?.length && !request.math && !request.styles?.length) return undefined;
  // Default faces and the core shaper are inputs too: requested runs may contain
  // glyphs from the existing fallback chain, and Text determines the strings
  // handed to the shaper (for example after tab expansion).
  const builderHash = hash((await Promise.all(['src/text-context.ts', 'src/lettering-outlines.ts', 'src/math.ts', 'src/italic.ts', 'src/font-data.ts', 'src/fonts.ts', 'src/text.ts', 'tools/lib/lettering.ts', 'tools/lib/lettering-validation.ts', 'tools/lettering.py', 'tools/lettering-requirements.txt', 'vendor/glyph.js', 'vendor/glyph-math.js'].map((name) => readFile(join(root, name), 'utf8')))).join('\n'));
  const path = file.replace(/\.[^.]+$/, '') + '.lettering.json';
  if (!capture) {
    const raw: unknown = await readFile(path, 'utf8').then(JSON.parse).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    });
    let snapshot: LetteringSnapshot | undefined;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      try { snapshot = unpackLettering(raw as LetteringSnapshot); }
      catch (e) { throw new Error(`${(e as Error).message.replace(/; run rayner snapshots.*$/, '')}; run rayner snapshots ${file}`); }
    }
    if (!snapshot || snapshot.version !== 1 || snapshot.sourceHash !== sourceHash || snapshot.builderHash !== builderHash || json(snapshot.request) !== json(request))
      throw new Error('Missing or stale lettering snapshot; run rayner snapshots ' + file);
    validateLetteringSnapshot(snapshot);
    if (!snapshot.payloadHash || snapshot.payloadHash !== hash(JSON.stringify({ ...snapshot, payloadHash: undefined })))
      throw new Error('Invalid lettering snapshot payload checksum; run rayner snapshots ' + file);
    return { Scene: bindLettering(Source, snapshot), snapshot,
      get measurementHash() {
        if (!snapshot.fontInputs) throw new Error('Missing natural diagram font identity; run rayner snapshots ' + file);
        return hash(JSON.stringify([snapshot.builderHash, snapshot.shaper, snapshot.request, snapshot.fontInputs]));
      }, async finish() {} };
  }
  const folder = resolve(process.env.RAYNER_LETTERING_FONTS ?? join(root, 'out/lettering-fonts'));
  await mkdir(folder, { recursive: true });
  const fonts = new Map<string, { file: string; license: string; hash: string }>();
  // name is a registry face, or one of its cuts as cutFace() names it ('inter/bold').
  const addFace = (name: string) => {
    if (fonts.has(name)) return;
    const [base, cut = ''] = name.split('/') as [string, LetteringCut?];
    const info = registry[base];
    if (!info) throw new Error(`Unknown lettering face: ${name}`);
    const file = info.cuts[cut];
    if (!file) throw new Error(`Lettering face ${base} has no ${cut} cut`);
    let bytes: Buffer, license: string;
    try {
      bytes = readFileSync(join(folder, file));
      license = readFileSync(info.license.startsWith('repo:') ? join(root, info.license.slice(5)) : join(folder, info.license), 'utf8');
    } catch (e) { throw new Error(`Install requested lettering fonts with tools/lettering-outline-fonts.sh: ${String(e)}`); }
    if (!licenceOf(license)) throw new Error(`Lettering face ${base} is not under the OFL or Apache-2.0; only those may be embedded`);
    fonts.set(name, { file: join(folder, file), license, hash: hash(bytes) });
  };
  for (const name of [...Object.values(request.faces ?? {}), ...(request.scripts ?? []).flatMap((s) => scriptFaces[s] ?? [])]) addFace(name);
  // The face each family's cut comes from, best first after the requested cut (scriptCuts).
  const hasCut = (name: string, cut: LetteringCut) => !!registry[name]?.cuts[cut];
  /** Script faces with no stand-in for a cut, which that cut's chain leaves out. */
  const lacking = new Map<LetteringCut, string[]>();
  const chainOf = (font: 'sans' | 'mono', cut: LetteringCut): string[] => {
    const scripts = (request.scripts ?? []).flatMap((s) => scriptFaces[s] ?? []);
    if (!cut) return [...new Set([request.faces?.[font] ?? font, ...scripts, font, 'sans', ...FALLBACK.map(([name]) => name)])];
    const primary = request.faces?.[font] ?? defaultCutFace[font];
    if (!hasCut(primary, cut)) throw new Error(`Lettering face ${primary} has no ${cut} cut; ask for another face or drop the style`);
    const cuts = scripts.flatMap((name) => {
      const found = scriptCuts(cut).find((c) => hasCut(name, c));
      return found === undefined ? [] : [cutFace(name, found)];
    });
    lacking.set(cut, [...new Set(scripts.filter((name) => !scriptCuts(cut).some((c) => hasCut(name, c))))]);
    for (const name of [cutFace(primary, cut), ...cuts]) addFace(name);
    return [...new Set([cutFace(primary, cut), ...cuts, font, 'sans', ...FALLBACK.map(([name]) => name)])];
  };
  // Say which face lacked the cut when a styled run has a character no face in its chain draws.
  const withLacking = <T>(cut: LetteringCut, work: () => T): T => {
    try { return work(); } catch (error) {
      const names = lacking.get(cut) ?? [];
      if (!names.length || !/No requested face draws/.test(String(error))) throw error;
      throw new Error(`${(error as Error).message}. ${names.join(', ')} has no ${cut} cut, so ${cut} text cannot draw its script; keep that text regular or drop '${cut.split('-')[0]}' from meta.lettering.styles`);
    }
  };
  // Code points each cut face drew, so a Bold cut carries only the bold text it drew.
  const cutUsed = new Map<string, Set<number>>();
  // The old, already subset faces are the final fallback, unchanged. Write
  // them into an ignored cache only for the build-time HarfBuzz process. Captures
  // in other processes share it: never expose an open/truncated font to a reader.
  for (const [name, data] of [['sans', SANS], ['mono', MONO], ...FALLBACK]) {
    const bytes = Buffer.from(data!, 'base64'), digest = hash(bytes);
    const file = join(folder, `${name}-${digest}.woff2`);
    const cached = await readFile(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!cached?.equals(bytes)) {
      const temporary = await mkdtemp(join(folder, '.embedded-'));
      try {
        const pending = join(temporary, 'font.woff2');
        await writeFile(pending, bytes);
        await rename(pending, file);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    fonts.set(name!, { file, license: '', hash: digest });
  }
  const coverage = await Promise.all([SANS, MONO, ...FALLBACK.map(([, data]) => data)].map(async (data) => {
    const result = await loadFont(Buffer.from(data, 'base64'));
    if (result.tag !== 'Ok') throw new Error('Cannot decode existing font coverage');
    return result.value;
  }));
  const snapshot: LetteringSnapshot = { version: 1, sourceHash, builderHash, request, runs: {}, faces: {}, shaper: 'uharfbuzz+python-bidi/fonttools; glyph-math@6398654' };
  const used = new Set<number>();
  const usedMath = new Set<number>();
  let mathFont: Awaited<ReturnType<typeof loadFont>> | undefined;
  if (request.math) {
    const file = process.env.RAYNER_MATH_FONT ?? '/usr/share/texmf/fonts/opentype/public/lm-math/latinmodern-math.otf';
    const bytes = await readFile(file).catch(() => { throw new Error('Set RAYNER_MATH_FONT to Latin Modern Math 1.959 (OpenType MATH font)'); });
    if (hash(bytes) !== '6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f') throw new Error('Latin Modern Math checksum mismatch');
    mathFont = await loadFont(bytes);
    if (mathFont.tag !== 'Ok') throw new Error('Cannot load Latin Modern Math: ' + JSON.stringify(mathFont.error));
    fonts.set('latin-modern-math', { file, hash: hash(bytes), license: await readFile(join(root, 'vendor/licenses/LatinModernMath-GUST.txt'), 'utf8') });
  }
  const { typeset } = request.math ? await import('../../vendor/glyph-math.js') : { typeset: undefined };
  let replay: LetteringProvider | undefined;
  // Which runs the scene draws, and which only the build's footers and contact sheets do
  const onPage = new Set<string>(), offPageOnly = new Set<string>();
  const seen = (key: string) => (isOffPage() ? offPageOnly : onPage).add(key);
  const provider: LetteringProvider = {
    async prepare() { await replay?.prepare?.(); },
    request,
    shape(font, text, size, fallback, cut = '') {
      if (replay) return replay.shape(font, text, size, fallback, cut);
      if (cut && !requestCuts(request).includes(cut)) throw new Error(`Lettering cut ${cut} was not requested in meta.lettering.styles`);
      if (!cut && !request.faces?.[font] && !request.scripts?.length) return fallback(text, size);
      const key = runKey(cutFace(font, cut), text);
      let r = snapshot.runs[key];
      if (r || usesLettering(request, font, text, cut)) seen(key);
      if (!r) {
        for (const ch of text) {
          // Existing coverage remains free, including the existing numeral faces.
          if (!coverage.some((f) => f.glyphOf(ch.codePointAt(0)!) !== 0) && !/\p{Cc}|\p{Cf}/u.test(ch) &&
            !(request.scripts ?? []).some((s) => new RegExp(`\\p{Script_Extensions=${s}}`, 'u').test(ch)))
            throw new Error(`Script not requested in meta.lettering.scripts: ${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase()})`);
          used.add(ch.codePointAt(0)!);
        }
        if (!usesLettering(request, font, text, cut)) return fallback(text, size);
        const chain = chainOf(font, cut);
        // The chain's first face wins wherever it draws a cluster when the scene named it, or for a cut.
        const shaped = withLacking(cut, () => python({ command: 'shape', fonts: chain.map((n) => fonts.get(n)!.file), text, mono: font === 'mono', literal: chain.flatMap((n, i) => n.startsWith('jetbrains-mono') ? [i] : []), explicitPrimary: !!cut || !!request.faces?.[font], preferred: Object.fromEntries((request.scripts ?? []).filter((s) => ['Arab', 'Deva', 'Hebr', 'Hani'].includes(s)).flatMap((s) => {
          const at = chain.findIndex((n) => n.split('/')[0] === scriptFaces[s]);
          return at < 0 ? [] : [[s, at]];
        })) })) as Run & { uses: Record<string, number[]> };
        const { uses, ...run } = shaped;
        for (const [index, points] of Object.entries(uses)) {
          const name = chain[Number(index)]!;
          if (!name.includes('/')) continue;
          const set = cutUsed.get(name) ?? new Set<number>();
          for (const point of points) set.add(point);
          cutUsed.set(name, set);
        }
        r = run;
        Object.defineProperty(snapshot.runs, key, { value: r, enumerable: true });
      }
      return scaledRun(r, size);
    },
    math(text, size, display) {
      if (replay) return replay.math(text, size, display);
      if (!request.math || !typeset || mathFont?.tag !== 'Ok') throw new Error('Math requires meta.lettering.math: true');
      const key = runKey('math', text, display);
      seen(key);
      let run = snapshot.runs[key];
      if (!run) {
        const result = typeset(mathFont.value, 'latin-modern-math', text, { size: 1, display });
        if (result.tag !== 'Ok') throw new Error('Math: ' + JSON.stringify(result.error));
        const r = result.value;
        run = { width: r.width, ascent: r.ascent, descent: r.descent, s: r.s,
          glyphs: r.glyphs.map((g) => {
            usedMath.add(g.gid);
            return { gid: g.gid, cluster: 0, x: g.x * r.s, dx: 0, dy: g.y * r.s, ax: 0, s: g.k * r.s, path: g.path };
          }) };
        for (const rule of r.rules) {
          const { x, y, w, h } = rule;
          run.glyphs.push({ gid: -1, cluster: 0, x: 0, dx: 0, dy: 0, ax: 0, s: r.s,
            path: [{ tag: 'MoveTo', x, y }, { tag: 'LineTo', x: x + w, y }, { tag: 'LineTo', x: x + w, y: y + h }, { tag: 'LineTo', x, y: y + h }, { tag: 'Close' }] });
        }
        Object.defineProperty(snapshot.runs, key, { value: run, enumerable: true });
      }
      return scaledRun(run, size);
    },
  };
  return { Scene: bindLettering(Source, provider), snapshot,
    get measurementHash() {
      // Resolve every requested cut before fixing the identity. Later layout
      // probes may draw a cut that the scene has not visited yet.
      for (const family of ['sans', 'mono'] as const)
        for (const cut of ['', ...requestCuts(request)] as LetteringCut[]) chainOf(family, cut);
      snapshot.fontInputs = Object.fromEntries([...fonts].sort(([a], [b]) => a.localeCompare(b)).map(([name, face]) => [name, face.hash]));
      return hash(JSON.stringify([snapshot.builderHash, snapshot.shaper, snapshot.request, snapshot.fontInputs]));
    },
    async finish() {
      for (const [name, face] of fonts) if (face.license) {
        // A cut carries only what it drew: leave out a cut that drew nothing.
        const cut = name.includes('/');
        if (cut && !cutUsed.has(name)) continue;
        // Numeric animations visit values between their endpoints and may be
        // replayed at different playback frame rates. Keep their bounded alphabet
        // in replacement faces, and in each cut a family's text starts from, so
        // the runtime can shape these values without accepting arbitrary new
        // captions or scripts.
        const points = new Set(cut ? cutUsed.get(name) : used);
        if (Object.values(request.faces ?? {}).includes(name) || (cut && (['sans', 'mono'] as const).some((font) =>
          requestCuts(request).some((c) => c && cutFace(request.faces?.[font] ?? defaultCutFace[font], c) === name))))
          for (const ch of numericAlphabet) points.add(ch.codePointAt(0)!);
        const data = python({ command: 'subset', font: face.file, codepoints: [...points].sort((a, b) => a - b), gids: name === 'latin-modern-math' ? [...usedMath] : [], features: subsetFeatures(name) }) as string;
        snapshot.faces[name] = { hash: face.hash, data, license: face.license };
      }
      // Stable run order, regardless of which case first visits a string.
      snapshot.runs = Object.fromEntries(Object.entries(snapshot.runs).sort(([a], [b]) => a.localeCompare(b)));
      const off = Object.keys(snapshot.runs).filter((key) => offPageOnly.has(key) && !onPage.has(key));
      if (off.length) snapshot.offPage = off;
      snapshot.payloadHash = hash(JSON.stringify({ ...snapshot, payloadHash: undefined }));
      replay = snapshotProvider(snapshot);
      if (persist) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, snapshotFile(packLettering(snapshot)));
      }
    },
  };
}
/**
 * A packed snapshot as committed: indented JSON, but each run and each outline
 * on one line, so the file stays small and a recapture's diff names the runs
 * that changed.
 */
function snapshotFile(snapshot: StoredLetteringSnapshot): string {
  const lines = (entries: [string, unknown][]) => entries.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n');
  const body = Object.entries(snapshot).filter(([, value]) => value !== undefined).map(([key, value]) => {
    if (key === 'runs') return `  "runs": {\n${lines(Object.entries(value as object))}\n  }`;
    if (key === 'outlines') return `  "outlines": [\n${(value as unknown[]).map((o) => '    ' + JSON.stringify(o)).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`;
  });
  return `{\n${body.join(',\n')}\n}\n`;
}
export async function letteringWeight(snapshot: LetteringSnapshot) {
  return {
    /** The snapshot as stored: packed, each outline once. */
    bytes: Buffer.byteLength(JSON.stringify(packLettering(snapshot))),
    /** What the page's script carries of it (pageSnapshot). */
    pageBytes: Buffer.byteLength(JSON.stringify(await pageSnapshot(snapshot))),
    faceBytes: Object.fromEntries(Object.entries(snapshot.faces).map(([name, face]) => [name, Buffer.from(face.data, 'base64').length])),
    runs: Object.keys(snapshot.runs).length,
  };
}
/**
 * What a page carries of a snapshot, packed: the request and the runs its scene
 * draws, which hold every outline it shows, each distinct outline once, and only
 * the subsets its counters shape with (the faces snapshotProvider decodes). Runs
 * only the build draws (offPage), hashes and licences stay in the snapshot; the
 * licences go to the page's licence block, once each.
 */
export async function pageSnapshot(snapshot: LetteringSnapshot): Promise<PackedLetteringSnapshot> {
  const used = new Set<string>();
  const faces = new Proxy(snapshot.faces, {
    get(target, key) {
      if (typeof key === 'string' && Object.hasOwn(target, key)) used.add(key);
      return Reflect.get(target, key);
    },
  });
  const off = new Set(snapshot.offPage);
  const runs = Object.fromEntries(Object.entries(snapshot.runs).filter(([key]) => !off.has(key)));
  await snapshotProvider({ ...snapshot, runs, faces }).prepare!();
  return packLettering({
    version: 1, sourceHash: '', builderHash: '', request: snapshot.request, runs, shaper: '',
    faces: Object.fromEntries([...used].sort().map((name) => [name, { hash: '', data: snapshot.faces[name]!.data, license: '' }])),
  });
}
/** The face licences a lettered page adds to its licence block: each distinct notice once. */
export const letteringLicences = (snapshot: LetteringSnapshot): string[] =>
  [...new Set(Object.values(snapshot.faces).map((face) => face.license))];
