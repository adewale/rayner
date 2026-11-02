import { offPage, prepareLettering as prepareOutlineLettering } from './lettering.ts';
import { bindLettering, usesOutlineLettering, withSceneLettering } from '../../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../../src/lettering-outlines.ts';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { readFile, writeFile, mkdir, stat, readdir, rm, rename } from 'node:fs/promises';
import { dirname, resolve, join, basename, relative, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { Scene, NullSink } from '../../src/index.ts';
import { traceRun } from '../../src/trace.ts';
import type { Palette } from '../../integrations/agentic-mermaid/snapshot.ts';
import { paperOf, paletteOf } from '../../explain/stage.ts';
import { checkWatch } from '../../explain/trace.ts';
import { checkScriptMeta } from '../../explain/script.ts';
import { takeMissingGlyphs } from '../../src/lettering.ts';
import type { Trace } from '../../src/index.ts';

// Outline lettering leases every scene run once it is installed, and swaps the shared font shapers
// while a lettered scene holds its lease. A run that began before installation is not leased, so
// its text could be shaped by a lettered scene's outlines ("Lettering snapshot has no run for …").
// The tools run many projects in one process, so they install lettering before any scene runs, by
// binding a class that never runs. Every catalog build reached this state anyway once its first
// lettered project was collected; now it holds from the start, whatever the order.
bindLettering(class LetteringInstalled extends Scene {}, {
  shape: (_font, text, size, fallback) => fallback(text, size),
  math: () => { throw new Error('LetteringInstalled never runs'); },
});
import { variantsOf, withSettings, bindSnapshots, caseName, resolveSettings } from '../../explain/index.ts';
import type { ExplainerClass, SnapshotStore, Settings } from '../../explain/index.ts';
import type { DiagramResolver } from '../../integrations/agentic-mermaid/snapshot.ts';
import { diagramKey, RENDERER } from '../../integrations/agentic-mermaid/snapshot.ts';
import { lostLabelWarnings } from './explain-warnings.ts';
import { letteringRequest, prepareLettering, useProjectLettering } from './explain-lettering.ts';
import type { Lettering } from './explain-lettering.ts';
import { buildInputs } from './build-inputs.ts';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
/**
 * Make bundled JavaScript safe inside an inline <script>. The HTML parser only
 * reacts to `</script` and `<!--`, so only those change. Escaping every `</`
 * broke code such as the regex `/</g`, which became `/<\/g`. `<!--` becomes
 * `<\x21--`, an escape that strings, templates and regexes (with or without
 * the `u` and `v` flags) all read as `!`; `<\!--` is a SyntaxError in `/…/u`.
 */
export const scriptEscape = (value: string) =>
  value
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\x21--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
async function scenePath(input: string): Promise<string> {
  let file = resolve(input);
  if ((await stat(file)).isDirectory()) file = join(file, 'scene.ts');
  return file;
}

/** Force author, helper and player imports onto one engine, including compiled-scene reuse. */
const legacySource = (source: string) => source
  .replace("import type { LetteringRequest } from '../src/lettering-outlines.ts';\n", '')
  .replace('; lettering?: LetteringRequest', '')
  .replace(/\n\/\/ Optional lettering: tree-shaken[\s\S]*?\/\/ End optional lettering\.\n/, '');
export function engineAlias(node = false, outlines = false): Plugin {
  return {
    name: 'one-rayner-engine',
    setup(b) {
      if (!outlines) b.onLoad({ filter: /[/\\]src[/\\]index\.ts$/ }, async (args) => ({
        contents: legacySource(await readFile(args.path, 'utf8')), loader: 'ts',
      }));
      b.onResolve({ filter: /.*/ }, (args) => {
        let file: string | undefined;
        if (args.path === 'rayner') file = join(ROOT, 'src/index.ts');
        else if (args.path === 'rayner/explain') file = join(ROOT, 'explain/index.ts');
        else if (args.path === 'rayner/lettering') file = join(ROOT, 'src/lettering.ts');
        else if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const absolute = resolve(args.resolveDir, args.path);
          const compiled = absolute.match(/\/dist\/(src|explain|integrations\/agentic-mermaid)\/(.+)\.js$/);
          if (compiled) file = join(ROOT, compiled[1]!, compiled[2]! + '.ts');
          else if (
            absolute.startsWith(join(ROOT, 'src') + '/') ||
            absolute.startsWith(join(ROOT, 'explain') + '/') ||
            absolute === join(ROOT, 'integrations/agentic-mermaid/snapshot.ts')
          )
            file = absolute;
        }
        if (file) {
          if (!node) return { path: file };
          // The checkout runs source; the installed JavaScript CLI shares the compiled runtime.
          const canonical = import.meta.url.endsWith('.js')
            ? join(ROOT, 'dist', relative(ROOT, file).replace(/\.ts$/, '.js'))
            : file;
          return { path: pathToFileURL(canonical).href, external: true };
        }
        return undefined;
      });
    },
  };
}
/**
 * The engine's fingerprint. src/lettering.ts counts only for an explainer that asks
 * for lettering: no other page carries it, and leaving it out keeps every other
 * explainer's receipts as they were.
 */
async function engineHash(lettered: boolean): Promise<string> {
  const inputs: string[] = [];
  for (const folder of ['src', 'explain', 'integrations/agentic-mermaid'])
    for (const name of (await readdir(join(ROOT, folder)))
      .filter((n) => n.endsWith('.ts') && !['lettering-outlines.ts', 'math.ts', 'italic.ts'].includes(n) && (lettered || folder + '/' + n !== 'src/lettering.ts'))
      .sort())
      inputs.push(folder + '/' + name + '\n' + legacySource(await readFile(join(ROOT, folder, name), 'utf8')));
  inputs.push(await readFile(join(ROOT, 'vendor/glyph.js'), 'utf8'));
  return hash(inputs.join('\n'));
}
export async function loadScene(
  file: string,
): Promise<{ Scene: ExplainerClass; exportName: string; file: string; sourceHash: string; engineHash: string }> {
  file = await scenePath(file);
  const result = await build({
    entryPoints: [file],
    absWorkingDir: dirname(file),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    plugins: [engineAlias(true)],
    logLevel: 'silent',
  });
  // 'lantern:/' is an internal placeholder for the checkout path, kept from Lantern:
  // it never reaches output, and renaming it would make every committed snapshot stale.
  const code = result.outputFiles[0]!.text,
    sourceHash = hash(
      code.replaceAll(pathToFileURL(ROOT).href, 'lantern:/').replaceAll(dirname(file), '<author>'),
    );
  const folder = join(tmpdir(), 'rayner-explain');
  await mkdir(folder, { recursive: true });
  const output = join(folder, hash(code) + '.mjs');
  // Other processes (parallel test files, two builds) import this same content-addressed file.
  // writeFile truncates before it writes, so one of them could import it half written and find
  // no Scene export. Write a private copy and rename it into place: a rename is atomic.
  const temporary = `${output}.${process.pid}.${randomUUID()}`;
  await writeFile(temporary, code);
  await rename(temporary, output);
  const module = await import(pathToFileURL(output).href);
  const choices = Object.values(module).filter(
    (value): value is ExplainerClass => typeof value === 'function' && value.prototype instanceof Scene,
  );
  // The one rule for which export is the scene; check and build import exactly this name.
  const exportName =
    typeof module.default === 'function' && module.default.prototype instanceof Scene
      ? 'default'
      : choices.length === 1
        ? Object.keys(module).find((k) => module[k] === choices[0])!
        : null;
  if (!exportName) throw new Error('Export one Scene subclass (or a default Scene export)');
  const Explainer = module[exportName] as ExplainerClass;
  const outlines = usesOutlineLettering(Explainer);
  // A captured run must survive installing the package: the same engine imports
  // resolve to src/*.ts in a checkout and dist/src/*.js in the compiled CLI.
  // Preserve the historical fingerprint exactly for every existing plain scene.
  const portableSourceHash = outlines ? hash(
    code.replaceAll(pathToFileURL(ROOT).href, 'lantern:/').replaceAll(dirname(file), '<author>')
      .replace(/lantern:\/dist\/(src|explain|integrations)\//g, 'lantern:/$1/')
      .replace(/(lantern:\/(?:src|explain|integrations)\/[^"'\n]+)\.js(?=["'])/g, '$1.ts'),
  ) : sourceHash;
  return { Scene: Explainer, exportName, file, sourceHash: portableSourceHash, engineHash: await engineHash(outlines || letteringRequest(Explainer) !== undefined) };
}
export interface Project {
  Scene: ExplainerClass;
  /** The module export that is the scene ('default' or a name). */
  exportName: string;
  file: string;
  sourceHash: string;
  engineHash: string;
  store: SnapshotStore;
  /** Each case: its scene, trace and final stage colours (absent without a stage). */
  variants: { values: Settings; Scene: ExplainerClass; trace: Trace; paper?: string; palette?: Palette }[];
  edits: number;
  /** The faces cut for `static meta.lettering`; absent when the scene asks for none. */
  lettering?: Lettering;
  outlineLettering?: LetteringSnapshot;
}

/**
 * The capture code's fingerprint. Snapshots record it, so changing how diagrams
 * are captured or lowered (integrations/agentic-mermaid/build/) invalidates
 * every cached snapshot instead of silently serving old ones.
 */
export const IMPORTER = await (async () => {
  const dir = join(ROOT, 'integrations/agentic-mermaid/build');
  const files = (await readdir(dir)).filter((n) => n.endsWith('.ts')).sort();
  return hash((await Promise.all(files.map(async (n) => n + '\n' + (await readFile(join(dir, n), 'utf8'))))).join('\n')).slice(0, 16);
})();
/**
 * What an explainer's built files come from: the scene's code, the engine, the snapshot importer,
 * and a hash of every file in the scene's folder (its pinned snapshots, lettering and data), leaving
 * out dotfiles and names ending in `~`, which editors and file browsers leave there. demos:build
 * records it in out/explainers/<id>/inputs.json, and site:export compares it with the checkout's.
 * The shared build fingerprint also covers player, tools, dependencies and notices.
 * Needs only `loadScene`, not a run.
 */
export async function sceneInputs(p: { file: string; sourceHash: string; engineHash: string }): Promise<Record<string, string>> {
  const folder = dirname(p.file),
    files: string[] = [];
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    const path = relative(folder, join(entry.parentPath, entry.name));
    if (entry.isFile() && !path.split(sep).some((part) => part.startsWith('.')) && !entry.name.endsWith('~'))
      files.push(path + '\n' + hash(await readFile(join(folder, path))));
  }
  return { version: '2', sourceHash: p.sourceHash, engineHash: p.engineHash, importer: IMPORTER, files: hash(files.sort().join('\n')), buildHash: (await buildInputs(ROOT)).hash };
}
/** File name for one diagram's snapshot: a short hash of its cache key. */
export const snapshotFileName = (key: string) => hash(key).slice(0, 16) + '.json';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
/**
 * Snapshots live in `scene.snapshots/`: `index.json` maps each diagram key to
 * a file, and each diagram has its own file, so changing one diagram changes
 * one file.
 */
export async function readSnapshots(base: string): Promise<SnapshotStore> {
  const index = await readJson(join(base + '.snapshots', 'index.json'));
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const store: SnapshotStore = {};
  // Own data properties, so a key such as `__proto__` is a key like any other.
  const put = (key: string, value: unknown) =>
    Object.defineProperty(store, key, { value, enumerable: true, writable: true, configurable: true });
  if (index?.version === 2 && index.importer === IMPORTER) {
    for (const [key, name] of Object.entries(isObject(index.diagrams) ? index.diagrams : {})) {
      // Only the file this key's name hashes to: an index entry cannot point outside the folder.
      if (name !== snapshotFileName(key)) continue;
      const snapshot = await readJson(join(base + '.snapshots', name));
      if (snapshot) put(key, snapshot);
    }
  }
  return store;
}
/** Write the store and delete files no diagram uses. */
export async function writeSnapshots(base: string, store: SnapshotStore, sourceHash: string): Promise<void> {
  const folder = base + '.snapshots';
  await mkdir(folder, { recursive: true });
  const keys = Object.keys(store).sort();
  const names = Object.fromEntries(keys.map((key) => [key, snapshotFileName(key)]));
  for (const key of keys) {
    const path = join(folder, names[key]!),
      body = json(store[key]);
    if ((await readFile(path, 'utf8').catch(() => null)) !== body) await writeFile(path, body);
  }
  const keep = new Set([...Object.values(names), 'index.json']);
  // Files only: a folder someone put here is theirs, not a stale snapshot.
  for (const entry of await readdir(folder, { withFileTypes: true }))
    if (entry.isFile() && !keep.has(entry.name)) await rm(join(folder, entry.name));
  const index = json({
    version: 2,
    importer: IMPORTER,
    renderer: RENDERER,
    sourceHash,
    diagrams: names,
  });
  if ((await readFile(join(folder, 'index.json'), 'utf8').catch(() => null)) !== index)
    await writeFile(join(folder, 'index.json'), index);
}
export async function collectProject(
  input: string,
  { refresh = false, write = true, captureLettering = refresh }: { refresh?: boolean; write?: boolean; captureLettering?: boolean } = {},
): Promise<Project> {
  const loaded = await loadScene(input);
  const { file } = loaded;
  const outlineRequested = usesOutlineLettering(loaded.Scene);
  const outline = outlineRequested
    ? await prepareOutlineLettering(loaded.Scene, file, loaded.sourceHash, captureLettering, write) : undefined;
  const Source = outline?.Scene ?? loaded.Scene;
  const request = outlineRequested ? undefined : letteringRequest(Source);
  const subsetMetrics = request ? hash(JSON.stringify([request, ...(await Promise.all(
    ['inter.woff2', 'jetbrains-mono.woff2'].map(async (name) =>
      [name, hash(await readFile(join(ROOT, 'vendor/lettering', name)))]),
  ))])) : undefined;
  const base = file.replace(/\.[^.]+$/, '');
  const previous: SnapshotStore = refresh ? {} : await readSnapshots(base);
  // Lazy: native scenes never require Agentic Mermaid or Chromium.
  let builder:
    | Awaited<ReturnType<typeof import('../../integrations/agentic-mermaid/build/index.ts').snapshotBuilder>>
    | undefined;
  let naturalBuilder: typeof builder;
  const store: SnapshotStore = {};
  let edits = 0;
  const warned = new Set<string>();
  const inspect = (snapshot: SnapshotStore[string]) => {
    const key = diagramKey(snapshot.spec);
    if (!warned.has(key)) {
      warned.add(key);
      for (const warning of lostLabelWarnings(snapshot)) console.warn('rayner: ' + warning);
    }
    return snapshot;
  };
  const resolver: DiagramResolver = {
    async diagram(spec) {
      const key = diagramKey(spec);
      const metricOptions = spec.lettering === 'natural' ? {
        ...(outline ? { measurementHash: outline.measurementHash } : subsetMetrics ? { measurementHash: subsetMetrics } : {}),
        styles: outline?.snapshot.request.styles,
      } : undefined;
      if (previous[key] && metricOptions) {
          const { naturalMeasurementIdentity } = await import('../../integrations/agentic-mermaid/build/index.ts');
          if (previous[key].textMeasurement?.id !== naturalMeasurementIdentity(metricOptions).id) {
            if (captureLettering) delete previous[key];
            else throw new Error('Stale natural diagram font metrics; run rayner snapshots ' + file);
          }
      }
      if (previous[key]) {
        store[key] = previous[key];
        return inspect(previous[key]);
      }
      let active = spec.lettering === 'natural' ? naturalBuilder : builder;
      if (!active) {
        const { snapshotBuilder } = await import('../../integrations/agentic-mermaid/build/index.ts');
        active = await snapshotBuilder(previous, metricOptions);
        if (spec.lettering === 'natural') naturalBuilder = active;
        else builder = active;
      }
      const result = await active.diagram(spec);
      store[key] = result;
      return inspect(result);
    },
    async morph(before, after, ops) {
      const { replayMorphExplained } = await import('./explain-morph.ts');
      replayMorphExplained(before, after, ops);
      edits++;
    },
  };
  const variants: Project['variants'] = [];
  const undrawable: string[] = [];
  let lettering: Lettering | undefined;
  try {
    // Only a scene that asks for lettering runs this: once per case with the whole
    // source faces, to learn which letters to cut them to (explain-lettering.ts).
    if (request) {
      lettering = await prepareLettering(
        base,
        request,
        async () => {
          const counted = edits;
          for (const values of variantsOf(Source)) {
            const scene = await new (withSettings(bindSnapshots(Source, resolver), values))(new NullSink(), {
              skipUntil: Infinity,
            }).run();
          }
          edits = counted;
          takeMissingGlyphs();
        },
        { write },
      );
      // Diagrams captured on that run are pinned for this one
      for (const key of Object.keys(store))
        Object.defineProperty(previous, key, { value: store[key], enumerable: true, writable: true, configurable: true });
    }
    await useProjectLettering({ lettering });
    for (const values of variantsOf(Source)) {
      const collect = new (withSettings(bindSnapshots(Source, resolver), values))(new NullSink(), { skipUntil: Infinity });
      // Text the embedded fonts cannot draw shows as nothing: name it by case and step, then fail.
      let step = '(before the first step)';
      const blanks = () => {
        for (const [text, chars] of takeMissingGlyphs())
          undrawable.push(
            `${caseName(Source, values) || 'The scene'}, step ${step}: "${text}" has ${[...chars].map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}`,
          );
      };
      takeMissingGlyphs();
      collect.onStep((s) => {
        blanks();
        step = s.name;
      });
      await collect.run();
      blanks();
      const Bound = withSettings(bindSnapshots(Source, store), values);
      const { trace, scene: ran } = await traceRun(Bound),
        paper = paperOf(ran),
        names = trace.steps.map((s) => s.step);
      if (!names.length || names.some((name) => !name.trim()))
        throw new Error(`Each case needs non-empty named steps: ${JSON.stringify(values)}`);
      if (new Set(names).size !== names.length)
        throw new Error(`Duplicate step names prevent stable links: ${JSON.stringify(values)}`);
      // The page never draws these (offPage): they stay out of what it carries
      if (outline) await withSceneLettering(Bound, () => offPage(async () => {
        const { Text } = await import('../../src/index.ts');
        for (const [i, s] of trace.steps.entries()) {
          step = s.step;
          // Contact sheets draw this numbered title outside the authored scene.
          new Text(`${i + 1}. ${String(s.meta.title ?? s.step)}`);

        }
      }));
      variants.push({ values, Scene: Bound, trace, palette: paletteOf(ran), ...(paper ? { paper } : {}) });
    }
    if (undrawable.length)
      throw new Error(`The embedded fonts cannot draw these characters:\n${[...new Set(undrawable)].join('\n')}`);
    // The state readers follow must be state the scene keeps, in some step of some case.
    checkWatch(Source.meta?.watch, variants.flatMap((v) => v.trace.steps));
    // The script's answer and check questions must be usable before any case is checked against them.
    checkScriptMeta(Source.meta);
    await outline?.finish();
    if (write) await writeSnapshots(base, store, loaded.sourceHash);
    return { ...loaded, Scene: Source, store, variants, edits, ...(lettering ? { lettering } : {}), ...(outline ? { outlineLettering: outline.snapshot } : {}) };
  } finally {
    await builder?.close();
    await naturalBuilder?.close();
  }
}
/** The default case, or the case these values choose with every other setting at its default, as a URL does. */
export function defaultVariant(project: Project, values: Settings = {}) {
  const want = resolveSettings(project.Scene, values);
  return project.variants.find((v) => Object.keys(want).every((key) => v.values[key] === want[key]))!;
}
export const sceneSlug = (p: Project) => p.Scene.meta?.id ?? basename(p.file).replace(/\.[^.]+$/, '');
/** The fields every page receipt carries: what was built, from which sources. */
export const baseReceipt = (p: Project) => ({
  version: 1,
  scene: sceneSlug(p),
  sourceHash: p.sourceHash,
  engineHash: p.engineHash,
  engine: 'lantern@2c7bad5+explainer',
  agenticMermaid: RENDERER.split('@')[1],
  snapshotHashes: Object.values(p.store).map((s) => hash(JSON.stringify(s))),
  ...(p.outlineLettering ? { letteringHash: hash(JSON.stringify(p.outlineLettering)) } : {}),
});
