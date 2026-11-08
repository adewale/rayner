import { adoptScript } from './explain-intent.ts';
import type { adoptIntent } from './explain-intent.ts';
import {textContextOf} from '../../src/text-context.ts';
import { offPage, prepareLettering as prepareOutlineLettering } from './lettering.ts';
import { usesOutlineLettering, withSceneLettering } from '../../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../../src/lettering-outlines.ts';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { readFile, writeFile, mkdir, stat, readdir, rm, rename, rmdir } from 'node:fs/promises';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Scene } from '../../src/index.ts';
import { NullSink } from '../../src/output.ts';
import { diagramsMade } from '../../explain/diagrams.ts';
import { liveSteps } from '../../app/embed-live.ts';
import type { Live } from '../../app/embed-live.ts';
import { traceRun } from '../../src/trace.ts';
import type { Palette } from '../../src/color.ts';
import { paperOf, paletteOf } from '../../explain/stage.ts';
import { checkWatch } from '../../explain/trace.ts';
import { checkScenarioSteps, readSnapshotStore, sceneIdOf } from '../../explain/project.ts';
import { checkScriptMeta, checkStepMeta } from '../../explain/script.ts';
import { checkExplainerMeta } from '../../explain/settings.ts';
import { checkClaimsMeta } from '../../explain/claims.ts';
import { takeLetteringMissing } from '../../src/lettering.ts';
import type { Trace } from '../../explain/testing.ts';

import { resolveSettings } from '../../explain/index.ts';
import { scenariosOf, withSettings, bindSnapshots, scenarioName } from '../../explain/testing.ts';
import type { ExplainerClass, SnapshotStore, Settings } from '../../explain/index.ts';
import type { DiagramResolver } from '../../integrations/agentic-mermaid/snapshot.ts';
import { diagramKey, RENDERER } from '../../integrations/agentic-mermaid/snapshot.ts';
import { lostLabelWarnings } from './explain-warnings.ts';
import { letteringRequest, prepareLettering, useProjectLettering } from './explain-lettering.ts';
import type { Lettering } from './explain-lettering.ts';
import { buildInputs } from './build-inputs.ts';
import { COMPILED, LIB_ROOT, ROOT } from './roots.ts';
import { entryPoints } from './entry-points.ts';
import { listTree, relativePosix, sha256 } from './hash.ts';

export { LIB_ROOT, ROOT };
/** SHA-256, hex (tools/lib/hash.ts). */
export const hash = sha256;
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

/** src/index.ts without its optional lettering exports, so a page that asks for no lettering carries none of its code. */
const withoutOptionalLettering = (source: string) => source
  .replace("import type { LetteringRequest } from '../src/lettering-outlines.ts';\n", '')
  .replace('; lettering?: LetteringRequest', '')
  .replace(/\n\/\/ Optional lettering: tree-shaken[\s\S]*?\/\/ End optional lettering\.\n/, '');
/** Force author, helper and player imports onto one engine, including compiled-scene reuse. */
export function engineAlias(node = false, outlines = false): Plugin {
  return {
    name: 'one-rayner-engine',
    setup(b) {
      if (!outlines) b.onLoad({ filter: /[/\\]src[/\\]index\.ts$/ }, async (args) => ({
        contents: withoutOptionalLettering(await readFile(args.path, 'utf8')), loader: 'ts',
      }));
      b.onResolve({ filter: /.*/ }, (args) => {
        let file: string | undefined;
        const entry = entryPoints().get(args.path);
        if (entry) file = join(LIB_ROOT, entry + '.ts');
        else if (args.path.startsWith('.') || args.path.startsWith('/')) {
          const absolute = resolve(args.resolveDir, args.path);
          const compiled = absolute.match(/\/dist\/(src|explain|integrations\/agentic-mermaid)\/(.+)\.js$/);
          if (compiled) file = join(LIB_ROOT, compiled[1]!, compiled[2]! + '.ts');
          else
            // The player (app/) ships with the command and reaches the engine by relative paths,
            // so its imports land beside it; the engine itself is the library's.
            for (const base of new Set([LIB_ROOT, ROOT])) {
              const local = relativePosix(base, absolute);
              if (local.startsWith('src/') || local.startsWith('explain/') || local === 'integrations/agentic-mermaid/snapshot.ts') {
                file = join(LIB_ROOT, local);
                break;
              }
            }
        }
        if (file) {
          if (!node) return { path: file };
          // The checkout runs source; the installed JavaScript CLI shares the compiled runtime.
          const canonical = COMPILED
            ? join(LIB_ROOT, 'dist', relative(LIB_ROOT, file).replace(/\.ts$/, '.js'))
            : file;
          return { path: pathToFileURL(canonical).href, external: true };
        }
        return undefined;
      });
    },
  };
}
/**
 * Bundle an author's module as the tools run a scene, with the engine one shared copy, and import
 * it: its module, and the bundled code's hash with the checkout's and the author's folders left out.
 */
export async function importAuthored(file: string): Promise<{ module: Record<string, unknown>; sourceHash: string }> {
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
  // The scene's code, whatever folders the checkout and the scene are in: engine imports are
  // external, so their file URLs are the only paths in it.
  const code = result.outputFiles[0]!.text,
    sourceHash = hash(code.replaceAll(pathToFileURL(LIB_ROOT).href, '<rayner>/').replaceAll(dirname(file), '<author>'));
  const folder = join(tmpdir(), 'rayner-explain');
  await mkdir(folder, { recursive: true });
  const output = join(folder, hash(code) + '.mjs');
  // Other processes (parallel test files, two builds) import this same content-addressed file.
  // writeFile truncates before it writes, so one of them could import it half written and find
  // no Scene export. Write a private copy and rename it into place: a rename is atomic.
  const temporary = `${output}.${process.pid}.${randomUUID()}`;
  await writeFile(temporary, code);
  await rename(temporary, output);
  return { module: await import(pathToFileURL(output).href), sourceHash };
}
export async function loadScene(
  file: string,
): Promise<{ Scene: ExplainerClass; exportName: string; file: string; sourceHash: string }> {
  file = await scenePath(file);
  const { module, sourceHash } = await importAuthored(file);
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
  if (!exportName) throw new TypeError(`${file}: it must export one Scene subclass, or a Scene as its default export`);
  const Explainer = module[exportName] as ExplainerClass;
  return { Scene: Explainer, exportName, file, sourceHash };
}
export interface Project {
  Scene: ExplainerClass;
  /** The module export that is the scene ('default' or a name). */
  exportName: string;
  file: string;
  sourceHash: string;
  store: SnapshotStore;
  /** Whether a scenario made a diagram, from the store or from a snapshot of its own: the page then carries diagram code. */
  diagrams: boolean;
  /** Each scenario: its scene, trace and final stage colours (absent without a stage). */
  scenarios: { values: Settings; Scene: ExplainerClass; trace: Trace; paper?: string; palette?: Palette; live?: Map<string, Live> }[];
  edits: number;
  /** The faces cut for `static meta.lettering`; absent when the scene asks for none. */
  lettering?: Lettering;
  outlineLettering?: LetteringSnapshot;
  /** What the scene took from its script's intent header, which the page's bundle takes too. */
  intent?: ReturnType<typeof adoptIntent>;
}

/**
 * What an explainer's built files come from: the scene's code and a hash of every file in the scene's folder (its pinned snapshots, lettering and data), leaving
 * out dotfiles and names ending in `~`, which editors and file browsers leave there. demos:build
 * records it in out/explainers/<id>/inputs.json, and site:export compares it with the checkout's.
 * The shared build fingerprint covers the engine, the player, the tools, dependencies and notices.
 * Needs only `loadScene`, not a run.
 */
export async function sceneInputs(p: { file: string; sourceHash: string }, buildHash?: string): Promise<import('./explain-artifacts.ts').SceneInputs> {
  const folder = dirname(p.file),
    files: string[] = [];
  for (const entry of await listTree(folder)) {
    const path = relative(folder, join(entry.parentPath, entry.name));
    if (entry.isFile() && !path.split(sep).some((part) => part.startsWith('.')) && !entry.name.endsWith('~'))
      files.push(path + '\n' + hash(await readFile(join(folder, path))));
  }
  return { version: '3', sourceHash: p.sourceHash, files: hash(files.sort().join('\n')), buildHash: buildHash ?? (await buildInputs(ROOT)).hash };
}
/** File name for one diagram's snapshot: a short hash of its cache key. */
export const snapshotFileName = (key: string) => hash(key).slice(0, 16) + '.json';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
/**
 * Snapshots live in `scene.snapshots/`: `index.json` maps each diagram key to
 * a file, and each diagram has its own file, so changing one diagram changes
 * one file. The library reads the format (explain/project.ts); this gives it the files.
 */
export async function readSnapshots(base: string): Promise<SnapshotStore> {
  return readSnapshotStore(async (name) => {
    try {
      return await readFile(join(base + '.snapshots', name), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  });
}
/** Write the store and delete files no diagram uses. */
export async function writeSnapshots(base: string, store: SnapshotStore): Promise<void> {
  const folder = base + '.snapshots';
  const keys = Object.keys(store).sort();
  // A scene with no diagrams keeps no snapshots: its files go, and the folder once empty.
  if (!keys.length) {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => null);
    if (!entries) return;
    for (const entry of entries) if (entry.isFile()) await rm(join(folder, entry.name));
    if (!(await readdir(folder)).length) await rmdir(folder);
    return;
  }
  await mkdir(folder, { recursive: true });
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
    renderer: RENDERER,
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
  // A misspelt meta key would be ignored: refuse any key ExplainerMeta does not name, before anything runs.
  try { checkExplainerMeta(loaded.Scene.meta); } catch (e) { throw new Error(`${file}: ${(e as Error).message}`); }
  // A script with an intent header is the one home of the title, answer, questions and what the
  // model is checked against (tools/lib/explain-intent.ts): the scene reads them as its own,
  // adopted afresh on every collection, so a rebuild follows the script as it is now.
  const intent = await adoptScript(loaded.Scene as { meta?: Record<string, unknown> }, file);
  // An explainer's id is its folder's name (or its file's, for a scene not named scene.ts), unless it declares one.
  const ownMeta = (loaded.Scene as { meta?: Record<string, unknown> }).meta;
  if (ownMeta?.id === undefined)
    (loaded.Scene as { meta?: Record<string, unknown> }).meta = { ...ownMeta, id: sceneIdOf(file) };
  const outlineRequested = usesOutlineLettering(loaded.Scene);
  const outline = outlineRequested
    ? await prepareOutlineLettering(loaded.Scene, file, captureLettering, write) : undefined;
  const Source = outline?.Scene ?? loaded.Scene;
  const request = outlineRequested ? undefined : letteringRequest(Source);
  const subsetMetrics = request ? hash(JSON.stringify([request, ...(await Promise.all(
    ['inter.woff2', 'jetbrains-mono.woff2'].map(async (name) =>
      [name, hash(await readFile(join(ROOT, 'vendor/lettering', name)))]),
  ))])) : undefined;
  const base = file.replace(/\.[^.]+$/, '');
  const previous: SnapshotStore = refresh ? {} : await readSnapshots(base);
  // Lazy: native scenes never require Agentic Mermaid or Chromium.
  const builders = diagramBuilders<Awaited<ReturnType<typeof import('../../integrations/agentic-mermaid/build/index.ts').snapshotBuilder>>>();
  const store: SnapshotStore = {};
  const diagramsBefore = diagramsMade();
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
        shaping: textContextOf(Source),
        ...(outline ? { measurementHash: outline.measurementHash } : subsetMetrics ? { measurementHash: subsetMetrics } : {}),
        styles: outline?.snapshot.request.styles,
      } : undefined;
      if (previous[key] && metricOptions) {
          const { naturalMeasurementIdentity } = await import('../../integrations/agentic-mermaid/build/index.ts');
          if (previous[key].textMeasurement?.id !== naturalMeasurementIdentity(metricOptions).id) {
            if (captureLettering) delete previous[key];
            else throw new Error(`scene.snapshots: the natural diagram font metrics are stale; run rayner snapshots ${file}`);
          }
      }
      if (previous[key]) {
        store[key] = previous[key];
        return inspect(previous[key]);
      }
      const active = await builders.get(spec.lettering === 'natural', async () => {
        const { snapshotBuilder } = await import('../../integrations/agentic-mermaid/build/index.ts');
        return snapshotBuilder(previous, metricOptions);
      });
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
  const scenarios: Project['scenarios'] = [];
  const undrawable: string[] = [];
  let lettering: Lettering | undefined;
  try {
    // Only a scene that asks for lettering runs this: once per scenario with the whole
    // source faces, to learn which letters to cut them to (explain-lettering.ts).
    if (request) {
      lettering = await prepareLettering(
        base,
        request,
        async () => {
          const counted = edits;
          for (const values of scenariosOf(Source)) {
            await new (withSettings(bindSnapshots(Source, resolver), values))(new NullSink(), {
              skipUntil: Infinity,
            }).run();
          }
          edits = counted;
          takeLetteringMissing();
        },
        { write },
      );
      // Diagrams captured on that run are pinned for this one
      for (const key of Object.keys(store))
        Object.defineProperty(previous, key, { value: store[key], enumerable: true, writable: true, configurable: true });
    }
    await useProjectLettering({ lettering });
    for (const values of scenariosOf(Source)) {
      const collect = new (withSettings(bindSnapshots(Source, resolver), values))(new NullSink(), { skipUntil: Infinity });
      // Text the embedded fonts cannot draw shows as nothing: name it by scenario and step, then fail.
      let step = '(before the first step)';
      const blanks = () => {
        for (const [text, chars] of takeLetteringMissing())
          undrawable.push(
            `${scenarioName(Source, values) || 'The scene'}, step ${step}: "${text}" has ${[...chars].map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}`,
          );
      };
      takeLetteringMissing();
      collect.onStep((s) => {
        blanks();
        step = s.name;
      });
      await collect.run();
      blanks();
      const Bound = withSettings(bindSnapshots(Source, store), values);
      const { trace, scene: ran } = await traceRun(Bound),
        paper = paperOf(ran);
      checkScenarioSteps(trace, values);
      // The page never draws these (offPage): they stay out of what it carries
      if (outline) await withSceneLettering(Bound, () => offPage(async () => {
        const { Text } = await import('../../src/index.ts');
        for (const [i, s] of trace.steps.entries()) {
          step = s.step;
          // Contact sheets draw this numbered title outside the authored scene.
          new Text(`${i + 1}. ${String(s.meta.title ?? s.step)}`, {shaping: textContextOf(Bound)});
        }
      }));
      // The steps a reader can drive a machine at (app/embed-live.ts): the page's transcript lists their events.
      const live = liveSteps(ran);
      scenarios.push({ values, Scene: Bound, trace, palette: paletteOf(ran), ...(paper ? { paper } : {}), ...(live.size ? { live } : {}) });
    }
    if (undrawable.length)
      throw new Error(`new Text(): the embedded fonts cannot draw these characters; ask for their script in meta.lettering, or write others:\n${[...new Set(undrawable)].join('\n')}`);
    // Every step's title, line and kind must be ones the page can read.
    checkStepMeta(scenarios.flatMap((v) => v.trace.steps));
    // The state readers follow must be state the scene keeps, in some step of some scenario.
    checkWatch(Source.meta?.watch, scenarios.flatMap((v) => v.trace.steps));
    // The script's answer and reader questions must be usable before any scenario is checked against them.
    checkScriptMeta(Source.meta);
    checkClaimsMeta(Source.meta);
    await outline?.finish();
    if (write) await writeSnapshots(base, store);
    return { ...loaded, Scene: Source, store, diagrams: diagramsMade() > diagramsBefore, scenarios, edits, ...(lettering ? { lettering } : {}), ...(outline ? { outlineLettering: outline.snapshot } : {}), ...(intent ? { intent } : {}) };
  } finally {
    await builders.close();
  }
}
/**
 * A project's two diagram builders (natural lettering or not), each started once, on the first
 * resolution that needs it: a second resolution in flight waits for the same start instead of
 * launching another browser. `close()` closes every builder that started, after waiting for any
 * still starting.
 */
export function diagramBuilders<B extends { close(): Promise<void> }>() {
  const started = new Map<boolean, Promise<B>>();
  return {
    get(natural: boolean, start: () => Promise<B>): Promise<B> {
      let builder = started.get(natural);
      if (!builder) started.set(natural, (builder = start()));
      return builder;
    },
    async close(): Promise<void> {
      // A builder that failed to start has nothing to close; its failure is the resolution's to report.
      await Promise.all([...started.values()].map((builder) => builder.then((b) => b.close(), () => undefined)));
    },
  };
}
/** The default scenario, or the scenario these values choose with every other setting at its default, as a URL does. */
export function defaultScenario(project: Project, values: Settings = {}) {
  const want = resolveSettings(project.Scene, values);
  return project.scenarios.find((v) => Object.keys(want).every((key) => v.values[key] === want[key]))!;
}
export const sceneSlug = (p: Project) => p.Scene.meta?.id ?? sceneIdOf(p.file);
/** The fields every page receipt carries: what was built, from which sources. */
export const baseReceipt = (p: Project) => ({
  version: 1,
  scene: sceneSlug(p),
  sourceHash: p.sourceHash,
  engine: 'lantern@2c7bad5+explainer',
  agenticMermaid: RENDERER.split('@')[1],
  snapshotHashes: Object.values(p.store).map((s) => hash(JSON.stringify(s))),
  ...(p.outlineLettering ? { letteringHash: hash(JSON.stringify(p.outlineLettering)) } : {}),
});
