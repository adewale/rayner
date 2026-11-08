// Lettering on request, at build time. An explainer that sets `static meta.lettering`
// gets Inter and JetBrains Mono (vendor/lettering/, made by tools/repo/lettering-fonts.sh)
// cut to the letters it draws in the scripts it asked for, and only its page carries
// them. The cut faces are pinned beside the scene in `<scene>.lettering.json`, so a
// build needs fonttools only when the letters change. An explainer that asks for
// nothing never reaches this file's work: see collectProject.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { useLettering, withLettering, takeLetteringUse } from '../../src/lettering.ts';
import { LETTERING_SCRIPTS } from '../../src/lettering-scripts.ts';
import { SUBSET_LETTERING_VERSION } from '../../src/lettering-outlines.ts';
import type { SubsetLetteringRequest, LetteringScript, LetteringFaces } from '../../src/lettering.ts';
import type { FontName } from '../../src/index.ts';
import { ROOT } from './roots.ts';
import { sfntBase64 } from './woff2.ts';
import { sha256 } from './hash.ts';


/** Code point ranges per script. Keep in step with tools/repo/lettering-fonts.sh, which cuts the sources to them. */
export const SCRIPTS: Record<LetteringScript, readonly (readonly [number, number])[]> = {
  Latn: [
    [0x0100, 0x024f],
    [0x1e00, 0x1eff],
  ],
  Grek: [
    [0x0370, 0x03ff],
    [0x1f00, 0x1fff],
  ],
  Cyrl: [[0x0400, 0x052f]],
};
/** The face each family's requested letters come from, and the layout features kept, as for the embedded faces. */
const SOURCES: Record<FontName, { file: string; features: string }> = {
  sans: { file: 'vendor/lettering/inter.woff2', features: 'kern,liga,ccmp,locl,mark,mkmk' },
  mono: { file: 'vendor/lettering/jetbrains-mono.woff2', features: 'kern,mark,mkmk' },
};
const FAMILIES = ['sans', 'mono'] as const;

/** A cut face: the letters it holds and the WOFF2 bytes, base64. */
export interface LetteringFace {
  codePoints: number[];
  woff2: string;
}
/** What a lettered explainer's page carries, and what that costs. */
export interface Lettering {
  scripts: readonly LetteringScript[];
  faces: Partial<Record<FontName, LetteringFace>>;
}

/** The scene's request, checked; undefined when it asks for nothing. */
export function letteringRequest(Scene: { meta?: object }): SubsetLetteringRequest | undefined {
  const value = (Scene.meta as { lettering?: unknown } | undefined)?.lettering;
  if (value === undefined) return undefined;
  const known: readonly string[] = LETTERING_SCRIPTS;
  const fail = (why: string) => {
    throw new TypeError(`meta.lettering: it ${why}; ask for { scripts: [...] } with some of ${known.join(', ')}`);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('must be an object');
  const extra = Object.keys(value as object).filter((k) => k !== 'scripts');
  if (extra.length) fail(`has ${extra.join(', ')}, which Rayner does not support yet`);
  const scripts = (value as { scripts?: unknown }).scripts;
  if (!Array.isArray(scripts) || !scripts.length) fail('needs a non-empty scripts list');
  for (const s of scripts as unknown[])
    if (typeof s !== 'string' || !known.includes(s)) fail(`asks for an unknown script ${JSON.stringify(s)}`);
  if (new Set(scripts as unknown[]).size !== (scripts as unknown[]).length) fail('names a script twice');
  return { scripts: scripts as LetteringScript[] };
}

const inScripts = (scripts: readonly LetteringScript[], cp: number) =>
  scripts.some((s) => SCRIPTS[s].some(([from, to]) => cp >= from && cp <= to));
const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0');

/** The cuts for useLettering(), as committed: WOFF2. */
const cutFaces = (l: Lettering | undefined): LetteringFaces | null =>
  l ? Object.fromEntries(FAMILIES.flatMap((f) => (l.faces[f] ? [[f, l.faces[f].woff2]] : []))) : null;
/**
 * The page's faces for useLettering(): the cuts as SFNT, which the page's shaper reads without
 * a Brotli decoder (tools/lib/woff2.ts).
 */
export const pageFaces = (l: Lettering | undefined): LetteringFaces | null => {
  const faces = cutFaces(l);
  return faces && Object.fromEntries(Object.entries(faces).map(([family, data]) => [family, sfntBase64(data!)]));
};
/** Put the project's lettering in place for what draws it next, or the embedded faces alone. */
export const useProjectLettering = (p: { lettering?: Lettering }) => useLettering(cutFaces(p.lettering));

/** The size report: for the receipt and the check report of a lettered explainer only. */
export function letteringReport(l: Lettering) {
  const faces = Object.fromEntries(
    FAMILIES.flatMap((f) => {
      const face = l.faces[f];
      if (!face) return [];
      const bytes = Buffer.from(face.woff2, 'base64');
      return [[f, { source: SOURCES[f].file, characters: face.codePoints.length, bytes: bytes.length, sha256: sha256(bytes) }]];
    }),
  );
  return {
    scripts: l.scripts,
    faces,
    // The faces as the page holds them: SFNT, base64 in its script
    pageBytes: Object.values(pageFaces(l) ?? {}).reduce((n, data) => n + data!.length, 0),
  };
}

/**
 * Work out an explainer's lettering. `draw` runs every scenario once and shapes
 * other build-time text drawn as outlines,
 * with the whole source faces in place; what each face drew, in the requested
 * scripts, is what its cut holds. Letters outside the request are left out, so
 * they still fail the build. The cuts are pinned in `<base>.lettering.json`.
 */
export async function prepareLettering(
  base: string,
  request: SubsetLetteringRequest,
  draw: () => Promise<void>,
  { write = true }: { write?: boolean } = {},
): Promise<Lettering> {
  const sources = Object.fromEntries(
    await Promise.all(FAMILIES.map(async (f) => [f, await readFile(join(ROOT, SOURCES[f].file))] as const)),
  ) as Record<FontName, Buffer>;
  await withLettering({ sans: sources.sans.toString('base64'), mono: sources.mono.toString('base64') }, async () => {
    takeLetteringUse();
    await draw();
  });
  const use = takeLetteringUse();
  const pinFile = base + '.lettering.json';
  const pinned = await readFile(pinFile, 'utf8').then(
    (t) => JSON.parse(t) as { version?: number; faces?: Record<string, { sourceHash?: string; codePoints?: string; woff2?: string }> },
    () => null,
  );
  const faces: Lettering['faces'] = {};
  const pins: Record<string, { source: string; sourceHash: string; codePoints: string; woff2: string }> = {};
  for (const family of FAMILIES) {
    const codePoints = use[family].filter((cp) => inScripts(request.scripts, cp));
    if (!codePoints.length) continue;
    const list = codePoints.map(hex).join(' '),
      sourceHash = sha256(sources[family]);
    const pin = pinned?.version === SUBSET_LETTERING_VERSION ? pinned.faces?.[family] : undefined;
    const woff2 =
      pin?.sourceHash === sourceHash && pin.codePoints === list && pin.woff2 ? pin.woff2 : await cut(family, codePoints);
    faces[family] = { codePoints, woff2 };
    pins[family] = { source: SOURCES[family].file, sourceHash, codePoints: list, woff2 };
  }
  const body = JSON.stringify({ version: SUBSET_LETTERING_VERSION, scripts: request.scripts, faces: pins }, null, 2) + '\n';
  if (write && (await readFile(pinFile, 'utf8').catch(() => null)) !== body) await writeFile(pinFile, body);
  return { scripts: request.scripts, faces };
}

/** Cut `family`'s source face to `codePoints` with fonttools' subsetter, as tools/repo/fonts.sh does. */
async function cut(family: FontName, codePoints: number[]): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-'));
  const out = join(folder, family + '.woff2');
  const tool = process.env.PYFTSUBSET || 'pyftsubset';
  try {
    await promisify(execFile)(
      tool,
      [
        join(ROOT, SOURCES[family].file),
        '--unicodes=' + codePoints.map((cp) => 'U+' + hex(cp)).join(','),
        '--layout-features=' + SOURCES[family].features,
        '--flavor=woff2',
        '--output-file=' + out,
      ],
      { env: { ...process.env, SOURCE_DATE_EPOCH: '0' } },
    );
    return (await readFile(out)).toString('base64');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(
        `meta.lettering: the lettering it asks for must be cut again, because the letters it draws changed, and that needs fonttools; pip install fonttools brotli, or set PYFTSUBSET to pyftsubset's path`,
      );
    throw error;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
