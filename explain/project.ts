// An explainer loaded from its folder for an author's tests (rayner/testing): its pinned diagram
// snapshots, and every scenario run against them, as the rayner command runs it but without
// capturing, cutting lettering or checking. The snapshot folder's format is read here once, and
// the command's tools (tools/lib/explain-project.ts) read it through readSnapshotStore too.
import type { SnapshotStore } from '../integrations/agentic-mermaid/snapshot.ts';
import type { SceneClass, SceneState } from '../src/scene.ts';
import { bindLettering, letteringOf, pinnedFor, usesOutlineLettering } from '../src/lettering-outlines.ts';
import type { StoredLetteringSnapshot } from '../src/lettering-outlines.ts';
import { withLettering } from '../src/lettering.ts';
import type { LetteringFaces } from '../src/lettering.ts';
import { traceScene } from '../src/trace.ts';
import type { Trace, TraceOf } from '../src/trace.ts';
import { withIntent } from './intent.ts';
import { bindSnapshots, checkExplainerMeta, identifierRule, isIdentifier, resolveSettings, scenariosOf, withSettings } from './settings.ts';
import type { ExplainerClass, Settings } from './settings.ts';

/**
 * One scenario of a loaded explainer: its setting values, the scene bound to them and its
 * snapshots, and its trace, whose states are typed `S` and `Sh` as Trace's are.
 */
export interface LoadedScenario<S extends object = SceneState, Sh extends object = SceneState> {
  values: Settings;
  Scene: ExplainerClass;
  trace: Trace<S, Sh>;
}
/** An explainer as `loadProject` loads it, its traces typed `S` and `Sh` as Trace's are. */
export interface LoadedProject<S extends object = SceneState, Sh extends object = SceneState> {
  /** The scene class, with the intent of the script beside it adopted. */
  Scene: ExplainerClass;
  /** The pinned diagram snapshots from `scene.snapshots/` (empty for a scene with no diagrams). */
  snapshots: SnapshotStore;
  /** Every scenario of the scene's settings, in `scenariosOf` order. */
  scenarios: LoadedScenario<S, Sh>[];
  /** The scenario these values choose, every other setting at its default, as a page link chooses one. */
  scenario(values?: Settings): LoadedScenario<S, Sh>;
}
/** The project loadProject loads for scene class `C`, typed from the `Scene<S, Sh>` it extends. */
type ProjectOf<C> = TraceOf<C> extends Trace<infer S, infer Sh> ? LoadedProject<S, Sh> : never;

/**
 * The pinned diagram snapshots of the scene at `where`: a scene file, or a folder holding
 * `scene.ts`. They are read from the `scene.snapshots/` folder beside the scene, which the rayner
 * command writes; a scene with no such folder has none. Runs under Node.
 */
export async function loadSnapshots(where: string): Promise<SnapshotStore> {
  const read = nodeReader();
  return readSnapshotStore((name) => read(`${baseOf(where)}.snapshots/${name}`));
}

/**
 * Load the explainer at `where` (a scene file, or a folder holding `scene.ts`) for a test, given
 * its scene class: refuse a `meta` key ExplainerMeta does not name, as collection does, adopt the
 * intent of the `script.md` beside it, give it its folder's name as
 * `meta.id` when it declares none, read its pinned snapshots, and
 * trace every scenario against them, as `rayner check` and `rayner describe` run it. A scene
 * with `meta.lettering` draws from the `scene.lettering.json` beside it, as its page does. A
 * diagram with no pinned snapshot fails, and so does lettering with none: run `rayner snapshots`
 * first. It captures nothing, cuts no lettering and runs none of the checks. Runs under Node.
 *
 *     import Explainer from './scene.ts';
 *     const project = await loadProject(Explainer, import.meta.dirname);
 *     for (const { values, trace } of project.scenarios) check(trace, values);
 */
export async function loadProject<C extends SceneClass>(Explainer: C, where: string): Promise<ProjectOf<C>> {
  const Scene = Explainer as ExplainerClass,
    read = nodeReader(),
    file = sceneFile(where);
  // A misspelt meta key is refused, as collection refuses it.
  try { checkExplainerMeta(Scene.meta); } catch (e) { throw new TypeError(`loadProject(): ${file}: ${(e as Error).message}`); }
  const folder = file.replace(/[^/\\]*$/, ''),
    script = await read(folder + 'script.md');
  if (script !== null) withIntent(Scene as { meta?: Record<string, unknown> }, script, folder + 'script.md');
  // Its id is sceneIdOf(file) unless it declares one, as the command has it.
  if (Scene.meta?.id === undefined) Scene.meta = { ...Scene.meta, id: sceneIdOf(file) };
  const snapshots = await readSnapshotStore((name) => read(`${baseOf(file)}.snapshots/${name}`));
  const { Lettered, faces } = await pinnedLettering(Scene, file, read);
  const scenarios: LoadedScenario[] = [];
  // Subset lettering is the fonts' (useLettering), as on the page, for the scenarios' runs only;
  // another loadProject overlapping this one waits its turn, so each traces with its own faces.
  const traceAll = async () => {
    for (const values of scenariosOf(Lettered)) {
      const Bound = withSettings(bindSnapshots(Lettered, snapshots), values);
      const trace = await traceScene(Bound);
      checkScenarioSteps(trace, values);
      scenarios.push({ values, Scene: Bound, trace });
    }
  };
  await (faces ? withLettering(faces, traceAll) : traceAll());
  const project: LoadedProject = {
    Scene: Lettered,
    snapshots,
    scenarios,
    scenario(values = {}) {
      const want = resolveSettings(Scene, values);
      const found = scenarios.find((v) => Object.keys(want).every((key) => v.values[key] === want[key]));
      if (!found) throw new RangeError(`project.scenario(): no scenario has ${JSON.stringify(want)}`);
      return found;
    },
  };
  // Each trace holds the states the scene class declares, which stateJson() validated as JSON.
  return project as ProjectOf<C>;
}

/**
 * What every scenario's steps must be, which loadProject and the rayner command both hold: at least
 * one, each named, the names unique ignoring case (a share page is a file named by its step, and
 * Push and push are one file on macOS and Windows), and each drawing a frame of its own. A step
 * that draws none rests on the step before's last frame: a link would show that picture while the
 * checks judge the next step's.
 */
export function checkScenarioSteps(trace: Pick<Trace, 'steps'>, values: Readonly<Record<string, string>>): void {
  const names = trace.steps.map((s) => s.step);
  if (!names.length || names.some((name) => !name.trim()))
    throw new Error(`this.step(): the scenario ${JSON.stringify(values)} has no step, or a step with an empty name; every scenario needs named steps`);
  const folded = names.map((name) => name.toLowerCase()), twice = names.find((_, i) => folded.indexOf(folded[i]!) !== i);
  if (twice !== undefined)
    throw new Error(`this.step(): two steps of the scenario ${JSON.stringify(values)} share the name ${JSON.stringify(twice)}, ignoring case; name each step once, so each has its own link and share page`);
  const still = trace.steps.find((s) => s.frame1 === s.frame0);
  if (still)
    throw new Error(`this.step(): step ${JSON.stringify(still.step)} of the scenario ${JSON.stringify(values)} draws no frame of its own, so it shows the step before's picture; play or wait in it, or give it a caption to hold`);
}

/**
 * A scene's id when its meta declares none: its folder's name for a file named scene.ts, else its
 * file's name without the extension. loadProject and the rayner command both name a scene by it,
 * and refuse a name that is not a page id, as they refuse such a `meta.id`.
 */
export function sceneIdOf(file: string): string {
  const parts = file.split(/[/\\]+/).filter(Boolean), name = parts.at(-1) ?? '';
  const id = name === 'scene.ts' ? parts.at(-2) ?? '' : name.replace(/\.[^.]+$/, '');
  if (!isIdentifier('id', id))
    throw new RangeError(`meta.id: the scene has none, and its ${name === 'scene.ts' ? 'folder' : 'file'} name ${JSON.stringify(id)} is not a page id; give it a meta.id, or rename it, since an id is ${identifierRule('id')}`);
  return id;
}

/**
 * The scene with the lettering pinned in the `scene.lettering.json` beside it, as its page draws
 * it: outline lettering (faces, styles, maths, or a script the subset faces lack) is bound to the
 * class from the snapshot, and subset lettering gives the faces to put in place. A scene that asks
 * for none is returned as it is. A missing or stale file throws: the rayner command writes it.
 */
async function pinnedLettering(Scene: ExplainerClass, file: string, read: (path: string) => Promise<string | null>): Promise<{ Lettered: ExplainerClass; faces?: LetteringFaces }> {
  const request = letteringOf(Scene);
  if (request === undefined) return { Lettered: Scene };
  const text = await read(`${baseOf(file)}.lettering.json`);
  if (text === null) throw new Error(`loadProject(): ${file} asks for lettering (meta.lettering) and has no scene.lettering.json beside it; run rayner snapshots ${file}`);
  const stale = () => new Error(`scene.lettering.json: it does not hold the lettering ${file} asks for; run rayner snapshots ${file}`);
  let pinned: { version?: unknown; request?: unknown; scripts?: unknown; faces?: Record<string, { woff2?: unknown }> };
  try { pinned = JSON.parse(text); } catch { throw stale(); }
  if (usesOutlineLettering(Scene)) {
    // The snapshot the page binds: a run it lacks throws when the scene draws it.
    if (!pinnedFor(pinned, request, true)) throw stale();
    return { Lettered: bindLettering(Scene, pinned as StoredLetteringSnapshot) };
  }
  if (!pinnedFor(pinned, request, false)) throw stale();
  const face = (family: 'sans' | 'mono') => {
    const woff2 = pinned.faces?.[family]?.woff2;
    return typeof woff2 === 'string' ? { [family]: woff2 } : {};
  };
  return { Lettered: Scene, faces: { ...face('sans'), ...face('mono') } };
}

/**
 * The snapshot store in a `scene.snapshots/` folder, given a reader of the folder's files by name
 * (null for a missing file). `index.json` maps each diagram key to its own file, named by a short
 * hash of the key; an entry naming any other file is skipped, so the index cannot point outside
 * the folder. A file that is not JSON throws.
 */
export async function readSnapshotStore(read: (name: string) => Promise<string | null>): Promise<SnapshotStore> {
  const json = async (name: string): Promise<unknown> => {
    const text = await read(name);
    return text === null ? null : JSON.parse(text);
  };
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const index = await json('index.json');
  const store: SnapshotStore = {};
  if (!isObject(index) || index.version !== 2) return store;
  for (const [key, name] of Object.entries(isObject(index.diagrams) ? index.diagrams : {})) {
    if (name !== (await sha256(key)).slice(0, 16) + '.json') continue;
    const snapshot = await json(name);
    // Own data properties, so a key such as `__proto__` is a key like any other.
    if (snapshot) Object.defineProperty(store, key, { value: snapshot, enumerable: true, writable: true, configurable: true });
  }
  return store;
}

const sceneFile = (where: string) => (/\.[cm]?[jt]sx?$/.test(where) ? where : where.replace(/[/\\]+$/, '') + '/scene.ts');
const baseOf = (where: string) => sceneFile(where).replace(/\.[^./\\]+$/, '');

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A reader of text files that answers null for a missing one, from Node's file system. */
function nodeReader(): (path: string) => Promise<string | null> {
  type Fs = { readFile(path: string, encoding: 'utf8'): Promise<string> };
  const node = (globalThis as { process?: { getBuiltinModule?(id: string): unknown } }).process;
  const fs = node?.getBuiltinModule?.('node:fs/promises') as Fs | undefined;
  if (!fs) throw new Error('loadProject(): it reads files from disk, as loadSnapshots() does; run it under Node');
  return (path) =>
    fs.readFile(path, 'utf8').catch((error: { code?: string }) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
}
