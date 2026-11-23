import { mkdir, mkdtemp, writeFile, readFile, rename, rm, rmdir, readdir, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { toSvgString } from '../../src/index.ts';
import type { Scene, Sink } from '../../src/index.ts';
import { logStart, runLive, withoutHeading, htmlEscape } from '../../explain/internal.ts';
import { rasterize } from './explain-raster.ts';
import { useProjectLettering } from './explain-lettering.ts';
import type { Project } from './explain-project.ts';
import { pictureInventory, picturePath } from './explain-picture-inventory.ts';

interface FilmFrame { time: number; step: string | null; svg: string; png: string }
interface Film { name: string; settings: Record<string, string>; event?: string; path?: string[]; outcome?: unknown; frames: FilmFrame[] }
interface FilmExploration { scenario: number; step: string; from: 'rest' | 'start'; states: number; presentations: number; presses: number; complete: boolean }

/** Actual stage frames, sampled at 200 ms, plus each transition's first and final frames. */
function filmSink(directory: string, prefix: string, generation = '') {
  const frames: FilmFrame[] = [];
  let next = -Infinity, lastStep: string | null = null, last = '';
  const capture = async (scene: Scene, force = false) => {
    const step = scene.currentStep?.path ?? null;
    if (!force && scene.time + 1e-8 < next && step === lastStep) return;
    const svg = withoutHeading(scene, () => toSvgString(scene, {width: 1180, cull: true}));
    if (svg === last && !force) return;
    last = svg; lastStep = step; next = scene.time + 0.2;
    const name = `${prefix}-${String(frames.length).padStart(5, '0')}`;
    await writeFile(join(directory, `${name}.svg`), svg);
    await writeFile(join(directory, `${name}.png`), (await rasterize(svg)).asPng());
    frames.push({time: Math.round(scene.time * 1000) / 1000, step, svg: `${generation}${name}.svg`, png: `${generation}${name}.png`});
  };
  const sink: Sink = {
    async frame(scene) { await capture(scene); },
    async stepEnd(scene) { await capture(scene, true); },
  };
  return {sink, frames, capture};
}

interface LockOwner { token: string; pid: number; host: string; created: number }
const LOCK_OWNER = 'owner.json';

/**
 * Take the publication lock at `lock` (a directory, created atomically). A live holder is waited
 * for, with backoff, up to `wait` ms. A lock is stale, and is removed, when its owner on this host
 * is no longer running, or when it is older than `stale` ms (an owner on another host, or one
 * that died before recording itself). Returns a release that removes the lock only while this
 * call still owns it.
 */
export async function acquirePublishLock(lock: string, { wait = 120_000, stale = 10 * 60_000 }: { wait?: number; stale?: number } = {}): Promise<() => Promise<void>> {
  const owner: LockOwner = { token: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`, pid: process.pid, host: hostname(), created: Date.now() };
  const deadline = Date.now() + wait;
  for (let delay = 50; ; delay = Math.min(delay * 2, 2000)) {
    try {
      await mkdir(lock);
      await writeFile(join(lock, LOCK_OWNER), JSON.stringify(owner));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const judged = await staleLock(lock, stale);
    if (judged) {
      await retire(lock, judged.token, owner.token);
      continue;
    }
    if (Date.now() >= deadline)
      throw new Error(`another rayner film is publishing into ${dirname(lock)} (lock ${lock}); wait for it to finish, or remove the lock if no film is running`);
    await new Promise((done) => setTimeout(done, delay));
  }
  return async () => {
    if (await ownerToken(lock) === owner.token) await rm(lock, { recursive: true, force: true });
  };
}

const ownerToken = (dir: string) => readFile(join(dir, LOCK_OWNER), 'utf8').then((t) => (JSON.parse(t) as Partial<LockOwner>).token, () => undefined);

/** When the lock's holder can no longer release it, the holder's token (undefined if it recorded none); otherwise null. */
async function staleLock(lock: string, stale: number): Promise<{ token: string | undefined } | null> {
  const since = await stat(lock).then((s) => s.mtimeMs, () => undefined);
  // Removed meanwhile: not stale, simply free; the next attempt takes it.
  if (since === undefined) return null;
  const recorded = await readFile(join(lock, LOCK_OWNER), 'utf8').then((t) => JSON.parse(t) as Partial<LockOwner>, () => undefined);
  const judged = { token: recorded?.token };
  const created = typeof recorded?.created === 'number' ? recorded.created : since;
  if (Date.now() - created > stale) return judged;
  // A holder that has just made the directory has not yet written its record: give it time.
  if (!recorded) return Date.now() - since > 30_000 ? judged : null;
  if (recorded.host !== hostname() || typeof recorded.pid !== 'number') return null;
  try { process.kill(recorded.pid, 0); return null; } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? judged : null; }
}

/**
 * Remove the lock judged stale, and only that one. Two waiters can judge the same lock stale; the
 * first retires it and may take a fresh lock before the second acts. Moving the directory aside
 * first and comparing its recorded holder means the second never deletes the first's fresh lock.
 */
async function retire(lock: string, judged: string | undefined, mine: string): Promise<void> {
  const aside = `${lock}.stale-${mine}`;
  try { await rename(lock, aside); } catch { return; }
  if (await ownerToken(aside) === judged) { await rm(aside, { recursive: true, force: true }); return; }
  // A fresh lock was moved: put it back unless someone has taken the name meanwhile.
  await rename(aside, lock).catch(() => rm(aside, { recursive: true, force: true }));
}

/** Film every authored scenario and every accepted/refused event from bounded reachable states.
 * Direct model events avoid UI scrolling and comma-delimited event-label parsing. */
export async function filmProject(project: Project, directory: string): Promise<{films: Film[]; frames: number; explorations: FilmExploration[]}> {
  await useProjectLettering(project);
  const framesDirectory = join(directory, 'frames');
  await mkdir(framesDirectory, {recursive: true});
  const output = await mkdtemp(join(framesDirectory, 'run-'));
  const generation = basename(output) + '/';
  const films: Film[] = [];
  const explorations: FilmExploration[] = [];
  let published = false;
  try {
  for (const [index, scenario] of project.scenarios.entries()) {
    const story = filmSink(output, `scenario-${index}`, generation);
    const scene = await new scenario.Scene(story.sink).run();
    await story.capture(scene, true);
    films.push({name: `Scenario ${index + 1}: authored steps`, settings: scenario.values, frames: story.frames});
    for (const [step, place] of scenario.live ?? []) {
      const resting = await runLive(scenario.Scene, step, place, []);
      const machine = resting.machine, base = logStart(machine, resting.rest);
      if (!base) continue;
      const shown = {...resting.shown};
      if (base.from === 'start' && machine.spec.result) delete shown.result;
      const inventory = pictureInventory(machine, [{state: base.state, shown}]);
      explorations.push({scenario: index, step, from: base.from, states: inventory.states, presentations: inventory.origins.length,
        presses: inventory.edges.length, complete: inventory.complete});
      for (const [edgeIndex, edge] of inventory.edges.entries()) {
        const {event, outcome} = edge, path = picturePath(edge.from);
        const strip = filmSink(output, `scenario-${index}-live-${films.length}-${edgeIndex}`, generation);
        const accepted = 'next' in outcome;
        const log = accepted ? [...path, event] : path;
        const run = await runLive(scenario.Scene, step, place, log, accepted ? {from: base.from, animate: strip.sink} : {from: base.from, sink: strip.sink});
        await strip.capture(run.scene, true);
        films.push({name: `${step}: ${machine.spec.labels?.[event] ?? event}`, settings: scenario.values, event, path,
          outcome, frames: strip.frames});
      }
    }
  }
  const report = {version: 2, generation: basename(output), intervalMs: 200, sourceHash: project.sourceHash, explorations, films};
  await writeFile(join(output, 'film.json.pending'), JSON.stringify(report, null, 2) + '\n');
  const rows = films.map(f => `<section><h2>${htmlEscape(f.name)}</h2><p>${htmlEscape(JSON.stringify({settings:f.settings,path:f.path,outcome:f.outcome}))}</p><div>${f.frames.map(frame => `<figure><a href="frames/${frame.svg}"><img loading="lazy" src="frames/${frame.png}" width="358" alt="${htmlEscape(frame.step ?? f.name)} at ${frame.time} seconds"></a><figcaption>${frame.time}s</figcaption></figure>`).join('')}</div></section>`).join('');
  await writeFile(join(output, 'index.html.pending'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rayner film</title><style>body{font:16px system-ui;margin:24px}section>div{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}img{max-width:100%;height:auto;border:1px solid #888}p{overflow-wrap:anywhere}</style><h1>Motion filmstrips</h1><p>Actual stage frames at 200 ms, including refused events. SVG links retain full resolution. Reachability follows each machine's declared bound and limit.</p>${rows}`);
  // Serialize only publication. A concurrent producer may finish its private generation, then
  // waits while another publisher holds this lock; no invocation removes another's work.
  const release = await acquirePublishLock(join(directory, '.film-publish.lock'));
  try {
    const previous = await readFile(join(directory, 'film.json'), 'utf8').catch(() => undefined);
    const oldIndex = await readFile(join(directory, 'index.html')).catch(() => undefined);
    let indexPublished = false;
    try {
      await rename(join(output, 'index.html.pending'), join(directory, 'index.html'));
      indexPublished = true;
      // The manifest is the commit point: every file it references already exists.
      await rename(join(output, 'film.json.pending'), join(directory, 'film.json'));
      published = true;
    } catch (error) {
      if (indexPublished) {
        if (oldIndex) {
          await writeFile(join(output, 'index.html.rollback'), oldIndex);
          await rename(join(output, 'index.html.rollback'), join(directory, 'index.html'));
        } else await rm(join(directory, 'index.html'), {force: true});
      }
      throw error;
    }
    // Retire only files named by our last successful manifest, never the caller's frames tree.
    if (previous) {
      try {
        const old = JSON.parse(previous) as {version?: number; films?: Film[]};
        if ((old.version === 1 || old.version === 2) && Array.isArray(old.films)) {
          const directories = new Set<string>();
          for (const film of old.films) for (const frame of film.frames ?? []) for (const name of [frame.svg, frame.png]) {
            if (typeof name !== 'string' || !/^(?:run-[A-Za-z0-9]+\/)?[A-Za-z0-9-]+\.(?:svg|png)$/.test(name)) continue;
            const path = resolve(framesDirectory, name);
            if (!path.startsWith(resolve(framesDirectory) + sep) || path.startsWith(resolve(output) + sep)) continue;
            await rm(path, {force: true});
            if (name.includes('/')) directories.add(join(framesDirectory, name.split('/')[0]!));
          }
          for (const dir of directories) await rmdir(dir).catch(() => {});
        }
      } catch { /* A foreign or damaged prior manifest grants no deletion authority. */ }
    }
  } finally { await release(); }
  return {films, explorations, frames: films.reduce((n, f) => n + f.frames.length, 0)};
  } finally { if (!published) await rm(output, {recursive: true, force: true}); }
}

/** Two actual mid-play stage samples per step, before the caption-reading hold. */
export async function midplayFrames(scenario: Project['scenarios'][number], directory: string): Promise<void> {
  for(const file of await readdir(directory)) if(/\.mid[12]\.(?:svg|png)$/.test(file)) await rm(join(directory,file));
  const samples = new Map<number, string[]>();
  for (const step of scenario.trace.steps) for (const [index, fraction] of [1 / 3, 2 / 3].entries()) {
    const end = step.holdFrame ?? step.frame1;
    const frame = step.frame0 + Math.max(1, Math.round((end - step.frame0) * fraction));
    samples.set(frame, [...samples.get(frame) ?? [], `${encodeURIComponent(step.step)}.mid${index + 1}`]);
  }
  await new scenario.Scene({async frame(scene) {
    const names = samples.get(scene.frameCount);
    if (!names) return;
    const svg = withoutHeading(scene, () => toSvgString(scene, {width: 1180, cull: true}));
    const png = (await rasterize(svg)).asPng();
    for (const name of names) {
      await writeFile(join(directory, name + '.svg'), svg);
      await writeFile(join(directory, name + '.png'), png);
    }
  }}).run();
}

/** All retained phone stops plus the two native motion samples, as a browsable contact sheet. */
export async function reviewContactSheet(directory: string): Promise<void> {
  const files = (await readdir(directory)).filter(f => /\.(?:390(?:\.view\d+|\.whole)?|mid[12])\.png$/.test(f)).sort();
  await writeFile(join(directory, 'phone-views.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Phone views and motion</title><style>body{font:16px system-ui;margin:24px}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:358px}img{max-width:100%;height:auto;border:1px solid #888}figcaption{overflow-wrap:anywhere}</style><h1>Phone views and motion</h1><p>390 px images are actual served-reader screenshots, including every tour stop and Whole picture. Mid-play images are native stage samples before the caption hold; they do not test browser chrome or CSS. Framed screenshots have their own contact sheet in framed/.</p><main>${files.map(f => `<figure><a href="${encodeURIComponent(f)}"><img loading="lazy" src="${encodeURIComponent(f)}" alt="${htmlEscape(decodeURIComponent(f))}"></a><figcaption>${htmlEscape(decodeURIComponent(f))}</figcaption></figure>`).join('')}</main>`);
}
