// An explainer loaded from its folder for an author's tests (rayner/testing): its pinned diagram
// snapshots, and every scenario run against them, as the rayner command runs it but without
// capturing, cutting lettering or checking. The snapshot folder's format is read here once, and
// the command's tools (tools/lib/explain-project.ts) read it through readSnapshotStore too.
import type { SnapshotStore } from '../integrations/agentic-mermaid/snapshot.ts';
import type { SceneClass } from '../src/scene.ts';
import { traceScene } from '../src/trace.ts';
import type { Trace } from '../src/trace.ts';
import { withIntent } from './intent.ts';
import { bindSnapshots, resolveSettings, scenariosOf, withSettings } from './settings.ts';
import type { ExplainerClass, Settings } from './settings.ts';

/** One scenario of a loaded explainer: its setting values, the scene bound to them and its snapshots, and its trace. */
export interface LoadedScenario {
  values: Settings;
  Scene: ExplainerClass;
  trace: Trace;
}
/** An explainer as `loadProject` loads it. */
export interface LoadedProject {
  /** The scene class, with the intent of the script beside it adopted. */
  Scene: ExplainerClass;
  /** The pinned diagram snapshots from `scene.snapshots/` (empty for a scene with no diagrams). */
  snapshots: SnapshotStore;
  /** Every scenario of the scene's settings, in `scenariosOf` order. */
  scenarios: LoadedScenario[];
  /** The scenario these values choose, every other setting at its default, as a page link chooses one. */
  scenario(values?: Settings): LoadedScenario;
}

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
 * its scene class: adopt the intent of the `script.md` beside it, give it its folder's name as
 * `meta.id` when it declares none, read its pinned snapshots, and
 * trace every scenario against them, as `rayner check` and `rayner describe` run it. A diagram
 * with no pinned snapshot fails: run `rayner snapshots` first. It captures nothing, cuts no
 * lettering (a scene with `meta.lettering` is loaded by the command, not here) and runs none of
 * the checks. Runs under Node.
 *
 *     import Explainer from './scene.ts';
 *     const project = await loadProject(Explainer, import.meta.dirname);
 *     for (const { values, trace } of project.scenarios) check(trace, values);
 */
export async function loadProject(Explainer: SceneClass, where: string): Promise<LoadedProject> {
  const Scene = Explainer as ExplainerClass,
    read = nodeReader(),
    file = sceneFile(where);
  if (Scene.meta?.lettering !== undefined)
    throw new Error(`${file}: the scene asks for lettering (meta.lettering), which the rayner command cuts; loadProject runs scenes in the embedded fonts only`);
  const folder = file.replace(/[^/\\]*$/, ''),
    script = await read(folder + 'script.md');
  if (script !== null) withIntent(Scene as { meta?: Record<string, unknown> }, script, folder + 'script.md');
  // Its id is its folder's name (or its file's, for a scene not named scene.ts) unless it declares one, as the command has it.
  const fileName = file.slice(folder.length),
    id = fileName === 'scene.ts' ? folder.replace(/[/\\]+$/, '').replace(/^.*[/\\]/, '') : fileName.replace(/\.[^.]+$/, '');
  if (Scene.meta?.id === undefined && id) Scene.meta = { ...Scene.meta, id };
  const snapshots = await readSnapshotStore((name) => read(`${baseOf(file)}.snapshots/${name}`));
  const scenarios: LoadedScenario[] = [];
  for (const values of scenariosOf(Scene)) {
    const Bound = withSettings(bindSnapshots(Scene, snapshots), values);
    scenarios.push({ values, Scene: Bound, trace: await traceScene(Bound) });
  }
  return {
    Scene,
    snapshots,
    scenarios,
    scenario(values = {}) {
      const want = resolveSettings(Scene, values);
      const found = scenarios.find((v) => Object.keys(want).every((key) => v.values[key] === want[key]));
      if (!found) throw new Error(`No scenario has ${JSON.stringify(want)}`);
      return found;
    },
  };
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
  if (!fs) throw new Error('loadProject and loadSnapshots read files from disk: run them under Node');
  return (path) =>
    fs.readFile(path, 'utf8').catch((error: { code?: string }) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
}
