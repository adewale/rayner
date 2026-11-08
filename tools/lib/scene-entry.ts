// The entry module that runs a project's scene outside Node: the page's player
// (explain-build.ts) and the bare runtime `rayner check` runs in a VM with no DOM
// (explain-check.ts). Both start from one source, so the bare runtime checks the
// scene the page ships: the same class, intent, lettering and snapshots.
import { join } from 'node:path';
import type { Project } from './explain-project.ts';
import type { Settings } from '../../explain/settings.ts';
import type { LetteringSnapshot, PackedLetteringSnapshot } from '../../src/lettering-outlines.ts';
import type { SnapshotStore } from '../../integrations/agentic-mermaid/snapshot.ts';
import { pageSnapshot } from './lettering.ts';
import { pageFaces } from './explain-lettering.ts';
import { pageSnapshots } from './page-snapshots.ts';
import { LIB_ROOT, ROOT } from './roots.ts';

/** The player's page: mounts the scene on #content, then marks it ready. */
export interface PageEntry {
  target: 'page';
  /** An expression for the diagram snapshots mountEmbed takes, and the imports it needs. */
  snapshots: string;
  imports: string;
  /** Whether the page mounts the audio player. */
  audio: boolean;
  /** What the page says when mounting fails, in its language. */
  failed: string;
}
/** The bare runtime: exports run(), which plays one scenario to its end and returns its steps, state and last frame. */
export interface BareEntry {
  target: 'bare';
  values: Settings;
}

const shippedLettering = new WeakMap<LetteringSnapshot, Promise<PackedLetteringSnapshot>>();
const shippedSnapshots = new WeakMap<SnapshotStore, SnapshotStore>();
/** The diagram snapshots a page ships (pageSnapshots), computed once per store. */
export function shippedStore(store: SnapshotStore): SnapshotStore {
  let out = shippedSnapshots.get(store);
  if (!out) shippedSnapshots.set(store, (out = pageSnapshots(store)));
  return out;
}

/** The outline lettering a page ships (pageSnapshot), computed once per snapshot. */
function shippedOutlines(project: Project): Promise<PackedLetteringSnapshot> | undefined {
  if (!project.outlineLettering) return undefined;
  let outline = shippedLettering.get(project.outlineLettering);
  if (!outline) shippedLettering.set(project.outlineLettering, (outline = pageSnapshot(project.outlineLettering)));
  return outline;
}
/**
 * The entry for `target`. The author's class takes the script's intent first, as the tools
 * adopted it (collectProject ran adoptIntent, which checks that the scene does not declare
 * the same parts, and kept its result as project.intent: the entry applies that result, so
 * a page never carries explain/intent.ts), then its outline lettering is bound, and a
 * subset-lettered scene puts its faces in place before anything shapes text.
 */
export async function sceneEntry(project: Project, entry: PageEntry | BareEntry): Promise<string> {
  const lib = (path: string) => JSON.stringify(join(LIB_ROOT, path));
  const outline = shippedOutlines(project);
  const author = entry.target === 'page'
    ? `import Original from 'virtual:author';`
    : `import * as authored from ${JSON.stringify(project.file)};const Original=authored[${JSON.stringify(project.exportName)}];`;
  const adopted = project.intent ? `Original.meta={...Original.meta,...${JSON.stringify(project.intent)}};` : '';
  const bound = outline
    ? `import{bindLettering}from ${lib('src/lettering-outlines.ts')};const Source=bindLettering(Original,${JSON.stringify(await outline)});`
    : 'const Source=Original;';
  const [letteringImport, ready] = project.lettering
    ? [`import{useLettering}from ${lib('src/lettering.ts')};`, `await useLettering(${JSON.stringify(pageFaces(project.lettering))});`]
    : ['', ''];
  const source = author + letteringImport + adopted + bound;
  if (entry.target === 'page')
    return `${source}import{mountEmbed}from ${JSON.stringify(join(ROOT, 'app/embed.ts'))};${entry.imports}const root=document.getElementById('content');(async()=>{${ready}await mountEmbed(root,Source,${entry.snapshots}${entry.audio ? ',mountAudio' : ''});root.dataset.ready='true'})().catch(error=>{console.error(error);const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=${JSON.stringify(entry.failed)};root.append(p)});`;
  return `${source}import{bindSnapshots,withSettings}from ${lib('explain/settings.ts')};import{NullSink,toSvgString}from ${lib('src/output.ts')};export async function run(){${ready}const C=withSettings(bindSnapshots(Source,${JSON.stringify(shippedStore(project.store))}),${JSON.stringify(entry.values)});const s=await new C(new NullSink(),{skipUntil:Infinity}).run();return{steps:s.steps.map(s=>s.name),state:s.stateJson(),svg:toSvgString(s)}}`;
}
